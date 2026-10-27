"""Attendance board: empty/full/search/focus/absence states; mocked APIs only."""
import os
from copy import deepcopy
from playwright.sync_api import sync_playwright, expect
from browser_bootstrap import install_browser_bootstrap

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3000')
SIZES = [(320, 568), (390, 844), (650, 600), (768, 1024), (820, 568), (1024, 576), (1366, 768), (1920, 1080)]

with sync_playwright() as p:
    browser = p.chromium.launch()
    for motion in ['reduce', 'no-preference']:
        context = browser.new_context(reduced_motion=motion, service_workers='block')
        install_browser_bootstrap(context)
        data = {'team': {'roster': [], 'session': [], 'duration': 120, 'warning': 30, 'sound': False, 'usedMoodMeters': []}, 'revision': 1}
        def api(route):
            path = route.request.url.split('/api/', 1)[1]
            if path == 'teams':
                route.fulfill(json={'teams': [{'id': 'a' * 64, 'name': 'Équipe Produit', 'memberCount': len(data['team']['roster'])}], 'activeTeamId': 'a' * 64})
            elif path == 'team':
                if route.request.method == 'PUT':
                    data['team'] = deepcopy(route.request.post_data_json['team'])
                    data['revision'] += 1
                route.fulfill(json=data)
            elif path == 'history':
                route.fulfill(json={'rounds': [], 'day': '2026-10-15'})
            else:
                raise AssertionError(path)
        context.route('**/api/**', api)
        page = context.new_page()
        for count in [0, 40]:
            data['team']['roster'] = [dict(id=str(i), name=f'Participant au nom particulièrement long {i}', present=i % 3 != 0, mood=None, moodUpdatedAt=None) for i in range(count)]
            page.goto(BASE + '/participants')
            expect(page.get_by_role('heading', name='Présences', exact=True)).to_be_visible()
            expect(page.get_by_role('link', name='Gérer l’équipe', exact=True)).to_be_visible()
            expect(page.locator('#checkin-name')).to_have_count(0)
            expect(page.get_by_role('button', name='Continuer vers les humeurs')).to_be_enabled() if count else expect(page.get_by_role('button', name='Continuer vers les humeurs')).to_be_disabled()
            for width, height in SIZES:
                page.set_viewport_size({'width': width, 'height': height})
                page.evaluate('async () => { for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame); }')
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                for listing in page.locator('.checkin-list:visible').all():
                    assert listing.evaluate('e => e.scrollHeight <= e.clientHeight + 2'), (count, width)
                for button in page.locator('#participants-page button:visible').all():
                    if button.evaluate("e => getComputedStyle(e).visibility === 'hidden'"):
                        continue
                    box = button.bounding_box()
                    assert box['height'] >= 43.9, (count, width, box)
                    assert box['x'] >= 0 and box['x'] + box['width'] <= width + 1, (count, width, box)
                    assert box['y'] + box['height'] <= height + 1, (count, width, box)
                if count and width < 650:
                    group = page.get_by_role('group', name='Afficher les présences')
                    group.get_by_role('button', name='Absents').click()
                    expect(page.locator('#attendance-absent')).to_be_visible()
                    expect(page.locator('#attendance-present')).not_to_be_visible()
                    group.get_by_role('button', name='Présents').click()
            if count:
                search = page.get_by_role('searchbox', name='Rechercher un participant', exact=True)
                search.fill('particulierement long 1')
                expect(page.locator('#attendance-present .checkin-person').first).to_be_visible()
                search.fill('introuvable')
                expect(page.locator('.checkin-person')).to_have_count(0)
                expect(page.get_by_role('button', name='Continuer vers les humeurs')).to_be_enabled()
                search.fill('particulierement long 1')
                move = page.locator('#attendance-present .attendance-button').first
                name = page.locator('#attendance-present .checkin-person strong').first.inner_text()
                move.click()
                expect(page.locator('#attendance-present h3')).to_be_focused()
                expect(page.get_by_role('button', name=f'Déplacer {name} vers les présents', exact=True)).to_be_visible()
                search.fill('')
        context.close()
        print(f'PASS attendance design / empty + 40 mixed / search + focus / eight sizes / {motion}')
    browser.close()