"""Shared loader rendering, motion and hydration; all APIs mocked."""
import os
from pathlib import Path
from tempfile import gettempdir
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

from browser_bootstrap import install_browser_bootstrap

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3001').rstrip('/')


def assert_loader(page, loader, motion):
    expect(loader).to_be_visible()
    expect(loader).to_have_attribute('role', 'status')
    expect(loader).to_have_attribute('aria-live', 'polite')
    svg = loader.locator('svg')
    expect(svg.locator('circle')).to_have_count(6)
    assert loader.evaluate("""element => {
        const svg = element.querySelector('svg').getBoundingClientRect();
        const label = element.lastElementChild.getBoundingClientRect();
        const box = element.getBoundingClientRect();
        if (label.top < svg.bottom || box.left < 0 || box.right > innerWidth + 1) return false;
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
            const style = getComputedStyle(parent);
            const clip = parent.getBoundingClientRect();
            if (['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowY) &&
                (box.top < clip.top - 1 || box.bottom > clip.bottom + 1)) return false;
        }
        return true;
    }"""), 'Loader or label clipped by its container'
    animations = loader.evaluate("element => element.getAnimations({subtree:true}).map(animation => ({name:animation.animationName, state:animation.playState}))")
    if motion == 'reduce':
        assert animations == [], animations
    else:
        assert sorted(animation['name'] for animation in animations) == [
            'cradle-dot', 'cradle-dot', 'cradle-dot', 'cradle-left', 'cradle-right'], animations
        assert all(animation['state'] == 'running' for animation in animations), animations
        initial = loader.locator('svg g').first.evaluate('element => getComputedStyle(element).transform')
        page.wait_for_function("""initial => {
            const ball = document.querySelector('[data-loader] svg g');
            return getComputedStyle(ball).transform !== initial;
        }""", arg=initial)
        dot = loader.locator('span span span').first
        opacity = dot.evaluate('element => getComputedStyle(element).opacity')
        page.wait_for_function("""opacity => {
            const dot = document.querySelector('[data-loader] > span > span > span');
            return getComputedStyle(dot).opacity !== opacity;
        }""", arg=opacity)
    assert svg.evaluate("""async element => {
        const source = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(element)], {type:'image/svg+xml'}));
        try {
            const image = new Image();
            image.src = source;
            await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = 176; canvas.height = 112;
            const context = canvas.getContext('2d');
            context.drawImage(image, 0, 0, 176, 112);
            const pixels = context.getImageData(0, 0, 176, 112).data;
            let dark = 0;
            for (let index = 0; index < pixels.length; index += 4) {
                if (pixels[index + 3] && Math.max(...pixels.slice(index, index + 3)) < 180) dark++;
            }
            return dark > 100;
        } finally { URL.revokeObjectURL(source); }
    }"""), 'Blank cradle image'


def run_case(browser, width, height, motion):
    context = browser.new_context(viewport={'width': width, 'height': height}, reduced_motion=motion, service_workers='block')
    bootstrap = install_browser_bootstrap(context, intro=False)
    pending, errors = [], []

    def api(route):
        if urlparse(route.request.url).path == '/api/teams' and route.request.method == 'GET':
            pending.append(route)
        elif urlparse(route.request.url).path == '/api/jira' and route.request.method == 'GET':
            route.fulfill(json={'configured': False, 'connected': False})
        else:
            route.fallback()

    context.route('**/api/**', api)
    try:
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        with page.expect_request('**/api/teams'):
            page.goto(BASE + '/teams', wait_until='domcontentloaded')
        page.get_by_role('button', name='Fermer l\u2019introduction', exact=True).click()
        loader = page.locator('[data-loader="cradle"]')
        expect(loader).to_have_count(1)
        assert_loader(page, loader, motion)
        if motion == 'no-preference':
            page.screenshot(path=str(Path(gettempdir()) / f'scrum-loader-{width}.png'))
        assert pending, 'Expected a pending team-directory read'
        for route in pending:
            route.fulfill(json={'teams': [], 'activeTeamId': None})
        pending.clear()
        expect(page.locator('#teams-heading')).to_be_visible()
        expect(loader).to_have_count(0)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        bootstrap.assert_no_unexpected_api()
        assert not errors, errors
        print(f'PASS loader {width}x{height} {motion}', flush=True)
    finally:
        context.close()


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            for motion in ('no-preference', 'reduce'):
                for width, height in ((320, 568), (1024, 576), (1366, 768)):
                    run_case(browser, width, height, motion)
        finally:
            browser.close()


if __name__ == '__main__':
    main()