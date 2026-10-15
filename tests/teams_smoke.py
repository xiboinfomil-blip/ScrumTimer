"""Multiteam/day browser contracts with stateful APIs; never touches live Neon."""
import os
import re
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3000')
SIZES = [(320, 568), (390, 844), (768, 1024), (1024, 576), (1366, 768), (1920, 1080)]
DEFAULT_ID, CREATED_ID = 'a' * 64, 'b' * 64
USED_ID, NEW_ID = 'deck-1234567890abcdef1234', 'deck-abcdef1234567890abcd'
CATALOG = [{'title': 'Used meter', 'remoteId': USED_ID, 'slides': []},
           {'title': 'New meter', 'remoteId': NEW_ID, 'slides': []}]
YESTERDAY = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
NO_STORAGE = """for (const name of ['localStorage', 'sessionStorage']) Object.defineProperty(window, name, {get() { throw new Error('Browser storage forbidden'); }});"""


def empty_team():
    return {'roster': [], 'session': [], 'duration': 120, 'warning': 30,
            'sound': False, 'usedMoodMeters': [], 'currentMoodSlide': None}


class WorkspaceMock:
    def __init__(self):
        initial = empty_team()
        initial['roster'] = [{'id': 'alice', 'name': 'Alice <safe>', 'present': True,
                              'mood': None, 'moodUpdatedAt': None}]
        initial['usedMoodMeters'] = [USED_ID]
        self.teams = {DEFAULT_ID: {'name': 'Mon équipe', 'team': initial, 'revision': 1}}
        self.active = DEFAULT_ID
        # Keep mocked day independent of the browser's timezone (Mauritius UTC+4).
        self.day = (datetime.now(timezone.utc) + timedelta(hours=4)).date().isoformat()
        self.daily = {}
        self.requests = []
        self.daily_posts = []
        self.daily_patches = []
        self.rounds = {DEFAULT_ID: [{
            'id': 'alice-history', 'completedAt': YESTERDAY,
            'people': [{'id': 'alice', 'name': 'Alice <safe>', 'mood': 2,
                        'speakingSeconds': 30, 'budgetSeconds': 120, 'timeUp': False,
                        'score': 900, 'meterTitle': 'Used meter'}],
        }]}

    def team_list(self):
        return {'teams': [{'id': key, 'name': value['name'],
                           'memberCount': len(value['team']['roster'])}
                          for key, value in self.teams.items()], 'activeTeamId': self.active}

    def api(self, route):
        request = route.request
        path, method = urlparse(request.url).path, request.method
        team_id = request.headers.get('x-team-id')
        self.requests.append((path, method, team_id))
        if path == '/api/teams':
            if method == 'POST':
                body = request.post_data_json
                assert body == {'name': 'Équipe Bêta'}
                assert CREATED_ID not in self.teams
                self.teams[CREATED_ID] = {'name': body['name'], 'team': empty_team(), 'revision': 0}
                self.rounds[CREATED_ID] = []
                self.active = CREATED_ID
            elif method == 'PATCH':
                self.active = request.post_data_json['teamId']
                assert self.active in self.teams
            else:
                assert method == 'GET'
            route.fulfill(json=self.team_list())
            return
        # Missing/invalid explicit headers must never silently use another team.
        assert team_id in self.teams, (path, method, team_id)
        if path == '/api/team':
            saved = self.teams[team_id]
            if method == 'GET':
                route.fulfill(json={'team': deepcopy(saved['team']), 'revision': saved['revision']})
            else:
                assert method == 'PUT'
                body = request.post_data_json
                if body['revision'] != saved['revision']:
                    route.fulfill(status=409, json={})
                    return
                saved['team'] = {**deepcopy(body['team']), 'session': [], 'currentMoodSlide': None}
                saved['revision'] += 1
                route.fulfill(json={'revision': saved['revision']})
        elif path == '/api/history':
            rounds = self.rounds[team_id]
            if method == 'POST':
                body = deepcopy(request.post_data_json)
                if not any(item['id'] == body['id'] for item in rounds):
                    rounds.append(body)
                route.fulfill(json={'saved': True})
            else:
                assert method == 'GET'
                route.fulfill(json={'rounds': deepcopy(rounds), 'day': self.day})
        elif path == '/api/daily-meter':
            key = (team_id, self.day)
            if method in ('POST', 'PATCH'):
                candidate = deepcopy(request.post_data_json)
                allowed = {USED_ID: 'Used meter', NEW_ID: 'New meter', 'original': 'Baromètre original'}
                assert candidate == {'meterId': candidate['meterId'], 'title': allowed[candidate['meterId']]}
                if method == 'POST':
                    self.daily_posts.append((team_id, self.day, candidate))
                    self.daily.setdefault(key, candidate)
                else:
                    assert key in self.daily
                    assert not any(person['mood'] is not None for person in self.teams[team_id]['team']['roster'])
                    self.daily_patches.append((team_id, self.day, candidate))
                    self.daily[key] = candidate
            else:
                assert method == 'GET'
            route.fulfill(json={'day': self.day, 'meter': deepcopy(self.daily.get(key))})
        else:
            # Block unexpected API traffic rather than letting it reach live Neon.
            raise AssertionError(f'Unmocked API: {method} {path}')


def saved(page):
    page.wait_for_function("document.querySelector('.site-header [role=status]')?.title === 'Équipe enregistrée dans Neon.'")


def switcher(page, name):
    return page.get_by_role('button', name=f'Choisir une équipe : {name}', exact=True)


def people_panel(page, width):
    if width <= 800:
        page.get_by_role('group', name='Panneau du bilan', exact=True).get_by_role('button', name='Humeurs de l’équipe', exact=True).click()


def meter_locked(page, meter, day):
    select = page.locator('#meter-catalogue-select')
    expect(select).to_be_disabled()
    expect(select.locator('option:checked')).to_contain_text(meter['title'])
    expect(page.locator('#random-meter-button')).to_be_disabled()
    expect(page.locator('#daily-meter-note')).to_contain_text(day)
    expect(page.locator('#daily-meter-note')).to_contain_text('Verrouillé après le premier vote')


def meter_editable(page, day):
    expect(page.locator('#meter-catalogue-select')).to_be_enabled()
    expect(page.get_by_role('button', name='Afficher un autre baromètre au hasard', exact=True)).to_be_enabled()
    expect(page.locator('#daily-meter-note')).to_contain_text(day)
    expect(page.locator('#daily-meter-note')).to_contain_text('Choisissez dans la liste avant le premier vote')


def choose_team(page, current, target, query, width):
    switcher(page, current).click()
    panel = page.get_by_role('region', name='Choisir ou créer une équipe', exact=True)
    expect(panel).to_be_visible()
    box = panel.bounding_box()
    assert box and box['x'] >= 0 and box['x'] + box['width'] <= width + 1, (width, box)
    search = panel.get_by_role('searchbox', name='Rechercher une équipe', exact=True)
    expect(search).to_be_focused()
    search.fill('introuvable')
    expect(panel.get_by_text('Aucune équipe trouvée.', exact=True)).to_be_visible()
    search.fill(query)
    choices = panel.get_by_role('list', name='Équipes', exact=True).get_by_role('button')
    expect(choices).to_have_count(1)
    expect(choices.first).to_contain_text(target)
    choices.first.click()
    expect(panel).to_have_count(0)
    expect(switcher(page, target)).to_be_enabled()
    expect(page).to_have_url(re.compile(r'/participants$'))
    saved(page)


with sync_playwright() as p:
    browser = p.chromium.launch()
    for width, height in SIZES:
        context = browser.new_context(viewport={'width': width, 'height': height}, reduced_motion='reduce', service_workers='block')
        context.add_init_script(NO_STORAGE)
        db = WorkspaceMock()
        context.route('**/api/**', db.api)
        context.route('**/mood-meters/catalog.json', lambda route: route.fulfill(json={'remote': True}))
        context.route('**/api/mood-meters/catalog', lambda route: route.fulfill(json=CATALOG))
        context.route('**/api/mood-meters/decks/*', lambda route: route.fulfill(json={
            'title': 'Mock slides', 'slides': [f'mood-meters/slides/{route.request.url.rsplit("/", 1)[-1]}/page1.svg']}))
        context.route('**/mood-meters/slides/**/*.svg', lambda route: route.fulfill(
            content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#eaf2fa"/></svg>'))
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE + '/participants')
        saved(page)
        expect(page.get_by_text('Alice <safe>', exact=True)).to_be_visible()
        expect(switcher(page, 'Mon équipe').get_by_label('1 membres', exact=True)).to_have_count(1)
        nav = page.get_by_role('navigation', name='Navigation du point quotidien', exact=True)
        expect(nav.get_by_role('link', name='Participants', exact=True)).to_have_attribute('aria-current', 'page')
        expect(nav.get_by_role('link', name='Humeurs', exact=True)).to_be_visible()
        expect(nav.get_by_role('button', name=re.compile('^Minuteur —'))).to_be_disabled()
        page.get_by_role('link', name='Humeurs', exact=True).click()
        expect(page.locator('#meter-catalogue-select')).to_have_value('0')
        first_meter = deepcopy(db.daily[(DEFAULT_ID, db.day)])
        assert first_meter == {'meterId': NEW_ID, 'title': 'New meter'}
        meter_editable(page, db.day)
        # Selection changes are mocked PATCHes, persist on reload, and do not
        # replace the single daily assignment POST or create a historical round.
        page.locator('#meter-catalogue-select').select_option('-2')
        meter_editable(page, db.day)
        assert db.daily[(DEFAULT_ID, db.day)] == {'meterId': 'original', 'title': 'Baromètre original'}
        page.reload()
        expect(page.locator('#meter-catalogue-select')).to_have_value('-2')
        meter_editable(page, db.day)
        page.locator('#meter-catalogue-select').select_option('0')
        meter_editable(page, db.day)
        assert db.daily[(DEFAULT_ID, db.day)] == first_meter
        assert len(db.daily_patches) == 2
        people_panel(page, width)
        page.get_by_role('button', name='Humeur 2 pour Alice <safe>', exact=True).click()
        saved(page)
        assert db.teams[DEFAULT_ID]['team']['roster'][0]['mood'] == 2
        meter_locked(page, first_meter, db.day)
        page.reload()
        meter_locked(page, first_meter, db.day)
        assert len(db.daily_posts) == 1, db.daily_posts
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width

        # Client-side fetch passes through the browser routes (APIRequestContext does not).
        winner = page.evaluate("""async ({id}) => {
            const response = await fetch('/api/daily-meter', {method: 'POST', headers: {
                'Content-Type': 'application/json', 'X-Team-Id': id},
                body: JSON.stringify({meterId: 'original', title: 'Baromètre original'})});
            return {status: response.status, body: await response.json()};
        }""", {'id': DEFAULT_ID})
        assert winner == {'status': 200, 'body': {'day': db.day, 'meter': first_meter}}
        assert db.daily[(DEFAULT_ID, db.day)] == first_meter

        switcher(page, 'Mon équipe').click()
        panel = page.get_by_role('region', name='Choisir ou créer une équipe', exact=True)
        panel.get_by_role('button', name='＋ Créer une équipe', exact=True).click()
        panel.get_by_role('textbox', name='Nom de la nouvelle équipe', exact=True).fill('   ')
        panel.get_by_role('button', name='Créer l’équipe', exact=True).click()
        expect(panel.get_by_role('alert')).to_be_visible()
        assert len(db.teams) == 1
        panel.get_by_role('textbox', name='Nom de la nouvelle équipe', exact=True).fill('  Équipe Bêta  ')
        panel.get_by_role('button', name='Créer l’équipe', exact=True).click()
        expect(switcher(page, 'Équipe Bêta')).to_be_enabled()
        expect(page).to_have_url(re.compile(r'/participants$'))
        saved(page)
        assert db.active == CREATED_ID
        assert not db.teams[CREATED_ID]['team']['roster']
        expect(page.get_by_text('Alice <safe>', exact=True)).to_have_count(0)
        expect(nav.get_by_role('button', name=re.compile('^Humeurs —'))).to_be_disabled()
        page.locator('#checkin-name').fill('Bob <safe>')
        page.get_by_role('button', name='Enregistrer cette personne', exact=True).click()
        saved(page)
        assert [person['name'] for person in db.teams[CREATED_ID]['team']['roster']] == ['Bob <safe>']
        assert [person['name'] for person in db.teams[DEFAULT_ID]['team']['roster']] == ['Alice <safe>']
        expect(switcher(page, 'Équipe Bêta').get_by_label('1 membres', exact=True)).to_have_count(1)
        page.get_by_role('link', name='Statistiques', exact=True).click()
        page.get_by_text('Historique chargé depuis Neon', exact=False).wait_for()
        expect(page.locator('dd').first).to_have_text('0')
        expect(page.get_by_role('list', name='Classement des participants', exact=True)).to_have_count(0)

        page.get_by_role('link', name='Humeurs', exact=True).click()
        meter_editable(page, db.day)
        second_meter = deepcopy(db.daily[(CREATED_ID, db.day)])
        people_panel(page, width)
        page.get_by_role('button', name='Humeur 2 pour Bob <safe>', exact=True).click()
        saved(page)
        meter_locked(page, second_meter, db.day)
        expect(page.get_by_role('button', name='Humeur 2 pour Bob <safe>', exact=True)).to_have_attribute('aria-pressed', 'true')
        page.get_by_role('button', name='Continuer vers le minuteur', exact=False).click()
        page.get_by_role('button', name='Démarrer', exact=True).click()
        page.evaluate("""() => { const original = Date.now; Date.now = () => original() + 2000;
            document.dispatchEvent(new Event('visibilitychange')); Date.now = original; }""")
        page.get_by_role('button', name='Suivant', exact=True).click()
        saved(page)
        assert len(db.rounds[CREATED_ID]) == 1
        assert db.rounds[CREATED_ID][0]['people'][0]['name'] == 'Bob <safe>'
        assert db.rounds[CREATED_ID][0]['people'][0]['speakingSeconds'] >= 1
        assert len(db.rounds[DEFAULT_ID]) == 1
        page.get_by_role('link', name='Statistiques', exact=True).click()
        page.get_by_text('Historique chargé depuis Neon', exact=False).wait_for()
        leaderboard = page.get_by_role('list', name='Classement des participants', exact=True)
        expect(leaderboard.get_by_text('Bob <safe>', exact=True)).to_be_visible()
        expect(leaderboard.get_by_text('Alice <safe>', exact=True)).to_have_count(0)
        page.reload()
        page.get_by_text('Historique chargé depuis Neon', exact=False).wait_for()
        expect(switcher(page, 'Équipe Bêta')).to_be_enabled()
        expect(leaderboard.get_by_text('Bob <safe>', exact=True)).to_be_visible()

        choose_team(page, 'Équipe Bêta', 'Mon équipe', 'MON EQUIPE', width)
        expect(page.get_by_text('Alice <safe>', exact=True)).to_be_visible()
        expect(page.get_by_text('Bob <safe>', exact=True)).to_have_count(0)
        page.get_by_role('link', name='Statistiques', exact=True).click()
        page.get_by_text('Historique chargé depuis Neon', exact=False).wait_for()
        expect(leaderboard.get_by_text('Alice <safe>', exact=True)).to_be_visible()
        expect(leaderboard.get_by_text('Bob <safe>', exact=True)).to_have_count(0)
        page.get_by_role('link', name='Humeurs', exact=True).click()
        meter_locked(page, first_meter, db.day)
        choose_team(page, 'Mon équipe', 'Équipe Bêta', 'equipe beta', width)
        expect(page.get_by_text('Bob <safe>', exact=True)).to_be_visible()
        expect(page.get_by_text('Alice <safe>', exact=True)).to_have_count(0)
        page.get_by_role('link', name='Humeurs', exact=True).click()
        expect(page.get_by_role('region', name='Point quotidien du jour', exact=True)).to_be_visible()
        expect(page.locator('#meter-catalogue-select')).to_have_count(0)
        posts_before_reload = len(db.daily_posts)
        page.reload()
        expect(page.get_by_role('region', name='Point quotidien du jour', exact=True)).to_be_visible()
        assert len(db.daily_posts) == posts_before_reload

        # A new Mauritius calendar day has its own assignment; yesterday is immutable.
        yesterday = db.day
        db.day = (datetime.fromisoformat(db.day) + timedelta(days=1)).date().isoformat()
        # Mirror server day-expiry of persisted check-ins, not a completed
        # workflow carried into the next day by the fixture.
        for person in db.teams[CREATED_ID]['team']['roster']:
            person.update(mood=None, moodUpdatedAt=None, moodSlide=None)
        page.reload()
        meter_editable(page, db.day)
        today_meter = deepcopy(db.daily[(CREATED_ID, db.day)])
        people_panel(page, width)
        page.get_by_role('button', name='Humeur 2 pour Bob <safe>', exact=True).click()
        saved(page)
        meter_locked(page, today_meter, db.day)
        assert today_meter['meterId'] != second_meter['meterId']
        assert db.daily[(CREATED_ID, yesterday)] == second_meter
        assert db.daily[(DEFAULT_ID, yesterday)] == first_meter
        assert len(db.daily_posts) == posts_before_reload + 1
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
        for team_id in [DEFAULT_ID, CREATED_ID]:
            for path, method in [('/api/team', 'GET'), ('/api/team', 'PUT'),
                                 ('/api/history', 'GET'), ('/api/daily-meter', 'GET'),
                                 ('/api/daily-meter', 'POST')]:
                assert (path, method, team_id) in db.requests, (width, path, method, team_id)
        assert ('/api/history', 'POST', CREATED_ID) in db.requests
        assert ('/api/daily-meter', 'PATCH', DEFAULT_ID) in db.requests
        assert len(db.daily_patches) == 2
        assert not errors, (width, errors)
        context.close()
        print(f'PASS: {width}x{height} multiteam creation/search/switch, isolated members/history/headers, daily lock/reload/first-write-wins/day rollover')
    browser.close()