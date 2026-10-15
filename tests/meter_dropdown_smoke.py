"""Dropdown changes persisted through mocked daily API; no live database writes."""
import os
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3000')
ID = 'a' * 64
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width, height in [(320, 568), (1366, 768)]:
        context = browser.new_context(viewport={'width': width, 'height': height}, reduced_motion='reduce')
        team = {'roster': [{'id': 'alice', 'name': 'Alice', 'present': True, 'mood': None, 'moodUpdatedAt': None}], 'session': [], 'duration': 120, 'warning': 30, 'sound': False, 'usedMoodMeters': [], 'currentMoodSlide': None}
        db = {'revision': 1, 'meter': {'meterId': 'original', 'title': 'Baromètre original'}, 'patches': 0}
        day = (datetime.now(timezone.utc) + timedelta(hours=4)).date().isoformat()
        def api(route):
            req = route.request
            path = urlparse(req.url).path
            if path == '/api/teams':
                route.fulfill(json={'teams': [{'id': ID, 'name': 'Test', 'memberCount': 1}], 'activeTeamId': ID})
            elif path == '/api/team':
                if req.method == 'PUT':
                    team.update(deepcopy(req.post_data_json['team']))
                    db['revision'] += 1
                route.fulfill(json={'team': deepcopy(team), 'revision': db['revision']})
            elif path == '/api/history':
                route.fulfill(json={'rounds': [], 'day': day})
            elif path == '/api/daily-meter':
                if req.method == 'PATCH':
                    db['meter'] = req.post_data_json
                    db['patches'] += 1
                route.fulfill(json={'day': day, 'meter': db['meter']})
            elif path == '/api/mood-meters/catalog':
                route.fulfill(json=[{'title': 'Test meter', 'remoteId': 'deck-1234567890abcdef1234', 'slides': []}])
            elif path.startswith('/api/mood-meters/decks/'):
                route.fulfill(json={'title': 'Test meter', 'slides': ['mood-meters/slides/test/page.svg']})
            else:
                raise AssertionError(path)
        context.route('**/api/**', api)
        context.route('**/mood-meters/catalog.json', lambda route: route.fulfill(json={'remote': True}))
        context.route('**/mood-meters/slides/**/*.svg', lambda route: route.fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>'))
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE + '/mood')
        select = page.locator('#meter-catalogue-select')
        expect(select).to_be_enabled()
        select.select_option('0')
        expect(select).to_have_value('0')
        assert db['patches'] == 1
        assert db['meter']['meterId'] == 'deck-1234567890abcdef1234'
        page.reload()
        expect(select).to_have_value('0')
        expect(select).to_be_enabled()
        select.select_option('-2')
        expect(select).to_have_value('-2')
        if width <= 800:
            page.get_by_role('button', name='Humeurs de l’équipe', exact=True).click()
        page.get_by_role('button', name='Humeur 2 pour Alice', exact=True).click()
        page.wait_for_function("document.querySelector('.site-header [role=status]')?.title === 'Équipe enregistrée dans Neon.'")
        page.reload()
        expect(select).to_be_disabled()
        expect(page.locator('#daily-meter-note')).to_contain_text('Verrouillé après le premier vote')
        assert db['patches'] == 2
        assert not errors, errors
        context.close()
        print(f'PASS dropdown change/reload/vote-lock {width}x{height}')
    browser.close()