"""URL contexts and automatic random meters; all APIs mocked, no live writes."""
import os
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3000')
A, B = 'a' * 64, 'b' * 64
DECKS = ['deck-' + digit * 20 for digit in ['1', '2']]
DAY = (datetime.now(timezone.utc) + timedelta(hours=4)).date().isoformat()

with sync_playwright() as p:
    browser = p.chromium.launch()
    for width, height in [(320, 568), (1366, 768)]:
        context = browser.new_context(viewport={'width': width, 'height': height}, reduced_motion='reduce')
        context.add_init_script("for (const name of ['localStorage', 'sessionStorage']) Object.defineProperty(window, name, {get() { throw new Error('Storage forbidden'); }});")
        teams = {key: {'roster': [{'id': key, 'name': name, 'present': True, 'mood': None, 'moodUpdatedAt': None}], 'session': [], 'duration': 120, 'warning': 30, 'sound': False, 'usedMoodMeters': [], 'currentMoodSlide': None} for key, name in [(A, 'Alice'), (B, 'Bob')]}
        meters, patches, reads = {}, [], []
        race = {'lock': False}

        def api(route):
            req = route.request
            path = urlparse(req.url).path
            key = req.headers.get('x-team-id')
            if path == '/api/teams':
                selected = req.post_data_json['teamId'] if req.method == 'PATCH' else A
                route.fulfill(json={'teams': [{'id': A, 'name': 'Alpha', 'memberCount': 1}, {'id': B, 'name': 'Beta', 'memberCount': 1}], 'activeTeamId': selected})
            elif path == '/api/team':
                assert key in teams
                reads.append(key)
                if req.method == 'PUT':
                    teams[key] = deepcopy(req.post_data_json['team'])
                route.fulfill(json={'team': deepcopy(teams[key]), 'revision': 1})
            elif path == '/api/history':
                assert key in teams
                route.fulfill(json={'rounds': [], 'day': DAY})
            elif path == '/api/daily-meter':
                assert key in teams
                if req.method == 'PATCH':
                    patches.append(key)
                    if race['lock']:
                        race['lock'] = False
                        route.fulfill(status=409, json={'error': 'Verrouillé'})
                        return
                    assert not any(person['mood'] is not None for person in teams[key]['roster'])
                    meters[key] = req.post_data_json
                elif req.method == 'POST':
                    meters.setdefault(key, req.post_data_json)
                route.fulfill(json={'day': DAY, 'meter': meters.get(key)})
            elif path == '/api/mood-meters/catalog':
                route.fulfill(json=[{'title': f'Meter {i}', 'remoteId': deck, 'slides': []} for i, deck in enumerate(DECKS)])
            elif path.startswith('/api/mood-meters/decks/'):
                route.fulfill(json={'title': 'Meter', 'slides': ['mood-meters/slides/test/page.svg']})
            else:
                raise AssertionError(path)

        context.route('**/api/**', api)
        context.route('**/mood-meters/catalog.json', lambda r: r.fulfill(json={'remote': True}))
        context.route('**/mood-meters/slides/**/*.svg', lambda r: r.fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>'))
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(BASE + '/mood?team=' + B)
        select = page.locator('#meter-catalogue-select')
        expect(select).to_be_enabled()
        expect(page.get_by_role('button', name='Choisir une équipe : Beta', exact=True)).to_be_enabled()
        assert reads and all(key == B for key in reads)
        first = meters[B]['meterId']
        assert first in DECKS
        page.reload()
        expect(select).to_be_enabled()
        assert meters[B]['meterId'] != first
        assert patches == [B]
        # A concurrent vote rejects the new random choice: use the server winner.
        previous = deepcopy(meters[B])
        race['lock'] = True
        page.reload()
        expect(select).to_be_enabled()
        assert meters[B] == previous
        assert len(patches) == 2
        # Remote slide metadata loads after the catalogue becomes selectable.
        # Wait for that slide and its context save before injecting a server
        # vote, or a pending client PUT can overwrite the mock's injected vote.
        expect(page.locator('#meter-slide-stack').get_by_role('img')).to_be_visible()
        page.wait_for_function("document.querySelector('.site-header [role=status]')?.title === 'Équipe enregistrée dans Neon.'")
        # Once votes exist, refresh must neither shuffle nor send a PATCH.
        teams[B]['roster'][0]['mood'] = 2
        teams[B]['roster'][0]['moodUpdatedAt'] = datetime.now(timezone.utc).isoformat()
        page.reload()
        expect(select).to_be_disabled()
        expect(page.locator('#daily-meter-note')).to_contain_text('Verrouillé')
        assert len(patches) == 2 and meters[B] == previous
        page.get_by_role('link', name='Participants', exact=True).click()
        # The team query already matches on /mood. Wait for navigation to
        # commit before reloading, otherwise the mobile meter tab hides Bob.
        page.wait_for_function("location.pathname === '/participants' && new URL(location.href).searchParams.get('team') === '" + B + "'")
        expect(page.locator('#participants-page')).to_be_visible()
        page.reload()
        expect(page.locator('#participants-page')).to_be_visible()
        assert urlparse(page.url).path == '/participants'
        expect(page.get_by_text('Bob', exact=True)).to_be_visible()
        expect(page.get_by_text('Alice', exact=True)).to_have_count(0)
        # Changing the team restores a distinct roster and updates the refresh context.
        page.get_by_role('button', name='Choisir une équipe : Beta', exact=True).click()
        page.get_by_role('region', name='Choisir ou créer une équipe').get_by_role('list', name='Équipes', exact=True).get_by_role('button').filter(has_text='Alpha').click()
        expect(page.get_by_role('button', name='Choisir une équipe : Alpha', exact=True)).to_be_enabled()
        page.wait_for_function("new URL(location.href).searchParams.get('team') === '" + A + "'")
        page.reload()
        expect(page.get_by_text('Alice', exact=True)).to_be_visible()
        page.goto(BASE + '/participants?team=deleted')
        expect(page.get_by_text('Alice', exact=True)).to_be_visible()
        page.wait_for_function("new URL(location.href).searchParams.get('team') === '" + A + "'")
        assert not errors, errors
        assert context.cookies() == []
        context.close()
        print(f'PASS team refresh/navigation/isolation/fallback + random/locked/race {width}x{height}')
    browser.close()