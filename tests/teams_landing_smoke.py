"""Team landing/management/attendance journeys. Isolated mock database only."""
import os
import tempfile
from pathlib import Path
from copy import deepcopy
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from browser_bootstrap import install_browser_bootstrap, team_fixture

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3000')
A, B, C = 'a' * 64, 'b' * 64, 'c' * 64

def team(names):
    return team_fixture(names)

with sync_playwright() as p:
    browser = p.chromium.launch()
    for motion in ['reduce', 'no-preference']:
        for width, height in [(320, 568), (390, 844), (650, 568), (768, 1024), (1024, 576), (1366, 768)]:
            context = browser.new_context(viewport={'width': width, 'height': height}, reduced_motion=motion, service_workers='block')
            bootstrap = install_browser_bootstrap(context)
            db = {A: {'name': 'Équipe Alpha', 'team': team(['Alice', 'Alex']), 'revision': 1}, B: {'name': 'Équipe Bêta', 'team': team(['Bob']), 'revision': 1}}
            def api(route):
                req, path = route.request, urlparse(route.request.url).path
                if path == '/api/teams':
                    selected = A
                    if req.method == 'PATCH': selected = req.post_data_json['teamId']
                    elif req.method == 'POST':
                        assert req.post_data_json['name'] == 'Gamma'
                        db[C] = {'name': 'Gamma', 'team': team([]), 'revision': 1}
                        selected = C
                    route.fulfill(json={'teams': [{'id': key, 'name': value['name'], 'memberCount': len(value['team']['roster'])} for key, value in db.items()], 'activeTeamId': selected})
                elif path == '/api/team':
                    key = req.headers.get('x-team-id')
                    assert key in db
                    if req.method == 'PUT':
                        body = req.post_data_json
                        assert body['revision'] == db[key]['revision']
                        db[key]['team'] = {**deepcopy(body['team']), 'session': [], 'currentMoodSlide': None}
                        db[key]['revision'] += 1
                    route.fulfill(json={'team': deepcopy(db[key]['team']), 'revision': db[key]['revision']})
                elif path == '/api/history': route.fulfill(json={'rounds': []})
                else: route.fallback()
            context.route('**/api/**', api)
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            def saved():
                page.wait_for_function("document.querySelector('.site-header [role=status]')?.title === 'Équipe enregistrée dans Neon.'")
            def fits():
                page.evaluate('async () => { for (let i=0;i<4;i++) await new Promise(requestAnimationFrame); }')
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width, page.url)
                for listing in page.locator('main .checkin-list:visible').all():
                    assert listing.evaluate('e => e.scrollHeight <= e.clientHeight + 2'), (width, page.url, listing.evaluate('e => [e.clientHeight, e.scrollHeight]'))
                for node in page.locator('main button:visible, main a:visible, main input:visible').all():
                    box = node.bounding_box()
                    if box and 0 <= box['y'] < height:
                        assert box['x'] >= -1 and box['x'] + box['width'] <= width + 1, (width, box)
            page.goto(BASE)
            expect(page.locator('#teams-heading')).to_be_visible()
            saved()
            search = page.get_by_role('searchbox', name='Rechercher une équipe', exact=True)
            search.fill('introuvable')
            expect(page.get_by_text('Aucune équipe trouvée.', exact=True)).to_be_visible()
            search.fill('beta')
            expect(page.get_by_role('list', name='Équipes disponibles').locator('li')).to_have_count(1)
            page.get_by_role('button', name='Ouvrir l’équipe Équipe Bêta', exact=True).click()
            expect(page.get_by_text('Bob', exact=True)).to_be_visible()
            assert 'team=' + B in page.url
            expect(page.locator('#checkin-name')).to_have_count(0)
            expect(page.get_by_role('button', name='Modifier le nom de Bob', exact=True)).to_have_count(0)
            fits()
            page.get_by_role('button', name='Déplacer Bob vers les absents', exact=True).click()
            saved()
            assert db[B]['team']['roster'][0]['present'] is False
            if width < 650:
                page.get_by_role('button', name='Absents', exact=False).click()
            expect(page.get_by_role('button', name='Déplacer Bob vers les présents', exact=True)).to_be_visible()
            page.get_by_role('button', name='Déplacer Bob vers les présents', exact=True).click()
            saved()
            page.get_by_role('link', name='Gérer l’équipe', exact=True).click()
            expect(page.locator('#manage-team-heading')).to_have_text('Équipe Bêta')
            page.locator('#checkin-name').fill('Charlie <safe>')
            page.get_by_role('button', name='Enregistrer cette personne', exact=True).click()
            saved()
            page.get_by_role('searchbox', name='Rechercher un membre', exact=True).fill('Charlie')
            page.get_by_role('button', name='Modifier le nom de Charlie <safe>', exact=True).click()
            dialog = page.get_by_role('dialog', name='Modifier le nom du participant', exact=True)
            dialog.get_by_role('textbox').fill('Charly')
            dialog.get_by_role('button', name='Enregistrer', exact=True).click()
            expect(dialog).not_to_be_visible()
            saved()
            page.get_by_role('searchbox', name='Rechercher un membre', exact=True).fill('Charly')
            fits()
            if motion == 'reduce' and width in [320, 1366]: page.screenshot(path=str(Path(tempfile.gettempdir()) / f'scrum-manage-team-{width}.png'))
            page.get_by_role('button', name='Retirer Charly de l’équipe', exact=True).click()
            deletion = page.get_by_role('dialog', name='Supprimer cette personne ?', exact=True)
            deletion.get_by_role('button', name='Annuler', exact=True).click()
            expect(deletion).not_to_be_visible()
            page.get_by_role('button', name='Retirer Charly de l’équipe', exact=True).click()
            deletion.get_by_role('button', name='Supprimer', exact=True).click()
            saved()
            assert [person['name'] for person in db[B]['team']['roster']] == ['Bob']
            assert [person['name'] for person in db[A]['team']['roster']] == ['Alice', 'Alex']
            page.get_by_role('link', name='Toutes les équipes', exact=True).click()
            expect(page.locator('#teams-heading')).to_be_visible()
            fits()
            if motion == 'reduce' and width in [320, 1366]: page.screenshot(path=str(Path(tempfile.gettempdir()) / f'scrum-teams-{width}.png'))
            page.get_by_role('textbox', name='Nom de l’équipe', exact=True).fill('Gamma')
            page.get_by_role('button', name='Créer une équipe', exact=True).click()
            expect(page.locator('#manage-team-heading')).to_have_text('Gamma')
            expect(page.get_by_text('Votre équipe prend forme ici.', exact=True)).to_be_visible()
            page.reload()
            expect(page.locator('#manage-team-heading')).to_have_text('Gamma')
            fits()
            assert not errors, errors
            bootstrap.assert_no_unexpected_api()
            context.close()
            print(f'PASS landing/search/create/manage/attendance/isolation {width}x{height} {motion}')
    browser.close()