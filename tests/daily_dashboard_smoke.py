"""Compact dashboard fits screen; mocked APIs only."""
import os
import tempfile
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright, expect
from browser_bootstrap import WARNING_SECONDS, install_browser_bootstrap, team_options

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3000')
with sync_playwright() as p:
    browser = p.chromium.launch()
    for motion in ['reduce', 'no-preference']:
        context = browser.new_context(reduced_motion=motion, service_workers='block')
        bootstrap = install_browser_bootstrap(context)
        now = datetime.now(timezone.utc).isoformat()
        people = [{'id': f'p{i}', 'name': f'Personne {i:02}', 'mood': i % 4 + 1, 'speakingSeconds': 30, 'budgetSeconds': 120, 'timeUp': False, 'score': 1000, 'meterTitle': 'Baromètre exemple'} for i in range(40)]
        team = {'roster': [{'id': person['id'], 'name': person['name'], 'present': True, 'mood': person['mood'], 'moodUpdatedAt': now, 'moodSlide': {'title': 'Baromètre exemple', 'image': '/mood-meters/slides/test/meter.svg', 'slideNumber': 1}} for person in people], 'session': [], 'duration': 120, 'warning': WARNING_SECONDS, 'sound': False, 'usedMoodMeters': []}
        record = {'id': 'dashboard', 'completedAt': now, 'people': people}
        people[-1]['meterTitle'] = 'Autre baromètre'
        team['roster'][-1]['moodSlide'] = {'title': 'Autre baromètre', 'image': '/mood-meters/slides/test/other.svg', 'slideNumber': 1}
        context.route('**/api/teams', lambda route: route.fulfill(json=team_options('Équipe dashboard', member_count=40)))
        context.route('**/api/team', lambda route: route.fulfill(json={'team': team, 'revision': 1}))
        context.route('**/api/history', lambda route: route.fulfill(json={'rounds': [record]}))
        context.route('**/api/timer-remote', lambda route: route.fulfill(status=503, json={'error': 'Télécommande indisponible dans ce test isolé.'}))
        context.route('**/mood-meters/catalog.json', lambda route: route.fulfill(json=[]))
        context.route('**/mood-meters/slides/test/meter.svg', lambda route: route.fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#e0f2fe"/><text x="80" y="180" font-size="40">Mood meter 1 4 / 2 3</text></svg>'))
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE + '/timer')
        expect(page.get_by_role('heading', name='Bilan du jour', exact=True)).to_be_visible()
        expect(page.get_by_role('button', name='Voir le bilan du jour', exact=True)).to_have_count(0)
        expect(page.get_by_role('dialog')).to_have_count(0)
        expect(page.get_by_role('term').filter(has_text='Score moyen')).to_be_visible()
        expect(page.locator('[aria-label="Indicateurs du bilan du jour"] > div')).to_have_count(4)
        for width, height in [(320, 568), (390, 844), (768, 1024), (1024, 576), (1366, 768), (1920, 1080)]:
            page.set_viewport_size({'width': width, 'height': height})
            if width < 1024:
                page.get_by_role('button', name='Classement', exact=True).click()
            scores = page.locator('[data-dashboard-column=scores]')
            expect(scores).to_be_visible()
            page.wait_for_function("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))))")
            page.evaluate("document.getAnimations().filter(a => Number.isFinite(a.effect.getComputedTiming().endTime)).forEach(a => a.finish())")
            page.get_by_role('button', name='Comprendre le score de Personne 00').click()
            dialog = page.get_by_role('dialog')
            expect(dialog).to_contain_text('Score enregistré : 1000 pts')
            dialog.get_by_role('button', name='Fermer', exact=True).click()
            expect(dialog).not_to_be_visible()
            row = scores.locator('[data-daily-person]').first.bounding_box()
            list_box = scores.locator('.daily-score-list').bounding_box()
            assert row and list_box and row['y'] >= list_box['y'] - 1 and row['y'] + row['height'] <= list_box['y'] + list_box['height'] + 1, (width, height, row, list_box)
            if width < 1024:
                page.get_by_role('button', name='Humeurs', exact=True).click()
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
            page.get_by_role('button', name='Économiseur d’écran', exact=True).click()
            saver = page.get_by_test_id('timer-screensaver')
            expect(saver).to_have_attribute('data-completed', 'true')
            expect(saver.get_by_role('heading', name='Classement du jour')).to_be_visible()
            expect(saver.locator('[data-screensaver-person]').first).to_be_visible()
            page.wait_for_function("() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))))")
            for button in saver.get_by_role('button').all():
                box = button.bounding_box()
                assert box and box['height'] >= 43.9 and box['x'] >= -1 and box['y'] >= -1 and box['x'] + box['width'] <= width + 1 and box['y'] + box['height'] <= height + 1, (width, height, box)
            ranking_box = saver.locator('.screensaver-score-list').bounding_box()
            row_box = saver.locator('[data-screensaver-person]').first.bounding_box()
            assert row_box and ranking_box and row_box['y'] >= ranking_box['y'] - 1 and row_box['y'] + row_box['height'] <= ranking_box['y'] + ranking_box['height'] + 1, (width, height, row_box, ranking_box)
            saver.get_by_role('button', name='Page suivante', exact=True).click()
            expect(saver.locator('[data-screensaver-person="p0"]')).to_have_count(0)
            saver.get_by_role('button', name='Page précédente', exact=True).click()
            expect(saver.locator('[data-screensaver-person="p0"]')).to_be_visible()
            movement = """async el => {
                const snapshot = () => [...el.querySelectorAll('div, span')].map(node => getComputedStyle(node).transform).join('|');
                for (let frame = 0; frame < 3; frame++) await new Promise(requestAnimationFrame);
                const before = snapshot();
                for (let frame = 0; frame < 24; frame++) await new Promise(requestAnimationFrame);
                return before !== snapshot();
            }"""
            if motion == 'reduce':
                assert not page.locator('[data-screensaver-decor]').evaluate(movement)
            else:
                expect(saver).to_have_attribute('data-motion', 'running')
                assert page.locator('[data-screensaver-decor]').evaluate(movement)
                saver.get_by_role('button', name='Arrêter les animations', exact=True).click()
                expect(saver).to_have_attribute('data-motion', 'paused')
                assert not page.locator('[data-screensaver-decor]').evaluate(movement)
                saver.get_by_role('button', name='Animer le décor', exact=True).click()
                expect(saver).to_have_attribute('data-motion', 'running')
            if width in [320, 1366] and motion == 'reduce':
                page.screenshot(path=os.path.join(tempfile.gettempdir(), f'scrum-completed-saver-{width}.png'))
            saver.get_by_role('button', name='Revenir au bilan', exact=True).first.click()
            expect(saver).not_to_be_visible()
            expect(page.locator('#daily-screensaver-button')).to_be_focused()
        for width, height in [(568, 320), (844, 390)]:
            page.set_viewport_size({'width': width, 'height': height})
            page.locator('#daily-screensaver-button').click()
            saver = page.get_by_test_id('timer-screensaver')
            expect(saver.locator('[data-screensaver-person]').first).to_be_in_viewport()
            for button in saver.get_by_role('button').all():
                box = button.bounding_box()
                assert box and box['height'] >= 43.9 and box['x'] >= -1 and box['y'] >= -1 and box['x'] + box['width'] <= width + 1 and box['y'] + box['height'] <= height + 1, (width, height, box)
            saver.get_by_role('button', name='Revenir au bilan', exact=True).first.click()
            expect(saver).not_to_be_visible()
        page.set_viewport_size({'width': 1366, 'height': 768})
        page.reload()
        expect(page.get_by_role('heading', name='Bilan du jour', exact=True)).to_be_visible()
        expect(page.get_by_role('dialog')).to_have_count(0)
        expect(page.locator('.daily-score-list')).to_be_visible()
        assert not errors, errors
        bootstrap.assert_no_unexpected_api()
        context.close()
    browser.close()
    print('PASS: always-visible dashboard and animated completion leaderboard at six sizes, 44px actions, shared ranks, paging, score details, mood filters, reload without screensaver, both motion preferences; all APIs mocked')