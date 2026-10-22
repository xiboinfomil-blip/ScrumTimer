"""Optional desktop fullscreen invitation: native API, dismissal and fallback; mocked APIs only."""
import os
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3001')

with sync_playwright() as p:
    browser = p.chromium.launch()
    for scenario in ['native', 'rejected', 'unsupported', 'mobile', 'dismiss', 'escape']:
        context = browser.new_context(viewport={'width': 390 if scenario == 'mobile' else 1366, 'height': 844 if scenario == 'mobile' else 768}, reduced_motion='reduce')
        context.route('**/api/**', lambda route: route.fulfill(json={'teams': [], 'activeTeamId': None}))
        if scenario == 'unsupported':
            context.add_init_script("Object.defineProperty(document, 'fullscreenEnabled', {get: () => false});")
        if scenario == 'rejected':
            context.add_init_script("Element.prototype.requestFullscreen = async () => { throw new Error('denied'); };")
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE + '/teams')
        page.get_by_role('button', name='Fermer l’introduction').click()
        gate = page.get_by_role('dialog', name='Place à votre équipe', exact=True)
        if scenario == 'mobile':
            expect(gate).not_to_be_visible()
        else:
            expect(gate).to_be_visible()
            if scenario == 'escape':
                page.keyboard.press('Escape')
            elif scenario == 'dismiss':
                gate.get_by_role('button', name='Continuer sans plein écran').click()
            else:
                gate.get_by_role('button', name='Entrer en plein écran', exact=True).click()
            if scenario == 'native':
                expect(gate).not_to_be_visible()
                assert page.evaluate('document.fullscreenElement === document.documentElement')
                # Client navigation preserves the fullscreen document, including portals.
                page.get_by_role('link', name='Guide d’utilisation', exact=True).click()
                expect(page).to_have_url(BASE + '/help')
                assert page.evaluate('document.fullscreenElement === document.documentElement')
                page.evaluate('document.exitFullscreen()')
                expect(gate).not_to_be_visible()
            elif scenario == 'rejected':
                expect(gate.get_by_role('alert')).to_contain_text('refusé')
                expect(gate).to_be_visible()
                gate.get_by_role('button', name='Continuer sans plein écran').click()
                expect(gate).not_to_be_visible()
            elif scenario == 'unsupported':
                expect(gate.get_by_role('alert')).to_contain_text('pas disponible')
                gate.get_by_role('button', name='Continuer sans plein écran').click()
                expect(gate).not_to_be_visible()
            else:
                expect(gate).not_to_be_visible()
                assert not page.evaluate('Boolean(document.fullscreenElement)')
                page.get_by_role('link', name='Guide d’utilisation', exact=True).click()
                expect(page).to_have_url(BASE + '/help')
                page.evaluate("document.dispatchEvent(new Event('fullscreenchange'))")
                expect(gate).not_to_be_visible()
        assert not errors, errors
        context.close()
        print(f'PASS fullscreen {scenario}')
    browser.close()