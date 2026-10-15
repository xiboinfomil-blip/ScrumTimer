"""Validated participant actions with isolated mocked Neon, never live writes."""
import os
from copy import deepcopy
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3000')
with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(reduced_motion='reduce')
    db = {'team': {'roster': [{'id': 'alice', 'name': 'Alice', 'present': True, 'mood': 2, 'moodUpdatedAt': None}], 'session': [], 'duration': 120, 'warning': 30, 'sound': False, 'usedMoodMeters': []}, 'revision': 1}
    daily = {'day': '2026-10-14', 'meter': None}
    def daily_api(route):
        assert route.request.headers.get('x-team-id') == 'a' * 64
        if route.request.method == 'POST' and daily['meter'] is None:
            daily['meter'] = route.request.post_data_json
        route.fulfill(json=daily)
    def api(route):
        if route.request.method == 'GET':
            route.fulfill(json=deepcopy(db))
        else:
            body = route.request.post_data_json
            assert body['revision'] == db['revision']
            db['team'] = {**body['team'], 'session': [], 'currentMoodSlide': None}
            db['revision'] += 1
            route.fulfill(json={'revision': db['revision']})
    context.route('**/api/team', api)
    context.route('**/api/teams', lambda route: route.fulfill(json={'teams': [{'id': 'a' * 64, 'name': 'Mon équipe', 'memberCount': len(db['team']['roster'])}], 'activeTeamId': 'a' * 64}))
    context.route('**/api/daily-meter', daily_api)
    context.route('**/api/history', lambda route: route.fulfill(json={'rounds': []}))
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE + '/manage-team')
    expect(page.get_by_text('Alice', exact=True)).to_be_visible()
    original_revision = db['revision']
    for invalid in ['   ', 'x' * 61]:
        page.locator('#checkin-name').fill(invalid)
        page.get_by_role('button', name='Enregistrer cette personne').click()
        expect(page.locator('#checkin-name-error')).to_be_visible()
        assert db['revision'] == original_revision
    page.get_by_role('button', name='Modifier le nom de Alice', exact=True).click()
    dialog = page.get_by_role('dialog', name='Modifier le nom du participant')
    dialog.locator('input').fill(' ')
    dialog.get_by_role('button', name='Enregistrer', exact=True).click()
    expect(dialog.locator('#edit-person-error')).to_be_visible()
    assert db['revision'] == original_revision
    dialog.locator('input').fill('  Alicia <safe>  ')
    dialog.get_by_role('button', name='Enregistrer', exact=True).click()
    expect(dialog).not_to_be_visible()
    expect(page.get_by_text('Alicia <safe>', exact=True)).to_be_visible()
    page.wait_for_function("document.querySelector('header [role=status]')?.title === 'Équipe enregistrée dans Neon.'")
    assert db['team']['roster'][0]['id'] == 'alice'
    assert db['team']['roster'][0]['name'] == 'Alicia <safe>'
    assert db['team']['roster'][0]['mood'] == 2
    for width, height in [(320, 568), (390, 844), (768, 1024), (1024, 576), (1366, 768), (1920, 1080)]:
        page.set_viewport_size({'width': width, 'height': height})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
        page.get_by_role('button', name='Modifier le nom de Alicia <safe>', exact=True).click()
        expect(dialog).to_be_visible()
        box = dialog.bounding_box()
        assert box and box['x'] >= 0 and box['x'] + box['width'] <= width + 1, (width, box)
        dialog.get_by_role('button', name='Annuler').click()
    page.reload()
    expect(page.get_by_text('Alicia <safe>', exact=True)).to_be_visible()
    page.get_by_role('button', name='Retirer Alicia <safe> de l’équipe', exact=True).click()
    deletion = page.get_by_role('dialog', name='Supprimer cette personne ?', exact=True)
    deletion.get_by_role('button', name='Annuler').click()
    expect(page.get_by_text('Alicia <safe>', exact=True)).to_be_visible()
    page.get_by_role('button', name='Retirer Alicia <safe> de l’équipe', exact=True).click()
    deletion.get_by_role('button', name='Supprimer', exact=True).click()
    expect(page.get_by_text('Alicia <safe>', exact=True)).to_have_count(0)
    page.wait_for_function("document.querySelector('header [role=status]')?.title === 'Équipe enregistrée dans Neon.'")
    assert not db['team']['roster']
    assert not errors, errors
    context.close()
    browser.close()
    print('PASS: invalid names rejected, rename preserves ID/mood and survives reload, six-size editing, deletion cancel/confirm; mocked Neon only')