"""Statistics dashboard states and responsive contracts; no live database traffic."""
import os
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3000')
SIZES = [(320, 568), (390, 844), (768, 1024), (820, 568), (1024, 576), (1366, 768), (1920, 1080)]
now = datetime.now(timezone.utc) - timedelta(minutes=1)
people = [dict(id=str(i), name=f'Participant au nom particulièrement long {i}', mood=i % 4 + 1, speakingSeconds=30 + i, budgetSeconds=120, timeUp=False, score=1000 - i * 20, meterTitle='Baromètre original') for i in range(12)]
rounds = [dict(id='today', completedAt=now.isoformat(), people=people), dict(id='expired', completedAt=(now - timedelta(days=8)).isoformat(), people=people)]

with sync_playwright() as p:
    browser = p.chromium.launch()
    for motion in ['reduce', 'no-preference']:
        context = browser.new_context(reduced_motion=motion)
        state = ['populated']
        requests = [0]
        def api(route):
            path = route.request.url.split('/api/', 1)[1]
            if path == 'teams':
                route.fulfill(json={'teams': [{'id': 'a' * 64, 'name': 'Équipe Produit & Innovation', 'memberCount': 12}], 'activeTeamId': 'a' * 64})
            elif path == 'team':
                route.fulfill(json={'team': {'roster': [], 'session': [], 'duration': 120, 'warning': 30, 'sound': False, 'usedMoodMeters': []}, 'revision': 1})
            elif path == 'history':
                requests[0] += 1
                if state[0] == 'error' and requests[0] > 1:
                    route.fulfill(status=503, json={'error': 'Unavailable'})
                else:
                    route.fulfill(json={'rounds': rounds if state[0] == 'populated' else []})
            else:
                raise AssertionError(path)
        context.route('**/api/**', api)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        for mode in ['populated', 'empty', 'error']:
            state[0], requests[0] = mode, 0
            page.goto(BASE + '/statistics')
            if mode == 'error':
                expect(page.get_by_role('button', name='Réessayer', exact=True)).to_be_enabled()
                expect(page.get_by_text('Aucune donnée de remplacement', exact=False)).to_be_visible()
                expect(page.locator('dd').first).to_have_text('—')
            else:
                expect(page.get_by_role('button', name='Actualiser', exact=True)).to_be_enabled()
                expect(page.locator('dd').first).to_have_text('1' if mode == 'populated' else '0')
            expect(page.locator('#daily-heading').locator('..').locator('ol > li')).to_have_count(5)
            if mode == 'populated':
                ranking = page.get_by_role('list', name='Classement des participants', exact=True)
                expect(ranking.locator('> li')).to_have_count(8)
                page.get_by_role('button', name='Page suivante du classement').click()
                expect(ranking.locator('> li')).to_have_count(4)
                page.get_by_role('button', name='Page précédente du classement').click()
                page.locator('#recent-heading').locator('..').locator('summary').first.click()
                page.get_by_role('button', name='Comprendre le score de Participant au nom particulièrement long 0', exact=True).click()
                expect(page.get_by_role('dialog')).to_be_visible()
                page.keyboard.press('Escape')
                expect(page.get_by_role('dialog')).not_to_be_visible()
                page.locator('#recent-heading').locator('..').locator('summary').first.click()
            for width, height in SIZES:
                page.set_viewport_size({'width': width, 'height': height})
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (mode, width)
                for element in page.locator('#main-content button, #main-content summary').all():
                    box = element.bounding_box()
                    if box:
                        assert box['height'] >= 43.9, (mode, width, box)
                        assert box['x'] >= 0 and box['x'] + box['width'] <= width + 1, (mode, width, box)
                if mode == 'populated' and motion == 'reduce' and width in [320, 1366]:
                    page.locator('#statistics-heading').scroll_into_view_if_needed()
                    page.screenshot(path=str(Path(tempfile.gettempdir()) / f'scrum-statistics-{width}.png'))
            if mode == 'error':
                state[0] = 'populated'
                page.get_by_role('button', name='Réessayer', exact=True).click()
                expect(page.locator('dd').first).to_have_text('1')
        assert not errors, errors
        context.close()
        print(f'PASS statistics / populated + empty + error/retry / seven sizes / pagination + score detail / {motion}')
    browser.close()