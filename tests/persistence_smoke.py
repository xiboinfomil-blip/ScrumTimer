"""Isolated browser checks: local fallback, mocked Neon contract and compact UI."""
import json
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:3000'
TEAM = {'roster': [{'id': 'alice', 'name': 'Alice <safe>', 'present': True, 'mood': 2, 'moodUpdatedAt': None}], 'session': ['alice'], 'duration': 2, 'warning': 0, 'sound': False, 'usedMoodMeters': ['deck-1234567890abcdef1234']}

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={'width': 1366, 'height': 768})
    errors = []
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    context.add_init_script("localStorage.getItem('standup.team.v2') || localStorage.setItem('standup.team.v2', " + json.dumps(json.dumps(TEAM)) + ');')
    page.goto(BASE + '/timer')
    page.get_by_role('button', name='Démarrer', exact=True).wait_for()
    page.get_by_role('button', name='Démarrer', exact=True).click()
    # Simulate active time without a real wait.
    page.evaluate('''() => { const original = Date.now; Date.now = () => original() + 1000; document.dispatchEvent(new Event('visibilitychange')); Date.now = original; }''')
    page.get_by_role('button', name='Suivant', exact=True).click()
    page.wait_for_function("JSON.parse(localStorage.getItem('standup.history.v1') || '[]').length === 1")
    saved = page.evaluate("JSON.parse(localStorage.getItem('standup.history.v1'))")
    assert saved[0]['people'][0]['name'] == 'Alice <safe>'
    assert saved[0]['people'][0]['speakingSeconds'] >= 1
    page.goto(BASE + '/statistics')
    page.get_by_role('heading', name='Statistiques', exact=True).wait_for()
    page.get_by_text('Historique local · ce navigateur', exact=False).wait_for()
    assert page.locator('dd').first.inner_text() == '1'
    leaderboard = page.get_by_role('list', name='Classement des participants', exact=True)
    assert leaderboard.get_by_text('Alice <safe>', exact=True).count() == 1
    assert leaderboard.get_by_label('Rang 1', exact=True).count() == 1
    page.reload()
    page.get_by_role('heading', name='Statistiques', exact=True).wait_for()
    assert page.locator('dd').first.inner_text() == '1'
    for width, height in [(320, 568), (390, 844), (768, 1024), (1024, 576), (1366, 768), (1920, 1080)]:
        page.set_viewport_size({'width': width, 'height': height})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width, 'horizontal overflow')
        link = page.get_by_role('link', name='Statistiques', exact=True).bounding_box()
        assert link and link['x'] >= 0 and link['x'] + link['width'] <= width, (width, 'nav overflow')
        row = leaderboard.locator('li').first.bounding_box()
        assert row and row['x'] >= 0 and row['x'] + row['width'] <= width, (width, 'leaderboard overflow')
    assert not errors, errors
    context.close()

    # No live credentials involved: verify provider request sequencing with mocked APIs.
    context = browser.new_context(viewport={'width': 1366, 'height': 768})
    db = {'team': TEAM, 'revision': 4, 'rounds': []}
    writes = []
    def team_api(route):
        if route.request.method == 'GET':
            route.fulfill(json={'team': db['team'], 'revision': db['revision']})
        else:
            body = route.request.post_data_json
            assert body['revision'] == db['revision']
            db['team'] = body['team']
            db['revision'] += 1
            writes.append(body)
            route.fulfill(json={'revision': db['revision']})
    def history_api(route):
        if route.request.method == 'GET':
            route.fulfill(json={'rounds': db['rounds']})
        else:
            body = route.request.post_data_json
            if not any(r['id'] == body['id'] for r in db['rounds']):
                db['rounds'].append(body)
            route.fulfill(json={'saved': True})
    context.route('**/api/team', team_api)
    context.route('**/api/history', history_api)
    context.route('**/api/mood-meters/catalog', lambda route: route.fulfill(json=[{'title': 'Used meter', 'remoteId': 'deck-1234567890abcdef1234', 'slides': []}, {'title': 'New meter', 'remoteId': 'deck-abcdef1234567890abcd', 'slides': []}]))
    context.route('**/api/mood-meters/decks/*', lambda route: route.fulfill(status=503, json={}))
    page = context.new_page()
    page.goto(BASE + '/participants')
    page.get_by_text('Alice <safe>', exact=True).wait_for()
    page.wait_for_function("document.querySelector('header').innerText.includes('Neon')")
    assert writes, 'cloud bootstrap save'
    page.get_by_role('link', name='Humeurs', exact=True).click()
    page.wait_for_function("document.querySelector('#meter-catalogue-select')?.selectedOptions[0]?.textContent === 'New meter'")
    used_option = page.locator('#meter-catalogue-select option').filter(has_text='Used meter')
    assert 'Déjà utilisé' in used_option.inner_text()
    used_value = used_option.get_attribute('value')
    page.locator('#meter-catalogue-select').select_option(used_value)
    assert page.locator('#meter-catalogue-select').input_value() == used_value
    page.locator('#meter-catalogue-select').select_option('-2')
    page.get_by_text('Baromètre original choisi manuellement.', exact=True).wait_for()
    page.goto(BASE + '/statistics')
    page.get_by_text('Historique chargé depuis Neon', exact=False).wait_for()
    assert page.locator('dd').first.inner_text() == '0'
    context.close()
    browser.close()
    print('PASS: completed-round local archive/reload, six viewport layouts, mocked Neon hydration/versioned writes and used-meter/manual original selection')