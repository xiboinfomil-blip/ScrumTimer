"""Postponed/late-vote browser contracts; all APIs mocked, no live Neon writes.

Run only against a current localhost:3000 app. Countdown time is controlled via
Date.now, while native timers/RAF and new Date (archive timestamps) stay real.
"""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import re
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

BASE = 'http://localhost:3000'
TEAM_ID = 'a' * 64
SIZES = [(320, 568), (1366, 768)]
ORIGINAL = {'meterId': 'original', 'title': 'Baromètre original'}
INIT = """
for (const name of ['localStorage', 'sessionStorage']) {
    Object.defineProperty(window, name, {get() {
        throw new Error('Browser storage forbidden');
    }});
}
window.__smokeNow = Date.now();
Date.now = () => window.__smokeNow;
"""


class WorkspaceMock:
    def __init__(self):
        self.team = {
            'roster': [{'id': name.lower(), 'name': name, 'present': True,
                        'mood': None, 'moodUpdatedAt': None, 'moodSlide': None}
                       for name in ['Alice', 'Bob']],
            'session': [], 'postponed': [], 'duration': 120, 'warning': 0,
            'sound': False, 'usedMoodMeters': [], 'currentMoodSlide': None,
        }
        self.revision = 1
        self.day = (datetime.now(timezone.utc) + timedelta(hours=4)).date().isoformat()
        self.daily = None
        self.daily_posts = []
        self.writes = []
        self.history_posts = []
        self.rounds = []
        self.requests = []
        self.unexpected = []

    def api(self, route):
        request = route.request
        path, method = urlparse(request.url).path, request.method
        self.requests.append((path, method))
        # Catch-all registered before navigation: no unknown API falls through.
        allowed = {'/api/teams': {'GET'}, '/api/team': {'GET', 'PUT'},
                   '/api/history': {'GET', 'POST'},
                   '/api/daily-meter': {'GET', 'POST'},
                   '/api/mood-meters/catalog': {'GET'}}
        if method not in allowed.get(path, set()):
            self.unexpected.append((method, path))
            route.fulfill(status=501, json={'error': 'Unmocked API blocked'})
            return
        if path == '/api/mood-meters/catalog':
            route.fulfill(json=[])
            return
        if path == '/api/teams':
            route.fulfill(json={'teams': [{'id': TEAM_ID, 'name': 'Mon équipe',
                                          'memberCount': 2}], 'activeTeamId': TEAM_ID})
            return
        assert request.headers.get('x-team-id') == TEAM_ID, (method, path)
        if path == '/api/team':
            if method == 'GET':
                route.fulfill(json={'team': deepcopy(self.team), 'revision': self.revision})
            else:
                body = deepcopy(request.post_data_json)
                if body['revision'] != self.revision:
                    route.fulfill(status=409, json={})
                    return
                self.writes.append(body)
                # Match existing smoke mocks: lineup/progress are transient.
                self.team = {**body['team'], 'session': [], 'currentMoodSlide': None}
                self.revision += 1
                route.fulfill(json={'revision': self.revision})
        elif path == '/api/daily-meter':
            if method == 'POST':
                candidate = deepcopy(request.post_data_json)
                assert candidate == ORIGINAL, candidate
                self.daily_posts.append(candidate)
                if self.daily is None:
                    self.daily = candidate
            route.fulfill(json={'day': self.day, 'meter': deepcopy(self.daily)})
        else:
            if method == 'POST':
                body = deepcopy(request.post_data_json)
                # Count requests as well as unique rounds: idempotent storage
                # must not hide duplicate archive submissions by the UI.
                self.history_posts.append(body)
                if not any(item['id'] == body['id'] for item in self.rounds):
                    self.rounds.append(body)
                route.fulfill(json={'saved': True})
            else:
                route.fulfill(json={'rounds': deepcopy(self.rounds)})


def saved(page):
    page.wait_for_function("document.querySelector('.site-header [role=status]')?.title === 'Équipe enregistrée dans Neon.'")


def advance(page, seconds):
    page.evaluate("""seconds => {
        window.__smokeNow += seconds * 1000;
        document.dispatchEvent(new Event('visibilitychange'));
    }""", seconds)


def geometry(page, width, height, controls=()):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
    for control in controls:
        expect(control).to_be_visible()
        box = control.bounding_box()
        assert box and box['height'] >= 44 - 0.5, (width, 'target height', box)
        assert box['x'] >= -0.5 and box['x'] + box['width'] <= width + 1, (width, box)
        assert box['y'] >= -0.5 and box['y'] + box['height'] <= height + 1, (height, box)


def team_view(page, width):
    if width <= 800:
        page.get_by_role('group', name='Panneau du minuteur', exact=True).get_by_role(
            'button', name='Participants', exact=True).click()


def timer_view(page, width):
    if width <= 800:
        page.get_by_role('group', name='Panneau du minuteur', exact=True).get_by_role(
            'button', name='Minuteur', exact=True).click()


def no_archive(page, db):
    assert not db.history_posts and not db.rounds
    expect(page.locator('#timer-page')).not_to_have_attribute('data-mode', 'results')
    expect(page.get_by_role('heading', name='Bilan du tour', exact=True)).to_have_count(0)
    expect(page.locator('.session-complete')).to_have_count(0)
    expect(page.get_by_role('region', name='Point quotidien du jour', exact=True)).to_have_count(0)


def run_case(browser, width, height):
    context = browser.new_context(viewport={'width': width, 'height': height},
                                  reduced_motion='reduce', service_workers='block')
    context.add_init_script(INIT)
    db = WorkspaceMock()
    context.route('**/api/**', db.api)
    context.route('**/mood-meters/catalog.json', lambda route: route.fulfill(json={'remote': True}))
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    try:
        page.goto(BASE + '/participants')
        saved(page)
        expect(page.get_by_text('Alice', exact=True)).to_be_visible()
        assert all(person['present'] and person['mood'] is None for person in db.team['roster'])
        page.get_by_role('link', name='Humeurs', exact=True).click()
        expect(page.locator('#meter-catalogue-select')).to_have_value('-2')
        expect(page.locator('#meter-catalogue-select')).to_be_enabled()
        expect(page.locator('#random-meter-button')).to_be_enabled()
        expect(page.locator('#daily-meter-note')).to_contain_text('Choisissez dans la liste avant le premier vote')
        assert db.daily == ORIGINAL and db.daily_posts == [ORIGINAL]
        if width <= 800:
            page.get_by_role('group', name='Panneau du bilan', exact=True).get_by_role(
                'button', name='Humeurs de l’équipe', exact=True).click()
        continue_button = page.get_by_role('button', name='Continuer vers le minuteur', exact=False)
        expect(continue_button).to_be_disabled()
        alice_vote = page.get_by_role('button', name='Humeur 2 pour Alice', exact=True)
        alice_vote.click()
        saved(page)
        expect(alice_vote).to_have_attribute('aria-pressed', 'true')
        expect(page.locator('#meter-catalogue-select')).to_be_disabled()
        expect(page.locator('#random-meter-button')).to_be_disabled()
        expect(page.locator('#daily-meter-note')).to_contain_text('Verrouillé après le premier vote')
        expect(continue_button).to_be_disabled()
        if width <= 800:
            page.get_by_role('navigation', name='Pages de la liste').get_by_role('button', name='Page suivante').click()
        postpone = page.get_by_role('button', name='Reporter l’humeur et le passage de Bob', exact=True)
        expect(postpone).to_have_text('Plus tard')
        postpone.click()
        saved(page)
        expect(postpone).to_have_attribute('aria-pressed', 'true')
        expect(continue_button).to_be_enabled()
        bob = next(person for person in db.team['roster'] if person['id'] == 'bob')
        assert bob['present'] and bob['mood'] is None and db.team['postponed'] == ['bob']
        geometry(page, width, height, [postpone, continue_button])
        continue_button.click()
        expect(page.locator('#speaker-name')).to_have_text('Alice')
        page.get_by_role('button', name='Démarrer', exact=True).click()
        expect(page.locator('#status-pill')).to_have_attribute('data-status', 'À la parole')
        expect(page.locator('#upcoming-speaker')).to_have_text('Fin du tour')
        advance(page, 5)
        expect(page.locator('#timer-display')).to_have_text('01:55')
        geometry(page, width, height, [page.locator('#start-button'),
                                      page.locator('#next-button'), page.locator('#manage-timer-button')])

        # Speaking mode hides the sidebar: late votes must remain reachable in Modifier.
        page.locator('#manage-timer-button').click()
        dialog = page.get_by_role('dialog', name='Modifier le minuteur', exact=True)
        expect(dialog).to_be_visible()
        expect(page.locator('#status-pill')).to_have_attribute('data-status', 'En pause')
        late_vote = dialog.get_by_role('button', name='Humeur 3 et rejoindre pour Bob', exact=True)
        expect(dialog.get_by_role('group', name='Humeur différée de Bob', exact=True).get_by_role('button')).to_have_count(4)
        expect(late_vote).to_be_enabled()
        late_vote.scroll_into_view_if_needed()
        geometry(page, width, height, [late_vote])
        advance(page, 15)
        expect(page.locator('#timer-display')).to_have_text('01:55')
        late_vote.click()
        saved(page)
        expect(dialog.get_by_role('region', name='Personnes en attente', exact=True)).to_have_count(0)
        expect(page.locator('#speaker-name')).to_have_text('Alice')
        expect(page.locator('#upcoming-speaker')).to_have_text('Bob')
        expect(page.locator('#timer-display')).to_have_text('01:55')
        bob = next(person for person in db.team['roster'] if person['id'] == 'bob')
        assert bob['present'] and bob['mood'] == 3 and bob['moodUpdatedAt'] and not db.team['postponed']
        dialog.get_by_role('button', name='Fermer les réglages', exact=True).click()
        expect(dialog).not_to_be_visible()
        expect(page.get_by_role('button', name='Reprendre', exact=True)).to_be_enabled()
        advance(page, 10)
        expect(page.locator('#timer-display')).to_have_text('01:55')
        no_archive(page, db)
        page.get_by_role('button', name='Reprendre', exact=True).click()
        advance(page, 3)
        expect(page.locator('#timer-display')).to_have_text('01:52')
        page.locator('#next-button').click()
        expect(page.locator('#speaker-name')).to_have_text('Bob')
        expect(page.locator('#status-pill')).to_have_attribute('data-status', 'À la parole')
        expect(page.locator('#start-button')).to_contain_text('Pause')
        advance(page, 4)
        expect(page.locator('#timer-display')).to_have_text('01:56')
        page.locator('.timer-panel').get_by_role('button', name='Reporter le passage de Bob', exact=True).click()

        # Alice is done, Bob is still present/pending: this is NOT completion.
        expect(page.locator('#status-pill')).to_have_attribute('data-status', 'Personnes en attente')
        expect(page.locator('#speaker-name')).to_have_text('En attente des personnes reportées')
        expect(page.locator('#start-button')).to_be_disabled()
        expect(page.locator('#next-button')).to_be_disabled()
        no_archive(page, db)
        advance(page, 20)
        team_view(page, width)
        expect(page.locator('#done-count')).to_have_text('1 / 2 passage terminé')
        expect(page.get_by_role('progressbar', name='Passages terminés', exact=True)).to_have_attribute('aria-valuenow', '1')
        expect(page.locator('[data-person-id="alice"]')).to_have_class(re.compile(r'\bdone\b'))
        expect(page.locator('[data-person-id="bob"]')).to_have_count(0)
        pending = page.get_by_role('region', name='Personnes en attente', exact=True)
        expect(pending.get_by_text('Bob', exact=True)).to_be_visible()
        rejoin = pending.get_by_role('button', name='Reprendre le passage de Bob', exact=True)
        expect(rejoin).to_be_enabled()
        geometry(page, width, height, [rejoin])
        no_archive(page, db)
        rejoin.click()
        saved(page)
        expect(pending).to_have_count(0)
        expect(page.locator('#done-count')).to_have_text('1 / 2 passage terminé')
        timer_view(page, width)
        expect(page.locator('#speaker-name')).to_have_text('Bob')
        expect(page.locator('#status-pill')).to_have_attribute('data-status', 'Prêt à démarrer')
        expect(page.locator('#timer-display')).to_have_text('02:00')
        advance(page, 10)
        expect(page.locator('#timer-display')).to_have_text('02:00')
        no_archive(page, db)
        page.get_by_role('button', name='Démarrer', exact=True).click()
        advance(page, 6)
        page.locator('#next-button').click()
        daily_round = page.get_by_role('region', name='Point quotidien du jour', exact=True)
        expect(daily_round).to_be_visible()
        expect(daily_round.get_by_text('Point quotidien terminé aujourd’hui', exact=True)).to_be_visible()
        saved(page)
        assert len(db.history_posts) == len(db.rounds) == 1
        archived = deepcopy(db.rounds[0])
        people = {person['id']: person for person in archived['people']}
        assert set(people) == {'alice', 'bob'}
        assert people['alice']['speakingSeconds'] == 8, people
        assert people['bob']['speakingSeconds'] == 10, people
        assert people['alice']['mood'] == 2 and people['bob']['mood'] == 3
        assert all(person['budgetSeconds'] == 120 and not person['timeUp'] for person in people.values())
        view_results = daily_round.get_by_role('button', name='Voir le bilan du jour', exact=True)
        geometry(page, width, height, [view_results])
        # Handoff shortcut with no active speaker and results rerenders must not archive again.
        page.locator('#main-content').focus()
        page.keyboard.press('n')
        advance(page, 30)
        view_results.click()
        expect(daily_round.get_by_role('heading', name='Bilan enregistré · Classement', exact=True)).to_be_visible()
        ranking = daily_round.locator('[data-dashboard-column="scores"]')
        expect(ranking.get_by_text('Alice', exact=True)).to_be_visible()
        expect(ranking.get_by_text('00:08 / 02:00', exact=True)).to_be_visible()
        if width <= 800:
            ranking.get_by_role('navigation', name='Pages de la liste').get_by_role('button', name='Page suivante').click()
        expect(ranking.get_by_text('Bob', exact=True)).to_be_visible()
        expect(ranking.get_by_text('00:10 / 02:00', exact=True)).to_be_visible()
        daily_round.get_by_role('button', name='Masquer le bilan', exact=True).click()
        saved(page)
        assert db.history_posts == [archived] and db.rounds == [archived]
        assert db.writes and not db.unexpected, db.unexpected
        assert db.daily_posts == [ORIGINAL]
        assert not errors, errors
        print(f'PASS: {width}x{height} original daily meter, late vote via paused Modifier, '
              'Alice progress retained, Bob postponed/waiting/rejoined, exactly one archive; mocked APIs only')
    finally:
        context.close()


if __name__ == '__main__':
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            for width, height in SIZES:
                run_case(browser, width, height)
        finally:
            browser.close()