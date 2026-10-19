"""Responsive team directory, pagination and accessible form feedback. Mock API only."""
import os
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from fullscreen_helpers import emulate_fullscreen

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3000')
TEAM_ID = 'a' * 64

with sync_playwright() as p:
    browser = p.chromium.launch()
    for motion in ['reduce', 'no-preference']:
        for width, height in [(320, 568), (768, 1024), (1440, 900)]:
            context = browser.new_context(viewport={'width': width, 'height': height}, reduced_motion=motion)
            emulate_fullscreen(context)
            teams = [{'id': TEAM_ID, 'name': 'Équipe Alpha', 'memberCount': 2}] + [
                {'id': f'{i:064x}', 'name': f'Équipe {i} ' + ('TrèsLongNomSansEspace' * 2 if i == 7 else 'Produit'), 'memberCount': i}
                for i in range(1, 8)
            ]
            writes = []

            def api(route):
                req, path = route.request, urlparse(route.request.url).path
                if req.method != 'GET':
                    writes.append(path)
                    route.fulfill(status=409, json={'error': 'Nom déjà utilisé.'})
                elif path == '/api/teams':
                    route.fulfill(json={'teams': teams, 'activeTeamId': TEAM_ID if teams else None})
                elif path == '/api/team':
                    route.fulfill(json={'team': {'roster': [], 'duration': 120, 'warning': 30, 'sound': False, 'session': [], 'usedMoodMeters': [], 'currentMoodSlide': None}, 'revision': 1})
                elif path == '/api/history':
                    route.fulfill(json={'rounds': []})
                else:
                    raise AssertionError(path)

            context.route('**/api/**', api)
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(BASE + '/teams')
            listing = page.get_by_role('list', name='Équipes disponibles', exact=True)
            expect(listing.locator('li')).to_have_count(6)
            next_page = page.get_by_role('button', name='Page suivante des équipes', exact=True)
            next_page.click()
            expect(listing.locator('li')).to_have_count(2)
            expect(page.locator('#team-list-heading')).to_be_focused()
            expect(next_page).to_be_disabled()
            page.get_by_role('button', name='Page précédente des équipes', exact=True).click()
            expect(listing.locator('li')).to_have_count(6)

            search = page.get_by_role('searchbox', name='Rechercher une équipe', exact=True)
            search.fill('alpha')
            expect(listing.locator('li')).to_have_count(1)
            expect(page.get_by_role('navigation', name='Pagination des équipes')).to_have_count(0)
            search.fill('inexistant')
            page.get_by_role('button', name='Effacer la recherche', exact=True).click()
            expect(listing.locator('li')).to_have_count(6)

            field = page.get_by_role('textbox', name='Nom de l’équipe', exact=True)
            page.get_by_role('button', name='Créer une équipe', exact=True).click()
            expect(field).to_be_focused()
            expect(field).to_have_attribute('aria-invalid', 'true')
            expect(page.locator('#team-create-error')).to_be_visible()
            assert not writes, writes
            field.fill('Équipe Alpha')
            expect(field).to_have_attribute('aria-invalid', 'false')
            field.press('Enter')
            expect(page.locator('#team-create-error')).to_contain_text('Création impossible.')
            assert writes == ['/api/teams'], writes
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')

            # An empty directory offers a keyboard-accessible shortcut into creation.
            teams.clear()
            page.reload()
            page.get_by_role('button', name='Nommer mon équipe', exact=False).click()
            expect(field).to_be_focused()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            assert not errors, errors
            context.close()
            print(f'PASS directory/pagination/form/empty-state {width}x{height} {motion}')
    browser.close()