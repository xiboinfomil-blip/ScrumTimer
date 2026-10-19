"""Daily view/reset across independent device contexts; mocked APIs, no live writes."""
import os
import re
from copy import deepcopy
from datetime import datetime, timezone
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from browser_bootstrap import TEAM_ID, install_browser_bootstrap, mauritius_day, team_fixture

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3000')

with sync_playwright() as p:
    browser = p.chromium.launch()
    for width, height in [(320, 568), (1366, 768)]:
        now = datetime.now(timezone.utc)
        day = mauritius_day(now)
        person = {'id': 'alice', 'name': 'Alice <safe>', 'present': True,
                  'mood': 2, 'moodUpdatedAt': now.isoformat(), 'moodSlide': None}
        team = team_fixture(roster=[person])
        result = {'id': 'today', 'completedAt': now.isoformat(), 'people': [{
            'id': 'alice', 'name': 'Alice <safe>', 'mood': 2, 'speakingSeconds': 30,
            'budgetSeconds': 120, 'timeUp': False, 'score': 1000, 'meterTitle': None}]}
        db = {'rounds': [result], 'revision': 1, 'deletes': 0}
        errors = []
        application_cookies = []

        def check_response(response):
            # Next dev may read document.cookie internally. Observe the actual
            # application contract instead of replacing the browser getter.
            if urlparse(response.url).path.startswith('/api/'):
                values = response.header_values('set-cookie')
                if values:
                    application_cookies.append((response.url, values))

        def api(route):
            req = route.request
            path = urlparse(req.url).path
            if path == '/api/teams':
                route.fulfill(json={'teams': [{'id': TEAM_ID, 'name': 'Équipe partagée', 'memberCount': 1}], 'activeTeamId': TEAM_ID})
            elif path == '/api/team':
                assert req.headers.get('x-team-id') == TEAM_ID
                if req.method == 'PUT':
                    assert db['deletes'] == 1, 'completed workflow must not mutate roster before reset'
                    body = req.post_data_json
                    assert body['team']['roster'][0]['name'] == 'Alice <safe>'
                    team.update(deepcopy(body['team']))
                    db['revision'] += 1
                    route.fulfill(json={'revision': db['revision']})
                else:
                    route.fulfill(json={'team': deepcopy(team), 'revision': db['revision']})
            elif path == '/api/history':
                assert req.headers.get('x-team-id') == TEAM_ID
                if req.method == 'DELETE':
                    assert req.post_data_json == {'roundId': 'today'}
                    db['deletes'] += 1
                    db['rounds'] = []
                    db['revision'] += 1
                    team['roster'][0].update(mood=None, moodUpdatedAt=None)
                else:
                    assert req.method == 'GET'
                route.fulfill(json={'rounds': deepcopy(db['rounds']), 'day': day})
            else:
                route.fallback()

        contexts = []
        bootstraps = []
        pages = []
        for _ in range(2):
            context = browser.new_context(viewport={'width': width, 'height': height}, reduced_motion='reduce', service_workers='block')
            bootstrap = install_browser_bootstrap(context)
            contexts.append(context)
            bootstraps.append(bootstrap)
            context.on('response', check_response)
            context.add_init_script("""for (const name of ['localStorage', 'sessionStorage', 'indexedDB']) {
                Object.defineProperty(window, name, {get() {throw new Error('Browser storage forbidden');}});
            }""")
            context.route('**/api/**', api)
            page = context.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            pages.append(page)
            page.goto(BASE + '/participants')
            expect(page.get_by_text('Alice <safe>', exact=True)).to_be_visible()
            page.get_by_role('link', name='Voir le bilan ou réinitialiser', exact=True).click()
            expect(page.get_by_text('Point quotidien terminé aujourd’hui', exact=True)).to_be_visible()
            page.get_by_role('button', name='Voir le bilan du jour', exact=True).click()
            expect(page.locator('.daily-score-list').get_by_text('Alice <safe>', exact=True)).to_be_visible()
            expect(page.get_by_text('1000 pts', exact=True)).to_be_visible()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            assert page.evaluate('document.documentElement.scrollHeight <= innerHeight')
        page = pages[1]
        page.get_by_role('button', name='Réinitialiser aujourd’hui', exact=True).click()
        dialog = page.get_by_role('dialog')
        dialog.get_by_role('button', name='Annuler', exact=True).click()
        expect(dialog).not_to_be_visible()
        assert db['deletes'] == 0
        page.get_by_role('button', name='Réinitialiser aujourd’hui', exact=True).click()
        dialog.get_by_role('button', name='Réinitialiser aujourd’hui', exact=True).click()
        expect(page).to_have_url(re.compile(re.escape(BASE + '/participants') + r'(?:\?team=' + TEAM_ID + r')?$'))
        expect(page.get_by_text('Alice <safe>', exact=True)).to_be_visible()
        expect(page.get_by_role('link', name='Voir le bilan ou réinitialiser', exact=True)).to_have_count(0)
        assert db['deletes'] == 1
        pages[0].goto(BASE + '/participants')
        expect(pages[0].get_by_text('Alice <safe>', exact=True)).to_be_visible()
        expect(pages[0].get_by_role('link', name='Voir le bilan ou réinitialiser', exact=True)).to_have_count(0)
        assert not errors, errors
        assert not application_cookies, application_cookies
        for context, bootstrap in zip(contexts, bootstraps):
            assert context.cookies() == [], 'no browser cookie should be created'
            bootstrap.assert_no_unexpected_api()
            context.close()
        print(f'PASS shared daily view/reset {width}x{height}')
    browser.close()