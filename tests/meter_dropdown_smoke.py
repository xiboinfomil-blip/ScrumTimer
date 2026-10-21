"""Dropdown changes persisted through mocked daily API; no live database writes."""
import os
import tempfile
from pathlib import Path
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from browser_bootstrap import install_browser_bootstrap

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3000')
ID = 'a' * 64


def viewer(page, remote=False):
    """The image viewer is a dialog, independent of browser fullscreen."""
    fullscreen_before = page.evaluate('document.fullscreenElement === document.documentElement')
    page.get_by_role('button', name='Afficher le baromètre en plein écran', exact=True).click()
    dialog = page.get_by_role('dialog', name='Test meter' if remote else 'Baromètre original', exact=True)
    expect(dialog).to_be_visible()
    close = dialog.get_by_role('button', name='Fermer le plein écran', exact=True)
    expect(close).to_be_visible()
    if remote:
        image = dialog.locator('#expanded-meter-slide')
        buttons = dialog.get_by_role('group', name='Diapositives en plein écran').get_by_role('button')
        expect(buttons).to_have_text(['Diapositive 1', 'Diapositive 2'])
        for number in (1, 2, 1):
            button = dialog.get_by_role('button', name=f'Diapositive {number}', exact=True)
            button.click()
            expect(button).to_have_attribute('aria-pressed', 'true')
            expect(dialog.get_by_role('button', name=f'Diapositive {3 - number}', exact=True)).to_have_attribute('aria-pressed', 'false')
            expect(image).to_have_attribute('src', f'/mood-meters/slides/test/page-{number}.svg')
            expect(image).to_have_js_property('complete', True)
            expect(image).not_to_have_js_property('naturalWidth', 0)
        # Viewer selection must not change the slide recorded with a vote.
        dialog.get_by_role('button', name='Diapositive 2', exact=True).click()
    else:
        expect(dialog.locator('#default-mood-meter')).to_be_visible()
    close.click()
    expect(dialog).not_to_be_visible()
    assert page.evaluate('document.fullscreenElement === document.documentElement') == fullscreen_before
    if remote:
        # Opening again starts on the selected check-in slide, not the last
        # viewed slide (2); both inline slides must still be displayed.
        page.get_by_role('button', name='Afficher le baromètre en plein écran', exact=True).click()
        expect(dialog.locator('#expanded-meter-slide')).to_have_attribute('src', '/mood-meters/slides/test/page-1.svg')
        expect(dialog.get_by_role('button', name='Diapositive 1', exact=True)).to_have_attribute('aria-pressed', 'true')
        close.click()
        expect(dialog).not_to_be_visible()


def remote_geometry(page, width, height):
    stack = page.locator('#meter-slide-stack')
    expect(stack.locator('img')).to_have_count(2)
    for image in stack.locator('img').all():
        expect(image).to_have_js_property('complete', True)
        expect(image).not_to_have_js_property('naturalWidth', 0)
    page.evaluate('async () => { for (let i=0; i<3; i++) await new Promise(requestAnimationFrame); }')
    layout = stack.evaluate('''el => {
        const rect = node => { const r = node.getBoundingClientRect();
            return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}; };
        return {stack:rect(el), images:[...el.querySelectorAll('img')].map(rect),
            scroll:el.scrollHeight,height:el.clientHeight};
    }''')
    first, second = layout['images']
    assert all(image['width'] > 0 and image['height'] > 0 for image in layout['images']), layout
    assert first['bottom'] <= second['top'] + 1, layout
    assert abs(first['left'] - second['left']) <= 1, layout
    for image in layout['images']:
        assert image['left'] >= layout['stack']['left'] - 1 and image['right'] <= layout['stack']['right'] + 1, layout


with sync_playwright() as p:
    browser = p.chromium.launch()
    for width, height in [(320, 568), (390, 844), (768, 1024), (820, 568), (1024, 576), (1366, 768)]:
        context = browser.new_context(viewport={'width': width, 'height': height}, reduced_motion='reduce', service_workers='block')
        bootstrap = install_browser_bootstrap(context)
        team = {'roster': [{'id': 'alice', 'name': 'Alice', 'present': True, 'mood': None, 'moodUpdatedAt': None}], 'session': [], 'duration': 120, 'warning': 30, 'sound': False, 'usedMoodMeters': [], 'currentMoodSlide': None}
        db = {'revision': 1, 'meter': {'meterId': 'original', 'title': 'Baromètre original'}, 'patches': 0}
        day = (datetime.now(timezone.utc) + timedelta(hours=4)).date().isoformat()
        def api(route):
            req = route.request
            path = urlparse(req.url).path
            if path == '/api/teams':
                route.fulfill(json={'teams': [{'id': ID, 'name': 'Test', 'memberCount': 1}], 'activeTeamId': ID})
            elif path == '/api/team':
                if req.method == 'PUT':
                    team.update(deepcopy(req.post_data_json['team']))
                    db['revision'] += 1
                route.fulfill(json={'team': deepcopy(team), 'revision': db['revision']})
            elif path == '/api/history':
                route.fulfill(json={'rounds': [], 'day': day})
            elif path == '/api/daily-meter':
                if req.method == 'PATCH':
                    db['meter'] = req.post_data_json
                    db['patches'] += 1
                route.fulfill(json={'day': day, 'meter': db['meter']})
            elif path == '/api/mood-meters/catalog':
                route.fulfill(json=[{'title': 'Test meter', 'category': 'Animals & Creatures', 'remoteId': 'deck-1234567890abcdef1234', 'slides': []}])
            elif path.startswith('/api/mood-meters/decks/'):
                route.fulfill(json={'title': 'Test meter', 'slides': ['mood-meters/slides/test/page-1.svg', 'mood-meters/slides/test/page-2.svg']})
            else:
                route.fallback()
        context.route('**/api/**', api)
        context.route('**/mood-meters/catalog.json', lambda route: route.fulfill(json={'remote': True}))
        context.route('**/mood-meters/slides/**/*.svg', lambda route: route.fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>'))
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE + '/mood')
        select = page.locator('#meter-catalogue-select')
        expect(select).to_be_enabled()
        expand = page.locator('#expand-meter-button')
        expect(expand).to_have_text('')
        expect(expand.locator('.MuiSvgIcon-root')).to_have_count(1)
        random_box = page.locator('#random-meter-button').bounding_box()
        expand_box = expand.bounding_box()
        assert expand_box and random_box and abs(expand_box['y'] - random_box['y']) <= 1 and expand_box['x'] >= random_box['x'] + random_box['width'], ('meter toolbar actions must be adjacent', random_box, expand_box)
        expect(select.locator('optgroup')).to_have_attribute('label', 'Animaux et créatures (1)')
        expect(select).to_have_value('0')
        assert db['patches'] == 1, 'load randomizes an unlocked original meter'
        select.select_option('-2')
        select.select_option('0')
        expect(select).to_have_value('0')
        assert db['patches'] == 3
        assert db['meter']['meterId'] == 'deck-1234567890abcdef1234'
        remote_geometry(page, width, height)
        viewer(page, remote=True)
        remote_geometry(page, width, height)
        page.reload()
        expect(select).to_have_value('0')
        expect(select).to_be_enabled()
        expect(select.locator('optgroup')).to_have_attribute('label', 'Animaux et créatures (1)')
        select.select_option('-2')
        expect(select).to_have_value('-2')
        expect(page.locator('#default-mood-meter')).to_be_visible()
        assert page.locator('#default-mood-meter article').evaluate_all("nodes => nodes.map(e => e.querySelector('span').textContent)") == ['1', '4', '2', '3']
        page.evaluate('async () => { for (let i=0; i<3; i++) await new Promise(requestAnimationFrame); }')
        meter_size = page.locator('#default-mood-meter').evaluate('e => ({height: e.clientHeight, scroll: e.scrollHeight})')
        assert meter_size['scroll'] <= meter_size['height'] + 2, (width, height, meter_size)
        viewer(page)
        if width in [320, 1366]:
            page.screenshot(path=str(Path(tempfile.gettempdir()) / f'scrum-mood-design-meter-{width}.png'))
        if width <= 800:
            page.get_by_role('button', name='Humeurs de l’équipe', exact=True).click()
        expect(page.get_by_role('group', name='Humeur de Alice : choisissez de 1 à 4').get_by_role('button')).to_have_text(['1', '2', '3', '4'])
        person_row = page.locator('.checkin-person').first
        expect(person_row.locator('strong')).to_be_visible()
        assert person_row.evaluate('''row => {
            const r = row.getBoundingClientRect();
            return [...row.querySelectorAll('strong, button')].every(node => {
                const b = node.getBoundingClientRect();
                return b.top >= r.top - 1 && b.bottom <= r.bottom + 1;
            });
        }'''), (width, 'Member name or voting controls clipped inside row')
        assert person_row.locator('strong').evaluate('''name => {
            const n = name.getBoundingClientRect();
            const list = name.closest('ul').getBoundingClientRect();
            return n.top >= list.top - 1 && n.bottom <= list.bottom + 1;
        }'''), (width, 'Member name clipped by paginated list')
        for button in page.get_by_role('group', name='Humeur de Alice : choisissez de 1 à 4').get_by_role('button').all():
            box = button.bounding_box()
            assert box['width'] >= 44 and box['height'] >= 44
            assert box['x'] >= 0 and box['x'] + box['width'] <= width + 1
        page.get_by_role('button', name='Humeur 2 pour Alice', exact=True).click()
        page.wait_for_function("document.querySelector('.site-header [role=status]')?.title === 'Équipe enregistrée dans Neon.'")
        expect(page.get_by_role('button', name='Humeur 2 pour Alice', exact=True)).to_have_attribute('aria-pressed', 'true')
        if width in [320, 1366]:
            page.screenshot(path=str(Path(tempfile.gettempdir()) / f'scrum-mood-design-vote-{width}.png'))
        page.reload()
        expect(select).to_be_disabled()
        expect(page.locator('#daily-meter-note')).to_contain_text('Verrouillé après le premier vote')
        if width <= 800:
            page.get_by_role('button', name='Humeurs de l’équipe', exact=True).click()
        expect(page.get_by_role('group', name='Humeur de Alice : choisissez de 1 à 4').get_by_role('button')).to_have_text(['1', '2', '3', '4'])
        assert db['patches'] == 4
        assert not errors, errors
        bootstrap.assert_no_unexpected_api()
        context.close()
        print(f'PASS dropdown change/reload/vote-lock {width}x{height}')
    browser.close()