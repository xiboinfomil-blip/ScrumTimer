"""Motion contracts with fail-closed APIs: no live data, no persisted timer progress."""
import os
from datetime import datetime, timezone
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3000')
TEAM = 'a' * 64

with sync_playwright() as p:
    browser = p.chromium.launch()
    for preference in ['no-preference', 'reduce']:
        for width, height in [(390, 844), (1366, 768)]:
            context = browser.new_context(viewport={'width': width, 'height': height}, reduced_motion=preference)
            unexpected, errors = [], []
            team = {'roster': [dict(id=str(i), name=name, present=i != 2, mood=2, moodUpdatedAt=None)
                               for i, name in enumerate(['Alice', 'Benoît', 'Chloé'])],
                    'session': [], 'duration': 120, 'warning': 20, 'sound': False, 'usedMoodMeters': []}
            def api(route):
                path = urlparse(route.request.url).path
                payload = {
                    '/api/teams': {'teams': [{'id': TEAM, 'name': 'Équipe mouvement', 'memberCount': 3}], 'activeTeamId': TEAM},
                    '/api/team': {'team': team, 'revision': 1} if route.request.method == 'GET' else {'revision': 2},
                    '/api/history': {'rounds': []},
                    '/api/daily-meter': {'day': datetime.now(timezone.utc).date().isoformat(), 'meter': None},
                    '/api/daily-hints': {'day': datetime.now(timezone.utc).date().isoformat(), 'hints': []},
                    '/api/meeting-settings': {'prompts': [], 'revision': 0},
                    '/api/mood-meters/catalog': [],
                }.get(path)
                if payload is None:
                    unexpected.append(f'{route.request.method} {path}')
                    route.fulfill(status=599, json={'error': 'Unmocked API blocked'})
                else:
                    route.fulfill(json=payload)
            context.route('**/api/**', api)
            context.route('**/mood-meters/catalog.json', lambda r: r.fulfill(json={'remote': True}))
            page = context.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(BASE + '/help')
            expect(page.get_by_role('button', name='Choisir une équipe : Équipe mouvement', exact=True)).to_be_enabled()
            article = page.get_by_role('article', name='Une équipe, un tour de parole, un bilan.')
            expect(article).to_be_visible()
            assert article.evaluate('el => getComputedStyle(el).scrollBehavior') == ('smooth' if preference == 'no-preference' else 'auto')
            # Anchor clicks must move the actual nested scroll container, gradually unless opted out.
            article.evaluate('el => el.scrollTo({top: 0, behavior: "instant"})')
            positions = article.evaluate('''el => new Promise(resolve => {
                const positions = [el.scrollTop];
                el.querySelector('a[href="#score"]').click();
                let frames = 0;
                const sample = () => {
                    positions.push(el.scrollTop);
                    if (++frames < 100) requestAnimationFrame(sample);
                    else resolve(positions);
                };
                requestAnimationFrame(sample);
            })''')
            assert max(positions) > 100, positions
            if preference == 'no-preference':
                assert any(5 < position < max(positions) - 5 for position in positions), ('anchor must scroll gradually', positions)
            expect(page.locator('#score-heading')).to_be_in_viewport()
            page.goto(BASE + '/participants')
            expect(page.get_by_role('link', name='Humeurs', exact=True)).to_be_visible()
            if width < 650:
                page.get_by_role('group', name='Afficher les présences').get_by_role('button', name='Absents', exact=False).click()
                expect(page.locator('#attendance-absent')).to_be_visible()
                page.get_by_role('group', name='Afficher les présences').get_by_role('button', name='Présents', exact=False).click()
            page.goto(BASE + '/mood')
            expect(page.locator('#mood-page')).to_be_visible()
            if width <= 800:
                page.get_by_role('button', name='Humeurs de l’équipe', exact=True).click()
                expect(page.get_by_role('region', name='Le ressenti de votre équipe')).to_be_visible()
            panels = page.locator('#mood-page [data-view]')
            # A state change must create a finite fade, not an infinite or countdown-driven animation.
            if width <= 800:
                running = panels.evaluate('el => el.getAnimations({subtree: true}).filter(a => a.playState === "running" && a.effect.getTiming().iterations !== Infinity).length')
                assert bool(running) == (preference == 'no-preference'), (preference, running)
            trigger = page.get_by_role('button', name='Choisir une équipe : Équipe mouvement', exact=True)
            trigger.click()
            menu = page.get_by_role('region', name='Choisir ou créer une équipe')
            expect(menu).to_be_visible()
            page.keyboard.press('Escape')
            expect(trigger).to_be_focused()
            expect(menu).not_to_be_visible()
            page.wait_for_function('document.getAnimations().every(a => a.playState !== "running" || a.effect.getTiming().iterations === Infinity)')
            assert not page.locator('[inert]').count(), 'exiting menu must be removed'
            page.emulate_media(reduced_motion='reduce')
            assert page.locator('html').evaluate('el => getComputedStyle(el).scrollBehavior') == 'auto'
            assert not unexpected, unexpected
            assert not errors, errors
            context.close()
            print(f'PASS smooth nested scroll, panel motion, menu focus/exit, runtime motion opt-out {width}x{height} {preference}')
    browser.close()