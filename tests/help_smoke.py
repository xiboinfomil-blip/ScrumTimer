"""Illustrated help stays accessible without Neon; no database writes."""
import os
import tempfile
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright, expect
from browser_bootstrap import install_browser_bootstrap, mauritius_day, team_fixture, team_options

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3000')
with sync_playwright() as p:
    browser = p.chromium.launch()
    motion = os.environ.get('BROWSER_TEST_MOTION', 'reduce')
    context = browser.new_context(reduced_motion=motion, service_workers='block')
    bootstrap = install_browser_bootstrap(context)
    def offline_api(route):
        route.fulfill(status=503, json={'error': 'Service indisponible'})
    context.route('**/api/**', offline_api)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE + '/help')
    expect(page.get_by_role('heading', level=1)).to_have_text('Guide d’utilisation')
    expect(page.get_by_role('link', name='Guide d’utilisation', exact=True)).to_have_attribute('aria-current', 'page')
    expect(page.locator('article img')).to_have_count(4)
    page.wait_for_function("Array.from(document.querySelectorAll('article img')).every(img => img.complete && img.naturalWidth > 0)")
    for width, height in [(320, 568), (390, 844), (768, 1024), (1024, 576), (1366, 768), (1920, 1080)]:
        page.set_viewport_size({'width': width, 'height': height})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
        for label, section in [('Participants', 'participants'), ('Humeurs', 'moods'), ('Minuteur', 'timer'), ('Bilans', 'results')]:
            page.get_by_role('navigation', name='Sommaire du guide').get_by_role('link', name=label, exact=True).click()
            expect(page.locator(f'#{section}-heading')).to_be_in_viewport()
        page.get_by_role('link', name='Retour au sommaire', exact=True).click()
        expect(page.get_by_role('heading', level=1)).to_be_in_viewport()
        if width in [320, 1366]:
            page.screenshot(path=os.path.join(tempfile.gettempdir(), f'scrum-help-overview-{width}.png'))
        page.get_by_role('link', name='Points', exact=True).click()
        expect(page.get_by_role('heading', name='Comment les points sont-ils attribués ?')).to_be_in_viewport()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
        if width in [320, 1366]:
            page.screenshot(path=os.path.join(tempfile.gettempdir(), f'scrum-help-{width}.png'))
        page.get_by_role('heading', level=1).scroll_into_view_if_needed()
        page.get_by_role('navigation', name='Sommaire du guide').get_by_role('link', name='Questions fréquentes', exact=True).click()
        expect(page.locator('#questions-heading')).to_be_in_viewport()
        question = page.locator('summary').filter(has_text='Que faire si la connexion à Neon échoue ?')
        question.focus()
        page.keyboard.press('Enter')
        expect(page.locator('details').filter(has=question)).to_have_attribute('open', '')
        expect(page.get_by_text('Utilisez Réessayer et attendez Synchronisé.', exact=False)).to_be_visible()
        page.keyboard.press('Enter')
        expect(page.locator('details').filter(has=question)).not_to_have_attribute('open', '')
        if width >= 1024:
            expect(page.get_by_role('navigation', name='Sommaire du guide')).to_be_in_viewport()
        for link in page.get_by_role('navigation', name='Sommaire du guide').get_by_role('link').all():
            box = link.bounding_box()
            assert box and box['height'] >= 43.9 and box['x'] >= 0 and box['x'] + box['width'] <= width + 1, (width, box)
    page.goto(BASE + '/help#participants')
    expect(page.locator('#participants-heading')).to_be_in_viewport()
    expect(page).to_have_url(BASE + '/help#participants')
    page.goto(BASE + '/help#score')
    expect(page.locator('#score-heading')).to_be_in_viewport()
    page.reload()
    expect(page.get_by_role('heading', level=1)).to_have_text('Guide d’utilisation')
    # Historical explanation remains truthful for old scores, including on mobile.
    team = team_fixture(roster=[{'id': 'alice', 'name': 'Alice', 'present': True, 'mood': 2, 'moodUpdatedAt': None}])
    round_record = {'id': 'old-score', 'completedAt': datetime.now(timezone.utc).isoformat(), 'people': [{'id': 'alice', 'name': 'Alice', 'mood': 2, 'speakingSeconds': 110, 'budgetSeconds': 120, 'timeUp': False, 'score': 867, 'meterTitle': None}]}
    context.unroute('**/api/**', offline_api)
    context.route('**/api/teams', lambda route: route.fulfill(json=team_options('Test guide', member_count=1)))
    context.route('**/api/team', lambda route: route.fulfill(json={'team': team, 'revision': 1}))
    context.route('**/api/history', lambda route: route.fulfill(json={'rounds': [round_record], 'day': mauritius_day()}))
    for width, height in [(320, 568), (1366, 768)]:
        page.set_viewport_size({'width': width, 'height': height})
        page.goto(BASE + '/timer')
        page.get_by_role('button', name='Voir le bilan du jour', exact=True).click()
        page.get_by_role('button', name='Comprendre le score de Alice').click()
        dialog = page.get_by_role('dialog')
        expect(dialog).to_contain_text('Score enregistré : 867 pts')
        expect(dialog).to_contain_text('ne peut donc pas être attribué avec certitude')
        assert dialog.bounding_box()['width'] <= width
        dialog.get_by_role('button', name='Fermer', exact=True).click()
    assert not errors, errors
    bootstrap.assert_no_unexpected_api()
    context.close()
    browser.close()
    print(f'PASS: guide without Neon, illustrations, sticky contents, six sizes, keyboard FAQ, direct anchors, reload and historical score explanation; {motion}; mocked APIs only')