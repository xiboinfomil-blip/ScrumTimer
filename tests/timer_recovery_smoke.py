"""Tab recovery and automatic Neon retries; all APIs mocked, no database writes."""
import os
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3001')
TEAM_ID = 'a' * 64

with sync_playwright() as p:
    browser = p.chromium.launch()
    for width, height in [(320, 568), (1366, 768)]:
        context = browser.new_context(viewport={'width': width, 'height': height}, reduced_motion='reduce')
        model = {'team': {'roster': [
            {'id': name.lower(), 'name': name, 'present': True, 'mood': 2, 'moodUpdatedAt': None}
            for name in ['Alice', 'Bob']], 'session': [], 'duration': 120,
            'warning': 20, 'sound': False, 'usedMoodMeters': []},
            'revision': 1, 'loads': 0, 'writes': 0, 'outage': False, 'history_posts': 0, 'meter': None}

        def api(route):
            path = route.request.url.split('/api/')[1].split('?')[0]
            method = route.request.method
            if path == 'teams':
                model['loads'] += 1
                if model['loads'] <= 2:
                    route.fulfill(status=503, json={'error': 'temporary'})
                else:
                    route.fulfill(json={'teams': [{'id': TEAM_ID, 'name': 'Test', 'memberCount': 2}], 'activeTeamId': TEAM_ID})
            elif path == 'team':
                if method == 'PUT':
                    model['writes'] += 1
                    if model['outage']:
                        route.fulfill(status=503, json={'error': 'temporary'})
                        return
                    body = route.request.post_data_json
                    if body['revision'] != model['revision']:
                        route.fulfill(status=409, json={'error': 'revision'})
                        return
                    model['team'] = {**body['team'], 'session': [], 'postponed': []}
                    model['revision'] += 1
                    # Simulate committed PUT with a lost response on the first write.
                    if model['writes'] == 1:
                        route.abort('failed')
                        return
                    route.fulfill(json={'revision': model['revision']})
                else:
                    route.fulfill(json={'team': model['team'], 'revision': model['revision']})
            elif path == 'history':
                if method == 'POST':
                    model['history_posts'] += 1
                    if model['history_posts'] < 3:
                        route.fulfill(status=503, json={'error': 'temporary'})
                        return
                route.fulfill(json={'rounds': []})
            elif path == 'daily-meter':
                if method == 'POST':
                    model['meter'] = route.request.post_data_json
                route.fulfill(json={'day': '2026-10-19', 'meter': model['meter']})
            elif path == 'mood-meters/catalog':
                route.fulfill(json=[])
            elif path == 'daily-hints':
                route.fulfill(json={'day': '2026-10-19', 'hints': []})
            elif path == 'meeting-settings':
                route.fulfill(json={'prompts': ['Hier ?', 'Aujourd’hui ?', 'Blocages ?'], 'revision': 0})
            else:
                route.fulfill(status=404, json={})

        context.route('**/api/**', api)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE + '/mood?team=' + TEAM_ID)
        if width < 801:
            page.get_by_role('button', name='Humeurs de l’équipe', exact=True).click(timeout=30000)
        proceed = page.get_by_role('button', name='Continuer vers le minuteur', exact=False)
        expect(proceed).to_be_enabled(timeout=30000)
        assert model['loads'] >= 3, model
        proceed.click()
        page.locator('#start-button').click()
        expect(page.locator('#start-button')).to_contain_text('Pause')
        first = page.locator('#speaker-name').inner_text()
        page.wait_for_function("document.querySelector('header [role=status]')?.title === 'Équipe enregistrée dans Neon.'")
        # Drift-free background accounting plus refresh with server-side empty lineup.
        page.clock.install()
        page.clock.fast_forward(130000)
        page.reload()
        expect(page.locator('#speaker-name')).to_have_text(first)
        expect(page.locator('#start-button')).to_contain_text('Pause')
        expect(page.locator('#speaker-turn-cue')).to_contain_text('Merci de passer la parole')
        page.locator('#start-button').click()
        paused = page.locator('#timer-display').inner_text()
        page.reload()
        expect(page.locator('#speaker-name')).to_have_text(first)
        expect(page.locator('#timer-display')).to_have_text(paused)
        expect(page.locator('#start-button')).not_to_contain_text('Pause')
        page.locator('#next-button').click()
        expect(page.locator('#speaker-name')).not_to_have_text(first)
        second = page.locator('#speaker-name').inner_text()
        page.reload()
        expect(page.locator('#speaker-name')).to_have_text(second)
        expect(page.locator('#start-button')).to_contain_text('Pause')
        # History automatically retries without pressing the retry button.
        page.locator('#next-button').click()
        page.wait_for_function("!Object.keys(sessionStorage).some(key => key.startsWith('standup.timer.tab.v1:'))", timeout=15000)
        assert model['history_posts'] >= 3, model
        assert not errors, errors
        print(f'PASS {width}x{height}: load retries, lost PUT reconciliation, running/overtime/paused refresh, handoff, history retries')
        context.close()
    browser.close()