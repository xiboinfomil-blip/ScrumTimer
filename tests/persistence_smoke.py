"""Neon-only contract tests; no live database writes or browser business storage."""
from copy import deepcopy
import os
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3000')
TEAM_ID = 'a' * 64
TEAM = {'roster': [{'id': 'alice', 'name': 'Alice <safe>', 'present': True, 'mood': 2, 'moodUpdatedAt': None}], 'session': [], 'duration': 2, 'warning': 0, 'sound': False, 'usedMoodMeters': ['deck-1234567890abcdef1234']}
NO_STORAGE = """for (const name of ['localStorage', 'sessionStorage']) Object.defineProperty(window, name, {get() { throw new Error('Browser storage forbidden'); }});"""

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={'width': 1366, 'height': 768})
    context.add_init_script(NO_STORAGE)
    errors = []
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    db = {'team': deepcopy(TEAM), 'revision': 4, 'rounds': [], 'offline': True, 'history_offline': False, 'daily': None}
    writes = []

    def daily_api(route):
        assert route.request.headers.get('x-team-id') == TEAM_ID
        if route.request.method == 'POST' and db['daily'] is None:
            db['daily'] = deepcopy(route.request.post_data_json)
        route.fulfill(json={'day': '2026-10-14', 'meter': db['daily']})

    def team_api(route):
        if db['offline']:
            route.fulfill(status=503, json={})
        elif route.request.method == 'GET':
            route.fulfill(json={'team': db['team'], 'revision': db['revision']})
        else:
            body = route.request.post_data_json
            if body['revision'] != db['revision']:
                route.fulfill(status=409, json={})
                return
            db['team'] = {**body['team'], 'session': [], 'currentMoodSlide': None}
            db['revision'] += 1
            writes.append(body)
            route.fulfill(json={'revision': db['revision']})

    def history_api(route):
        if db['history_offline']:
            route.fulfill(status=503, json={})
        elif route.request.method == 'GET':
            route.fulfill(json={'rounds': db['rounds']})
        else:
            body = route.request.post_data_json
            if not any(item['id'] == body['id'] for item in db['rounds']):
                db['rounds'].append(body)
            route.fulfill(json={'saved': True})

    context.route('**/api/team', team_api)
    context.route('**/api/teams', lambda route: route.fulfill(json={'teams': [{'id': TEAM_ID, 'name': 'Mon équipe', 'memberCount': len(db['team']['roster'])}], 'activeTeamId': TEAM_ID}))
    context.route('**/api/daily-meter', daily_api)
    context.route('**/api/history', history_api)
    context.route('**/mood-meters/catalog.json', lambda route: route.fulfill(json={'remote': True}))
    context.route('**/api/mood-meters/catalog', lambda route: route.fulfill(json=[{'title': 'Used meter', 'remoteId': 'deck-1234567890abcdef1234', 'slides': []}, {'title': 'New meter', 'remoteId': 'deck-abcdef1234567890abcd', 'slides': []}]))
    context.route('**/api/mood-meters/decks/*', lambda route: route.fulfill(json={'title': 'Meter', 'slides': ['mood-meters/slides/deck-abcdef1234567890abcd/page1.svg', 'mood-meters/slides/deck-abcdef1234567890abcd/page2.svg']}))
    context.route('**/mood-meters/slides/**/*.svg', lambda route: route.fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#eaf2fa"/><text x="600" y="450" font-size="70">Mood meter</text></svg>'))

    page.goto(BASE + '/participants')
    page.get_by_text('Connexion à Neon nécessaire pour ouvrir votre équipe.', exact=True).wait_for()
    assert page.get_by_role('heading', name='Statistiques', exact=True).count() == 0
    assert page.get_by_text('Alice <safe>', exact=True).count() == 0
    db['offline'] = False
    page.get_by_role('button', name='Réessayer Neon', exact=True).click()
    page.get_by_text('Alice <safe>', exact=True).wait_for()
    page.get_by_role('link', name='Humeurs', exact=True).click()
    page.wait_for_function("document.querySelector('#meter-catalogue-select')?.selectedOptions[0]?.textContent === 'New meter'")
    expect(page.locator('#meter-catalogue-select')).to_be_disabled()
    expect(page.locator('#random-meter-button')).to_be_disabled()
    expect(page.locator('#daily-meter-note')).to_contain_text('Verrouillé après le premier vote')
    assert db['daily'] == {'meterId': 'deck-abcdef1234567890abcd', 'title': 'New meter'}
    expect(page.locator('#meter-slide-stack img')).to_have_count(2)
    for width, height in [(320, 568), (390, 844), (768, 1024), (1024, 576), (1366, 768), (1920, 1080)]:
        page.set_viewport_size({'width': width, 'height': height})
        page.wait_for_function("Array.from(document.querySelectorAll('#meter-slide-stack img')).every(img => img.complete && img.naturalWidth > 0)")
        images = page.locator('#meter-slide-stack img')
        first, second = images.nth(0).bounding_box(), images.nth(1).bounding_box()
        assert first and second and second['y'] >= first['y'] + first['height'] - 1, (width, 'slides not stacked')
        assert first['width'] > 0 and second['width'] > 0, (width, 'empty slide')
        stack = page.locator('#meter-slide-stack').bounding_box()
        assert stack and second['y'] + second['height'] <= stack['y'] + stack['height'] + 1, (width, 'second slide clipped')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
        assert page.get_by_role('button', name='Diapositive suivante', exact=True).count() == 0
    page.set_viewport_size({'width': 1366, 'height': 768})
    expect(page.locator('#meter-slide-stack button')).to_have_count(0)
    used = page.locator('#meter-catalogue-select option').filter(has_text='Used meter')
    assert 'Déjà utilisé' in used.inner_text()
    assigned = deepcopy(db['daily'])
    page.reload()
    page.wait_for_function("document.querySelector('#meter-catalogue-select')?.selectedOptions[0]?.textContent === 'New meter'")
    expect(page.locator('#meter-catalogue-select')).to_be_disabled()
    expect(page.locator('#random-meter-button')).to_be_disabled()
    expect(page.locator('#meter-slide-stack img')).to_have_count(2)
    assert db['daily'] == assigned
    page.get_by_role('button', name='Continuer vers le minuteur', exact=False).click()
    page.get_by_role('button', name='Démarrer', exact=True).click()
    page.evaluate('''() => { const original = Date.now; Date.now = () => original() + 1000; document.dispatchEvent(new Event('visibilitychange')); Date.now = original; }''')
    page.get_by_role('button', name='Suivant', exact=True).click()
    page.wait_for_function("document.querySelector('header').innerText.includes('Neon ✓')")
    assert len(db['rounds']) == 1
    assert db['rounds'][0]['people'][0]['speakingSeconds'] >= 1
    assert writes
    expired = deepcopy(db['rounds'][0])
    expired['id'] = 'expired-history'
    expired['completedAt'] = '2020-01-01T00:00:00.000Z'
    expired['people'][0]['id'] = 'expired-person'
    expired['people'][0]['name'] = 'Expired participant'
    db['rounds'].append(expired)
    page.get_by_role('link', name='Statistiques', exact=True).click()
    page.get_by_text('Historique chargé depuis Neon', exact=False).wait_for()
    expect(page.locator('dd').first).to_have_text('1')
    expect(page.locator('#daily-heading')).to_have_text('Activité · 5 derniers jours')
    expect(page.locator('#daily-heading').locator('..').locator('ol > li')).to_have_count(5)
    leaderboard = page.get_by_role('list', name='Classement des participants', exact=True)
    expect(leaderboard.get_by_text('Expired participant', exact=True)).to_have_count(0)
    expect(leaderboard.get_by_text('Alice <safe>', exact=True)).to_have_count(1)
    expect(leaderboard.get_by_label('Rang 1', exact=True)).to_have_count(1)
    page.reload()
    page.get_by_text('Historique chargé depuis Neon', exact=False).wait_for()
    expect(page.locator('dd').first).to_have_text('1')
    for width, height in [(320, 568), (390, 844), (768, 1024), (1024, 576), (1366, 768), (1920, 1080)]:
        page.set_viewport_size({'width': width, 'height': height})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
        row = leaderboard.locator('li').first.bounding_box()
        assert row and row['x'] >= 0 and row['x'] + row['width'] <= width, width

    db['history_offline'] = True
    page.get_by_role('button', name='Actualiser', exact=True).click()
    page.get_by_text('Aucune donnée de remplacement', exact=False).wait_for()
    expect(leaderboard).to_have_count(0)
    db['history_offline'] = False
    page.get_by_role('button', name='Réessayer', exact=True).click()
    page.get_by_text('Historique chargé depuis Neon', exact=False).wait_for()
    expect(page.locator('dd').first).to_have_text('1')
    assert not errors, errors
    context.close()
    browser.close()
    print('PASS: daily meter locked/restored, stacked SVG slides at six sizes, browser storage forbidden, Neon-only hydration/retry/writes/round archive/reload/leaderboard, history failure without fallback')