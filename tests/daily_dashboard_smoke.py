"""Compact dashboard fits screen; mocked APIs only."""
import os
import tempfile
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3000')
with sync_playwright() as p:
    browser = p.chromium.launch()
    for motion in ['reduce', 'no-preference']:
        context = browser.new_context(reduced_motion=motion)
        now = datetime.now(timezone.utc).isoformat()
        people = [{'id': f'p{i}', 'name': f'Personne {i:02}', 'mood': i % 4 + 1, 'speakingSeconds': 30, 'budgetSeconds': 120, 'timeUp': False, 'score': 1000, 'meterTitle': 'Baromètre exemple'} for i in range(40)]
        team = {'roster': [{'id': person['id'], 'name': person['name'], 'present': True, 'mood': person['mood'], 'moodUpdatedAt': now, 'moodSlide': {'title': 'Baromètre exemple', 'image': '/mood-meters/slides/test/meter.svg', 'slideNumber': 1}} for person in people], 'session': [], 'duration': 120, 'warning': 20, 'sound': False, 'usedMoodMeters': []}
        record = {'id': 'dashboard', 'completedAt': now, 'people': people}
        people[-1]['meterTitle'] = 'Autre baromètre'
        team['roster'][-1]['moodSlide'] = {'title': 'Autre baromètre', 'image': '/mood-meters/slides/test/other.svg', 'slideNumber': 1}
        context.route('**/api/teams', lambda route: route.fulfill(json={'teams': [{'id': 'a' * 64, 'name': 'Équipe dashboard', 'memberCount': 40}], 'activeTeamId': 'a' * 64}))
        context.route('**/api/team', lambda route: route.fulfill(json={'team': team, 'revision': 1}))
        context.route('**/api/history', lambda route: route.fulfill(json={'rounds': [record]}))
        context.route('**/mood-meters/catalog.json', lambda route: route.fulfill(json=[]))
        context.route('**/mood-meters/slides/test/meter.svg', lambda route: route.fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#e0f2fe"/><text x="80" y="180" font-size="40">Mood meter 1 4 / 2 3</text></svg>'))
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE + '/timer')
        page.get_by_role('button', name='Voir le bilan du jour', exact=True).click()
        expect(page.get_by_role('term').filter(has_text='Score moyen')).to_be_visible()
        expect(page.locator('[aria-label="Indicateurs du bilan du jour"] > div')).to_have_count(4)
        for width, height in [(320, 568), (390, 844), (768, 1024), (1024, 576), (1366, 768), (1920, 1080)]:
            page.set_viewport_size({'width': width, 'height': height})
            if width < 1024:
                page.get_by_role('button', name='Points & détails', exact=True).click()
            scores = page.locator('[data-dashboard-column=scores]')
            expect(scores).to_be_visible()
            page.wait_for_function("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))))")
            page.evaluate("document.getAnimations().filter(a => Number.isFinite(a.effect.getComputedTiming().endTime)).forEach(a => a.finish())")
            page.get_by_role('button', name='Comprendre le score de Personne 00').click()
            dialog = page.get_by_role('dialog')
            expect(dialog).to_contain_text('Score enregistré : 1000 pts')
            dialog.get_by_role('button', name='Fermer', exact=True).click()
            expect(dialog).not_to_be_visible()
            if width < 1024:
                page.get_by_role('button', name='Mood meters', exact=True).click()
            moods = page.locator('[data-dashboard-column=moods]')
            expect(moods).to_be_visible()
            if height <= 650:
                moods.get_by_role('button', name='Voir image').click()
                image_dialog = page.get_by_role('dialog')
                page.wait_for_function("document.querySelector('[role=dialog] img')?.naturalWidth > 0")
                image_dialog.get_by_role('button', name='Fermer l’image').click()
                expect(image_dialog).not_to_be_visible()
            else:
                page.wait_for_function("document.querySelector('[data-dashboard-column=moods] img')?.naturalWidth > 0")
            assert moods.locator('[data-mood-choice]').evaluate_all('els => els.map(el => Number(el.dataset.moodChoice))') == [1, 4, 2, 3]
            moods.locator('[data-mood-choice="2"]').click()
            expect(moods.locator('.daily-mood-list')).to_contain_text('Personne 01')
            moods.locator('[data-mood-choice="2"]').click()
            page.wait_for_function("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))))")
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight')
            overflow = page.evaluate("""() => Array.from(document.querySelectorAll('#daily-dashboard, #daily-dashboard section, .daily-score-list, .daily-mood-list')).filter(el => el.getBoundingClientRect().height > 0 && getComputedStyle(el).display !== 'none' && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)).map(el => [el.className, el.clientHeight, el.scrollHeight])""")
            assert not overflow, (motion, width, overflow)
            for el in moods.locator('[data-mood-choice]').all():
                box = el.bounding_box()
                assert box['height'] >= 44 and box['y'] + box['height'] <= height + 1
            if width in [320, 1366] and motion == 'reduce':
                page.screenshot(path=os.path.join(tempfile.gettempdir(), f'scrum-compact-daily-{width}.png'))
        assert not errors, errors
        context.close()
    browser.close()
    print('PASS: compact dashboard no-scroll at six sizes, 40 participants, score details, mood filters, both motion preferences')