"""Initial welcome cover: mocked APIs, no durable data or browser storage writes."""
import os
from datetime import datetime, timedelta, timezone
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3001')

with sync_playwright() as p:
    browser = p.chromium.launch()
    for width, height in [(320, 568), (1366, 768)]:
        for reduced in ['reduce', 'no-preference']:
            context = browser.new_context(viewport={'width': width, 'height': height}, reduced_motion=reduced)
            context.route('**/api/**', lambda route: route.fulfill(json={'teams': [], 'activeTeamId': None}))
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.clock.install()
            page.clock.pause_at(datetime.now(timezone.utc) + timedelta(seconds=1))
            page.goto(BASE + '/teams')
            intro = page.get_by_role('dialog', name='Mood Meter.')
            close = intro.get_by_role('button', name='Fermer l’introduction')
            expect(intro).to_be_visible()
            expect(close).to_be_focused()
            expect(page.get_by_role('dialog', name='Place à votre équipe')).not_to_be_visible()
            assert page.locator('#main-content').evaluate('(el) => !!el.closest("[inert]")')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            box = close.bounding_box()
            assert box['width'] >= 44 and box['height'] >= 44
            page.keyboard.press('Tab')
            expect(close).to_be_focused()
            page.clock.run_for(4000)
            expect(intro).to_be_visible()
            animations = intro.evaluate('(el) => el.getAnimations({subtree:true}).filter(a => a.playState === "running").length')
            assert (animations == 0) if reduced == 'reduce' else (animations > 0), animations
            page.clock.run_for(1100)
            expect(intro).to_have_count(0)
            assert not page.locator('#main-content').evaluate('(el) => !!el.closest("[inert]")')
            if width >= 1024:
                gate = page.get_by_role('dialog', name='Place à votre équipe', exact=True)
                expect(gate).to_be_visible()
                gate.get_by_role('button', name='Entrer en plein écran', exact=True).click()
                page.clock.run_for(1000)
                expect(gate).not_to_be_visible()
            page.get_by_role('link', name='Guide d’utilisation', exact=True).click()
            expect(page).to_have_url(BASE + '/help')
            expect(intro).to_have_count(0)
            page.reload()
            expect(intro).to_be_visible()
            expect(close).to_be_focused()
            close.click()
            expect(intro).to_have_count(0)
            page.clock.run_for(1000)
            page.reload()
            expect(close).to_be_focused()
            page.keyboard.press('Escape')
            expect(intro).to_have_count(0)
            assert not errors, errors
            context.close()
            print(f'PASS welcome {width}x{height} {reduced}: auto, close, Escape, navigation, reload')
    browser.close()