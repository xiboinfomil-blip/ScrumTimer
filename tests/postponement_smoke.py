"""Postponed/late-vote browser contracts; all APIs mocked, no live Neon writes.

Run against a current local app (BROWSER_TEST_URL overrides localhost:3000). Countdown time is controlled via
Date.now, while native timers/RAF and new Date (archive timestamps) stay real.
"""
from copy import deepcopy
import os
from datetime import datetime, timedelta, timezone
import re
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright
from fullscreen_helpers import emulate_fullscreen

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3000').rstrip('/')
TEAM_ID = 'a' * 64
SIZES = [(320, 568), (1366, 768)]
ORIGINAL = {'meterId': 'original', 'title': 'Baromètre original'}
REMOTE_SLIDES = ['mood-meters/slides/test/page-1.svg',
                 'mood-meters/slides/test/page-2.svg']
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
    def __init__(self, remote=False):
        self.remote = remote
        self.meter = {'meterId': 'deck-1234567890abcdef1234', 'title': 'Même baromètre'} if remote else ORIGINAL
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
                   '/api/daily-hints': {'GET'}, '/api/meeting-settings': {'GET'},
                   '/api/mood-meters/catalog': {'GET'}}
        if path == '/api/mood-meters/decks/deck-1234567890abcdef1234' and method == 'GET':
            route.fulfill(json={'title': 'Même baromètre', 'slides': REMOTE_SLIDES})
            return
        if method not in allowed.get(path, set()):
            self.unexpected.append((method, path))
            route.fulfill(status=501, json={'error': 'Unmocked API blocked'})
            return
        if path == '/api/mood-meters/catalog':
            route.fulfill(json=[{'title': 'Même baromètre', 'remoteId': self.meter['meterId'], 'slides': []}] if self.remote else [])
            return
        if path == '/api/teams':
            route.fulfill(json={'teams': [{'id': TEAM_ID, 'name': 'Mon équipe',
                                          'memberCount': 2}], 'activeTeamId': TEAM_ID})
            return
        assert request.headers.get('x-team-id') == TEAM_ID, (method, path)
        if path == '/api/daily-hints':
            route.fulfill(json={'day': self.day, 'hints': []})
        elif path == '/api/meeting-settings':
            route.fulfill(json={'prompts': [], 'revision': 0})
        elif path == '/api/team':
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
                assert candidate == self.meter, candidate
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
    page.get_by_role('button', name='Voir le tour de parole', exact=True).click()
    expect(page.get_by_role('dialog', name='Le tour de parole', exact=True)).to_be_visible()


def timer_view(page, width):
    lineup = page.get_by_role('dialog', name='Le tour de parole', exact=True)
    if lineup.is_visible():
        lineup.get_by_role('button', name='Revenir au passage', exact=True).click()
        expect(lineup).not_to_be_visible()
    if width <= 800:
        page.get_by_role('group', name='Panneau du minuteur', exact=True).get_by_role(
            'button', name='Minuteur', exact=True).click()


def open_late_checkin(page, db, source, meter_value):
    timer_url = page.url
    assert urlparse(timer_url).path == '/timer', timer_url
    source.get_by_role('button', name='Renseigner les humeurs', exact=True).click()
    modal = page.get_by_role('dialog', name='Un instant pour votre humeur', exact=True)
    expect(modal).to_be_visible()
    expect(source).not_to_be_visible()
    expect(page).to_have_url(timer_url)
    expect(modal.locator('#meter-catalogue-select')).to_have_value(meter_value)
    expect(modal.locator('#meter-catalogue-select')).to_be_disabled()
    expect(modal.locator('#random-meter-button')).to_be_disabled()
    expect(modal.get_by_role('button', name='Humeurs de l’équipe', exact=True)).to_have_count(0)
    expect(modal.get_by_role('button', name='Humeur 2 pour Alice', exact=True)).to_have_count(0)
    expect(modal.get_by_role('button', name='Humeur 3 pour Bob', exact=True)).to_be_enabled()
    enlarge = modal.get_by_role('button', name='Afficher le baromètre en plein écran', exact=True)
    geometry(page, page.viewport_size['width'], page.viewport_size['height'], [enlarge])
    assert modal.locator('.late-checkin-list').evaluate('el => el.scrollHeight <= el.clientHeight + 2'), 'Late voting controls must not be clipped'
    if db.remote:
        stack = modal.locator('#meter-slide-stack')
        expect(stack.locator('img')).to_have_count(2)
        for path in REMOTE_SLIDES:
            image = stack.locator(f'img[src="/{path}"]')
            expect(image).to_be_attached()
            expect(image).to_have_js_property('complete', True)
            expect(image).not_to_have_js_property('naturalWidth', 0)
        page.evaluate('async () => { for (let i=0; i<3; i++) await new Promise(requestAnimationFrame); }')
        images = stack.locator('img')
        geometry(page, page.viewport_size['width'], page.viewport_size['height'], [enlarge, images.nth(0)])
        size = stack.evaluate('el => ({height: el.clientHeight, scroll: el.scrollHeight})')
        assert size['scroll'] <= size['height'] + 2, ('flip surface must not add vertical scrolling', size)
        layout = stack.evaluate('''el => {
            const rect = node => {const r = node.getBoundingClientRect();
                return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
            return {stack:rect(el), images:[...el.querySelectorAll('img')].map(rect)};
        }''')
        for image in layout['images']:
            assert image['left'] >= layout['stack']['left'] - 1 and image['right'] <= layout['stack']['right'] + 1, layout
            assert image['top'] >= layout['stack']['top'] - 1 and image['bottom'] <= layout['stack']['bottom'] + 1, layout
        first, second = layout['images']
        assert abs(first['top'] - second['top']) <= 1 and abs(first['left'] - second['left']) <= 1, ('flip faces should overlap', layout)
        page.screenshot(path=os.path.join(os.environ.get('TEMP', '.'), f"scrum-late-modal-{page.viewport_size['width']}.png"))
    assert db.daily == db.meter and db.daily_posts == [db.meter], 'late modal must not reassign the daily meter'
    no_archive(page, db)
    return modal, timer_url


def close_late_checkin(page, db, modal, timer_url):
    modal.get_by_role('button', name='Revenir au tour', exact=True).click()
    expect(modal).not_to_be_visible()
    expect(page).to_have_url(timer_url)
    assert db.daily == db.meter and db.daily_posts == [db.meter]


def no_archive(page, db):
    assert not db.history_posts and not db.rounds
    expect(page.locator('#timer-page')).not_to_have_attribute('data-mode', 'results')
    expect(page.get_by_role('heading', name='Bilan du tour', exact=True)).to_have_count(0)
    expect(page.locator('.session-complete')).to_have_count(0)
    expect(page.get_by_role('region', name='Point quotidien du jour', exact=True)).to_have_count(0)


def run_case(browser, width, height, skip=False, late_at_end=False, remote=False):
    context = browser.new_context(viewport={'width': width, 'height': height},
                                  reduced_motion='reduce', service_workers='block')
    emulate_fullscreen(context)
    context.add_init_script(INIT)
    db = WorkspaceMock(remote)
    meter_value = '0' if remote else '-2'
    context.route('**/api/**', db.api)
    context.route('**/mood-meters/catalog.json', lambda route: route.fulfill(json={'remote': True}))
    context.route('**/mood-meters/slides/**/*.svg', lambda route: route.fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>'))
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    try:
        page.goto(BASE + '/participants')
        saved(page)
        expect(page.get_by_text('Alice', exact=True)).to_be_visible()
        assert all(person['present'] and person['mood'] is None for person in db.team['roster'])
        page.get_by_role('link', name='Humeurs', exact=True).click()
        expect(page.locator('#meter-catalogue-select')).to_have_value(meter_value)
        expect(page.locator('#meter-catalogue-select')).to_be_enabled()
        expect(page.locator('#random-meter-button')).to_be_enabled()
        expect(page.locator('#daily-meter-note')).to_contain_text('Modifiable avant le premier vote')
        assert db.daily == db.meter and db.daily_posts == [db.meter]
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

        if late_at_end:
            advance(page, 115)
            expect(page.locator('#status-pill')).to_have_attribute('data-status', 'Temps écoulé')
            expect(page.get_by_role('dialog', name='Faire passer les personnes reportées ?', exact=True)).not_to_be_visible()
            no_archive(page, db)
            page.locator('#next-button').click()
            choice = page.get_by_role('dialog', name='Faire passer les personnes reportées ?', exact=True)
            expect(choice).to_be_visible()
            modal, timer_url = open_late_checkin(page, db, choice, meter_value)
            late_vote = modal.get_by_role('button', name='Humeur 4 pour Bob', exact=True)
            late_vote.scroll_into_view_if_needed()
            geometry(page, width, height, [late_vote])
            idle_time = page.locator('#timer-display').inner_text()
            advance(page, 15)
            expect(page.locator('#timer-display')).to_have_text(idle_time)
            late_vote.click()
            saved(page)
            close_late_checkin(page, db, modal, timer_url)
            expect(choice).not_to_be_visible()
            expect(page.locator('#speaker-name')).to_have_text('Bob')
            expect(page.locator('#status-pill')).to_have_attribute('data-status', 'Prêt à démarrer')
            no_archive(page, db)
            page.get_by_role('button', name='Démarrer', exact=True).click()
            advance(page, 6)
            page.locator('#next-button').click()
            expect(page.get_by_role('region', name='Point quotidien du jour', exact=True)).to_be_visible()
            saved(page)
            assert len(db.history_posts) == 1
            assert {person['id']: person['mood'] for person in db.rounds[0]['people']} == {'alice': 2, 'bob': 4}
            assert db.daily_posts == [db.meter], 'return must not assign a different meter'
            if remote:
                assert all(person['meterTitle'] == 'Même baromètre' for person in db.rounds[0]['people'])
            assert not db.unexpected and not errors, (db.unexpected, errors)
            print(f'PASS: {width}x{height} no automatic advance at expiry, late mood and present from final choice')
            return

        # Speaking mode hides the sidebar: late votes must remain reachable in Modifier.
        page.locator('#manage-timer-button').click()
        dialog = page.get_by_role('dialog', name='Modifier le minuteur', exact=True)
        expect(dialog).to_be_visible()
        expect(page.locator('#status-pill')).to_have_attribute('data-status', 'En pause')
        modal, timer_url = open_late_checkin(page, db, dialog, meter_value)
        late_vote = modal.get_by_role('button', name='Humeur 3 pour Bob', exact=True)
        geometry(page, width, height, [late_vote])
        advance(page, 15)
        expect(page.locator('#timer-display')).to_have_text('01:55')
        late_vote.click()
        saved(page)
        close_late_checkin(page, db, modal, timer_url)
        expect(page.locator('#speaker-name')).to_have_text('Alice')
        expect(page.locator('#upcoming-speaker')).to_have_text('Bob')
        expect(page.locator('#timer-display')).to_have_text('01:55')
        bob = next(person for person in db.team['roster'] if person['id'] == 'bob')
        assert bob['present'] and bob['mood'] == 3 and bob['moodUpdatedAt'] and not db.team['postponed']
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
        choice = page.get_by_role('dialog', name='Faire passer les personnes reportées ?', exact=True)
        expect(choice).to_be_visible()
        finish = choice.get_by_role('button', name='Terminer sans les personnes en attente', exact=True)
        geometry(page, width, height, [finish])
        if skip:
            finish.click()
            daily_round = page.get_by_role('region', name='Point quotidien du jour', exact=True)
            expect(daily_round).to_be_visible()
            saved(page)
            assert len(db.history_posts) == len(db.rounds) == 1
            assert [person['id'] for person in db.rounds[0]['people']] == ['alice']
            assert db.rounds[0]['people'][0]['speakingSeconds'] == 8
            assert next(person for person in db.team['roster'] if person['id'] == 'bob')['present']
            page.locator('#main-content').focus()
            page.keyboard.press('n')
            advance(page, 30)
            assert len(db.history_posts) == 1
            assert not db.unexpected and not errors, (db.unexpected, errors)
            print(f'PASS: {width}x{height} explicit finish without postponed Bob, only Alice archived once')
            return
        advance(page, 20)
        rejoin = choice.get_by_role('button', name='Renseigner les humeurs', exact=True)
        expect(rejoin).to_be_enabled()
        geometry(page, width, height, [rejoin])
        no_archive(page, db)
        modal, timer_url = open_late_checkin(page, db, choice, meter_value)
        modal.get_by_role('button', name='Humeur 3 pour Bob', exact=True).click()
        saved(page)
        close_late_checkin(page, db, modal, timer_url)
        expect(choice).not_to_be_visible()
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
        assert db.daily_posts == [db.meter]
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
                run_case(browser, width, height, skip=True)
                run_case(browser, width, height, late_at_end=True)
                run_case(browser, width, height, late_at_end=True, remote=True)
        finally:
            browser.close()