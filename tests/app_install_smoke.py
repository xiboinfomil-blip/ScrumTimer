"""Main app install lifecycle and real branded assets; API mocks, no native OS install."""
import os
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from browser_bootstrap import install_browser_bootstrap
from companion_install_smoke import valid_png, PROMPT

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3001')

with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    context = browser.new_context(viewport={'width': 1366, 'height': 768}, reduced_motion='reduce', service_workers='block')
    guard = install_browser_bootstrap(context)
    context.route('**/api/teams', lambda route: route.fulfill(json={'teams': [], 'activeTeamId': None}))
    context.route('**/api/jira', lambda route: route.fulfill(json={'connected': False}))
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE + '/teams')
    expect(page.locator('#teams-heading')).to_be_visible()
    expect(page.locator('link[rel="manifest"]')).to_have_attribute('href', '/manifest.webmanifest')
    manifest_response = context.request.get(BASE + '/manifest.webmanifest')
    assert manifest_response.ok
    manifest = manifest_response.json()
    assert manifest['id'] == '/' and manifest['scope'] == '/' and manifest['start_url'] == '/participants'
    assert manifest['display'] == 'fullscreen'
    assert 'team=' not in str(manifest) and 'token' not in str(manifest)
    for size in [192, 512]:
        response = context.request.get(BASE + f'/app-icon?size={size}')
        assert response.ok and response.headers['content-type'].startswith('image/png')
        valid_png(response.body(), size)
    apple = page.locator('link[rel="apple-touch-icon"]').first.get_attribute('href')
    response = context.request.get(BASE + apple)
    assert response.ok
    valid_png(response.body(), 180)
    colors = page.evaluate("""async () => {
        const image = new Image(); image.src = '/app-icon?size=512'; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
        const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
        const pixels = ctx.getImageData(0, 0, 512, 512).data;
        let blue = 0, orange = 0, white = 0;
        for (let index = 0; index < pixels.length; index += 4) {
            const [red, green, blueValue] = pixels.slice(index, index + 3);
            if (red === 32 && green === 95 && blueValue === 157) blue++;
            if (red === 236 && green === 139 && blueValue === 35) orange++;
            if (red === 255 && green === 255 && blueValue === 255) white++;
        }
        return {blue, orange, white};
    }""")
    assert colors['blue'] > 5000 and colors['orange'] > 2000 and colors['white'] > 10000, colors
    install = page.get_by_role('button', name='Installer l’application', exact=True)
    for outcome in ['dismissed', 'accepted']:
        assert page.evaluate(PROMPT, outcome)
        expect(install).to_be_visible()
        assert page.evaluate('window.installCalls') == 0
        for width in [320, 390, 820, 1024, 1366, 1920]:
            page.set_viewport_size({'width': width, 'height': 768})
            if width <= 800:
                expect(install).to_be_hidden()
            else:
                expect(install).to_be_visible()
            page.wait_for_function('document.documentElement.scrollWidth <= innerWidth')
        page.set_viewport_size({'width': 1366, 'height': 768})
        install.click()
        assert page.evaluate('window.installCalls') == 1
        expect(install).to_be_disabled()
        page.evaluate('window.resolveInstallChoice()')
        expect(install).to_have_count(0)
    page.evaluate("""() => {
        const event = new Event('beforeinstallprompt', {cancelable: true});
        event.prompt = () => Promise.reject(new Error('denied'));
        event.userChoice = Promise.resolve({outcome:'dismissed'});
        window.dispatchEvent(event);
    }""")
    install.click()
    expect(install).to_have_count(0)
    page.evaluate(PROMPT, 'dismissed')
    page.screenshot(path=str(Path(tempfile.gettempdir()) / 'scrum-app-install-1366.png'))
    page.evaluate("window.dispatchEvent(new Event('appinstalled'))")
    expect(install).to_have_count(0)
    assert not page.evaluate(PROMPT, 'dismissed')
    expect(install).to_have_count(0)
    assert not errors, errors
    guard.assert_no_unexpected_api()
    context.close()
    browser.close()
    print('PASS main install: manifest, PNGs, Apple icon, brand pixels, six widths, prompt outcomes and rejection')