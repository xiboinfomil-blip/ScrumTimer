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
def mood_contrast(button):
    return button.evaluate('''element => {
        const style = getComputedStyle(element);
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        const rgb = color => {
            context.fillStyle = color;
            context.fillRect(0, 0, 1, 1);
            return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)];
        };
        const luminance = color => rgb(color)
            .map(value => value / 255 <= .04045 ? value / 255 / 12.92 : ((value / 255 + .055) / 1.055) ** 2.4)
            .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
        const foreground = luminance(style.color);
        const background = luminance(style.backgroundColor);
        return { foregroundColor: rgb(style.color), backgroundColor: rgb(style.backgroundColor),
            ratio: (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05) };
    }''')


def mood_color_family(value, colors):
    red, green, blue = colors['backgroundColor']
    return {
        1: red > 150 and red > green * 1.5 and red > blue * 1.5,
        2: red > 200 and green > 150 and blue < 100,
        3: blue > 150 and blue > red * 1.5 and blue > green,
        4: green > 100 and green > red * 1.5 and green > blue * 1.2,
    }[value]


def remote_geometry(page, width, height):
    stack = page.locator('#meter-slide-stack')
    expect(stack.locator('img')).to_have_count(2)
    expect(page.get_by_text('Survolez ou touchez la flèche pour retourner', exact=True)).to_be_visible()
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
    assert abs(first['left'] - second['left']) <= 1, layout
    assert abs(first['top'] - second['top']) <= 1, layout
    assert abs(first['width'] - second['width']) <= 1 and abs(first['height'] - second['height']) <= 1, layout
    assert layout['scroll'] <= layout['height'] + 2, layout
    for image in layout['images']:
        assert image['left'] >= layout['stack']['left'] - 1 and image['right'] <= layout['stack']['right'] + 1, layout
    flip = page.get_by_role('button', name='Afficher la diapositive 2', exact=True)
    expect(flip).to_have_attribute('aria-pressed', 'false')
    stack.hover(position={'x': layout['stack']['width'] / 2, 'y': layout['stack']['height'] / 2})
    page.wait_for_function("Math.abs(new DOMMatrix(getComputedStyle(document.querySelector('#meter-page-flip')).transform).m11 + 1) < .01")
    if width == 1366:
        duration = page.locator('#meter-page-flip').evaluate('el => parseFloat(getComputedStyle(el).transitionDuration)')
        reduced = page.evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches")
        assert duration == 0 if reduced else duration >= .65, ('flip duration does not match motion preference', reduced, duration)
    if width in (320, 1366):
        page.screenshot(path=str(Path(tempfile.gettempdir()) / f'scrum-mood-flip-{width}.png'))
    page.mouse.move(0, 0)
    page.wait_for_function("Math.abs(new DOMMatrix(getComputedStyle(document.querySelector('#meter-page-flip')).transform).m11 - 1) < .01")
    expect(flip).to_have_attribute('aria-pressed', 'false')
    flip.focus()
    page.keyboard.press('Enter')
    expect(page.get_by_role('button', name='Afficher la diapositive 1', exact=True)).to_have_attribute('aria-pressed', 'true')
    expect(page.locator('#meter-page-2-face')).to_have_attribute('aria-hidden', 'false')
    page.keyboard.press('Enter')
    expect(page.get_by_role('button', name='Afficher la diapositive 2', exact=True)).to_have_attribute('aria-pressed', 'false')


with sync_playwright() as p:
    browser = p.chromium.launch()
    for width, height, motion in [(320, 568, 'reduce'), (390, 844, 'reduce'), (768, 1024, 'reduce'), (820, 568, 'reduce'), (1024, 576, 'reduce'), (1366, 768, 'reduce'), (1366, 768, 'no-preference')]:
        context = browser.new_context(viewport={'width': width, 'height': height}, reduced_motion=motion, service_workers='block')
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
            elif path == '/api/participant-link' and req.method == 'POST':
                assert req.headers.get('x-team-id') == ID
                route.fulfill(json={'url': 'https://participants.example/t/fake-signed'})
            elif path == '/api/mood-meters/catalog':
                route.fulfill(json=[{'title': 'Test meter', 'category': 'Animals & Creatures', 'remoteId': 'deck-1234567890abcdef1234', 'slides': []}])
            elif path.startswith('/api/mood-meters/decks/'):
                route.fulfill(json={'title': 'Test meter', 'slides': ['mood-meters/slides/test/page-1.svg', 'mood-meters/slides/test/page-2.svg']})
            else:
                route.fallback()
        context.route('**/api/**', api)
        context.route('**/mood-meters/catalog.json', lambda route: route.fulfill(json={'remote': True}))
        def image(route):
            second = 'page-2' in route.request.url
            color, label = ('#d9f3e7', 'PAGE 2') if second else ('#dcecff', 'PAGE 1')
            route.fulfill(content_type='image/svg+xml', body=f'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="{color}"/><text x="50" y="55" text-anchor="middle">{label}</text></svg>')
        context.route('**/mood-meters/slides/**/*.svg', image)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE + '/mood')
        share_button = page.get_by_role('button', name='Lien participants', exact=True)
        expect(share_button).to_be_visible()
        share_button.click()
        share_dialog = page.get_by_role('dialog', name='Portail participants · Test', exact=True)
        expect(share_dialog).to_be_visible()
        expect(share_dialog.get_by_role('textbox', name='Lien à partager', exact=True)).to_have_value('https://participants.example/t/fake-signed?equipe=Test')
        expect(share_dialog.locator('[data-testid="participant-share-qr"] svg')).to_be_visible()
        share_dialog.get_by_role('button', name='Fermer', exact=True).click()
        expect(share_dialog).not_to_be_visible()
        select = page.locator('#meter-catalogue-select')
        expect(select).to_be_enabled()
        expect(page.get_by_role('button', name='Afficher le baromètre en plein écran', exact=True)).to_have_count(0)
        random_box = page.locator('#random-meter-button').bounding_box()
        assert random_box, 'random meter control remains available'
        expect(select.locator('optgroup')).to_have_attribute('label', 'Animaux et créatures (1)')
        expect(select).to_have_value('0')
        assert db['patches'] == 1, 'load randomizes an unlocked original meter'
        select.select_option('-2')
        select.select_option('0')
        expect(select).to_have_value('0')
        assert db['patches'] == 3
        assert db['meter']['meterId'] == 'deck-1234567890abcdef1234'
        remote_geometry(page, width, height)
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
        mood_buttons = page.get_by_role('group', name='Humeur de Alice : choisissez de 1 à 4').get_by_role('button')
        for value, button in enumerate(mood_buttons.all(), start=1):
            button.evaluate('async element => { await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {}))); }')
            colors = mood_contrast(button)
            assert mood_color_family(value, colors), ('unselected mood color family', value, colors)
            assert colors['ratio'] >= 4.5, ('unselected mood button contrast', value, colors)
        for value in (1, 2, 3, 4, 2):
            button = page.get_by_role('button', name=f'Humeur {value} pour Alice', exact=True)
            button.click()
            expect(button).to_have_attribute('aria-pressed', 'true')
            page.wait_for_function("document.querySelector('.site-header [role=status]')?.title === 'Équipe enregistrée dans Neon.'")
            button.evaluate('async element => { await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {}))); }')
            colors = mood_contrast(button)
            assert mood_color_family(value, colors), (value, colors)
            assert colors['ratio'] >= 4.5, (value, colors)
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
        print(f'PASS dropdown change/reload/vote-lock {width}x{height} {motion}')
    browser.close()