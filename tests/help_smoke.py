"""Illustrated help stays accessible without Neon; no database writes."""
import os
import tempfile
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3000')
with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(reduced_motion='reduce')
    context.route('**/api/**', lambda route: route.fulfill(status=503, json={'error': 'Service indisponible'}))
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE + '/help')
    expect(page.get_by_role('heading', level=1)).to_have_text('Une équipe, un tour de parole, un bilan.')
    expect(page.get_by_role('link', name='Guide d’utilisation', exact=True)).to_have_attribute('aria-current', 'page')
    expect(page.locator('article img')).to_have_count(4)
    page.wait_for_function("Array.from(document.querySelectorAll('article img')).every(img => img.complete && img.naturalWidth > 0)")
    for width, height in [(320, 568), (390, 844), (768, 1024), (1024, 576), (1366, 768), (1920, 1080)]:
        page.set_viewport_size({'width': width, 'height': height})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
        page.get_by_role('link', name='Points', exact=True).click()
        expect(page.get_by_role('heading', name='Comment les points sont-ils attribués ?')).to_be_in_viewport()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
        if width in [320, 1366]:
            page.screenshot(path=os.path.join(tempfile.gettempdir(), f'scrum-help-{width}.png'))
        page.get_by_role('heading', level=1).scroll_into_view_if_needed()
    page.reload()
    expect(page.get_by_role('heading', level=1)).to_have_text('Une équipe, un tour de parole, un bilan.')
    # Historical explanation remains truthful for old scores, including on mobile.
    team = {'roster': [{'id': 'alice', 'name': 'Alice', 'present': True, 'mood': 2, 'moodUpdatedAt': None}], 'session': [], 'duration': 120, 'warning': 20, 'sound': False, 'usedMoodMeters': []}
    round_record = {'id': 'old-score', 'completedAt': datetime.now(timezone.utc).isoformat(), 'people': [{'id': 'alice', 'name': 'Alice', 'mood': 2, 'speakingSeconds': 110, 'budgetSeconds': 120, 'timeUp': False, 'score': 867, 'meterTitle': None}]}
    context.unroute('**/api/**')
    context.route('**/api/teams', lambda route: route.fulfill(json={'teams': [{'id': 'a' * 64, 'name': 'Test guide', 'memberCount': 1}], 'activeTeamId': 'a' * 64}))
    context.route('**/api/team', lambda route: route.fulfill(json={'team': team, 'revision': 1}))
    context.route('**/api/history', lambda route: route.fulfill(json={'rounds': [round_record]}))
    for width, height in [(320, 568), (1366, 768)]:
        page.set_viewport_size({'width': width, 'height': height})
        page.goto(BASE + '/statistics')
        page.locator('details > summary').click()
        page.get_by_role('button', name='Comprendre le score de Alice').click()
        dialog = page.get_by_role('dialog')
        expect(dialog).to_contain_text('Score enregistré : 867 pts')
        expect(dialog).to_contain_text('ne peut donc pas être attribué avec certitude')
        assert dialog.bounding_box()['width'] <= width
        dialog.get_by_role('button', name='Fermer', exact=True).click()
    assert not errors, errors
    context.close()
    browser.close()
    print('PASS: guide without Neon, four illustrations, anchors, six sizes, reload and historical score explanation on mobile/desktop; mocked APIs only')