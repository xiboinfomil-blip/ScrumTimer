"""Accessible workflow navigation and responsive route transitions; isolated APIs only."""
import os
import tempfile
from copy import deepcopy
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3000')
TEAM_ID = 'a' * 64
SIZES = [(320, 568), (390, 844), (768, 1024), (1024, 576), (1366, 768), (1920, 1080)]

with sync_playwright() as p:
    browser = p.chromium.launch()
    for preference in ['no-preference', 'reduce']:
        context = browser.new_context(viewport={'width': 1366, 'height': 768}, reduced_motion=preference)
        state = {'team': {'roster': [dict(id=str(i), name=name, present=i != 3, mood=None, moodUpdatedAt=None) for i, name in enumerate(['Alice', 'Benoît', 'Chloé', 'David'])], 'duration': 120, 'warning': 30, 'sound': False, 'session': [], 'usedMoodMeters': []}, 'revision': 1}
        errors = []
        def api(route):
            path = route.request.url.split('/api/', 1)[1]
            if path == 'teams':
                route.fulfill(json={'teams': [{'id': TEAM_ID, 'name': 'Équipe Produit', 'memberCount': 4}], 'activeTeamId': TEAM_ID})
            elif path == 'team':
                if route.request.method == 'PUT':
                    state['team'] = deepcopy(route.request.post_data_json['team'])
                    state['revision'] += 1
                route.fulfill(json=state)
            elif path == 'history':
                route.fulfill(json={'rounds': [], 'day': '2026-10-15'})
            elif path == 'daily-meter':
                route.fulfill(json={'day': '2026-10-15', 'meter': {'meterId': 'original', 'title': 'Baromètre original'}})
            elif path == 'mood-meters/catalog':
                route.fulfill(json=[])
            else:
                raise AssertionError(f'Unexpected API {path}')
        context.route('**/api/**', api)
        context.route('**/mood-meters/catalog.json', lambda route: route.fulfill(json={'remote': True}))
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE + '/participants')
        expect(page.get_by_text('Alice', exact=True)).to_be_visible()
        timeline = page.get_by_role('list', name='Progression du point quotidien')
        expect(timeline.get_by_role('listitem')).to_have_count(3)
        expect(timeline.get_by_role('button', name='Minuteur', exact=False)).to_be_disabled()
        expect(timeline.get_by_role('link', name='Participants', exact=True)).to_have_attribute('aria-current', 'page')
        for width, height in SIZES:
            page.set_viewport_size({'width': width, 'height': height})
            expect(timeline).to_be_visible()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width, height)
            for item in timeline.locator('a,button').all():
                box = item.bounding_box()
                assert box and box['height'] >= 44 and box['x'] >= 0 and box['x'] + box['width'] <= width + 1, (width, box)
            button = page.get_by_role('button', name='Continuer vers les humeurs')
            box = button.bounding_box()
            assert box and box['y'] + box['height'] <= height + 1, (width, box)
            if preference == 'no-preference' and width in [320, 1366]:
                page.wait_for_function("document.querySelector('#main-content').getAnimations({subtree:true}).filter(a => a.effect.getTiming().iterations !== Infinity).every(a => a.playState !== 'running')")
                page.screenshot(path=str(Path(tempfile.gettempdir()) / f'scrum-material-{width}.png'))
        page.set_viewport_size({'width': 1366, 'height': 768})
        page.get_by_role('link', name='Humeurs', exact=True).click()
        expect(page.get_by_role('link', name='Humeurs', exact=True)).to_have_attribute('aria-current', 'page')
        expect(page.locator('[data-route-transition]')).to_be_visible()
        expect(timeline.locator('[data-step-complete="true"]')).to_have_count(1)
        expect(page.locator('#meter-catalogue-select')).to_have_value('-2')
        expect(page.locator('.site-header a[href^="/statistics"], .site-header a[href^="/daily-notes"]')).to_have_count(0)
        page.get_by_role('link', name='Participants', exact=True).click()
        expect(page.get_by_text('Alice', exact=True)).to_be_visible()
        if preference == 'reduce':
            assert page.evaluate("document.getAnimations().filter(a => a.playState === 'running').length") == 0
        assert not errors, errors
        context.close()
        print(f'PASS accessible workflow navigation / guarded timer / route transitions / six viewports / {preference}')
    browser.close()