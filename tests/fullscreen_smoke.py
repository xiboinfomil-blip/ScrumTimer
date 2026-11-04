"""Silent fullscreen entry, gesture fallback and respected exits; mocked APIs only."""
import os
import json
from playwright.sync_api import sync_playwright, expect
from browser_bootstrap import install_browser_bootstrap

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3001')

with sync_playwright() as p:
    browser = p.chromium.launch()
    for scenario in ['native', 'gesture', 'rejected', 'unsupported', 'mobile', 'installed', 'escape-first']:
        context = browser.new_context(viewport={'width': 390 if scenario == 'mobile' else 1366, 'height': 844 if scenario == 'mobile' else 768}, reduced_motion='reduce', service_workers='block')
        guard = install_browser_bootstrap(context, fullscreen=False, intro=False)
        context.route('**/api/teams', lambda route: route.fulfill(json={'teams': [], 'activeTeamId': None}))
        context.route('**/api/jira', lambda route: route.fulfill(json={'connected': False}))
        context.add_init_script("""(() => {
            const scenario = SCENARIO;
            window.fullscreenCalls = 0;
            const native = Element.prototype.requestFullscreen;
            let full = null;
            if (scenario !== 'native') {
                Object.defineProperty(document, 'fullscreenEnabled', {get: () => scenario !== 'unsupported'});
                Object.defineProperty(document, 'fullscreenElement', {get: () => full});
                document.exitFullscreen = async () => { full = null; document.dispatchEvent(new Event('fullscreenchange')); };
            }
            Element.prototype.requestFullscreen = async function(...args) {
                window.fullscreenCalls++;
                if (scenario === 'native') return native.apply(this, args);
                if (scenario === 'rejected' || !navigator.userActivation.isActive) throw new Error('denied');
                full = this;
                document.dispatchEvent(new Event('fullscreenchange'));
            };
            if (scenario === 'installed') {
                const match = window.matchMedia.bind(window);
                window.matchMedia = query => {
                    const media = match(query);
                    if (query.includes('display-mode: standalone')) Object.defineProperty(media, 'matches', {value: true});
                    return media;
                };
            }
        })();""".replace('SCENARIO', json.dumps(scenario)))
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE + '/teams')
        expect(page.get_by_role('button', name='Fermer l’introduction')).to_be_visible()
        if scenario not in ['unsupported', 'installed']:
            page.wait_for_function('window.fullscreenCalls > 0')
        if scenario == 'escape-first':
            attempts = page.evaluate('window.fullscreenCalls')
            page.keyboard.press('Escape')
            assert page.evaluate('window.fullscreenCalls') == attempts
            expect(page.get_by_role('button', name='Fermer l’introduction')).not_to_be_visible()
            page.locator('#teams-heading').click()
        else:
            page.get_by_role('button', name='Fermer l’introduction').click()
        gate = page.get_by_role('dialog', name='Place à votre équipe', exact=True)
        expect(gate).to_have_count(0)
        entering = scenario in ['native', 'gesture', 'mobile', 'escape-first']
        if entering:
            page.wait_for_function('document.fullscreenElement === document.documentElement')
        else:
            assert not page.evaluate('Boolean(document.fullscreenElement)')
        page.get_by_role('link', name='Guide d’utilisation', exact=True).click()
        expect(page).to_have_url(BASE + '/help')
        if entering:
            assert page.evaluate('document.fullscreenElement === document.documentElement')
            page.evaluate('document.exitFullscreen()')
        attempts = page.evaluate('window.fullscreenCalls')
        page.keyboard.press('Escape')
        page.locator('h1').click()
        assert page.evaluate('window.fullscreenCalls') == attempts
        assert not page.evaluate('Boolean(document.fullscreenElement)')
        expect(gate).to_have_count(0)
        if scenario in ['unsupported', 'installed']:
            assert attempts == 0
        assert not errors, errors
        guard.assert_no_unexpected_api()
        context.close()
        print(f'PASS fullscreen {scenario}')
    browser.close()