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
        expect(page.locator('[data-results-podium]')).to_have_count(1)
        expect(page.locator('[data-podium-rank="1"]')).to_contain_text('40 ex æquo')
        expect(page.locator('[data-podium-rank="2"], [data-podium-rank="3"]')).to_have_count(0)
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
            overflow = page.evaluate("""() => Array.from(document.querySelectorAll('#daily-dashboard, #daily-dashboard section, .daily-score-list, .daily-mood-list')).filter(el => el.getBoundingClientRect().height > 0 && getComputedStyle(el).display !== 'none' && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1 && !['auto', 'scroll'].includes(getComputedStyle(el).overflowY))).map(el => [el.className, el.clientHeight, el.scrollHeight])""")
            assert not overflow, (motion, width, overflow)
            for el in moods.locator('[data-mood-choice]').all():
                box = el.bounding_box()
                assert box['height'] >= 44 and box['y'] + box['height'] <= height + 1
            if width in [320, 1366] and motion == 'reduce':
                page.screenshot(path=os.path.join(tempfile.gettempdir(), f'scrum-compact-daily-{width}.png'))
            page.get_by_role('button', name='Présenter le bilan', exact=True).click()
            expect(page.locator('#daily-dashboard')).to_have_count(1)
            expect(page.locator('[data-results-podium]')).to_have_count(1)
            expect(page.get_by_test_id('timer-screensaver')).to_have_count(0)
            exit_button = page.get_by_role('button', name='Quitter la présentation du bilan', exact=True)
            expect(exit_button).to_be_in_viewport()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            exit_button.click()
            expect(page.locator('#daily-screensaver-button')).to_be_focused()
        for width, height in [(568, 320), (844, 390)]:
            page.set_viewport_size({'width': width, 'height': height})
            page.locator('#daily-screensaver-button').click()
            exit_button = page.get_by_role('button', name='Quitter la présentation du bilan', exact=True)
            expect(exit_button).to_be_in_viewport()
            expect(page.get_by_test_id('timer-screensaver')).to_have_count(0)
            exit_button.click()
        page.set_viewport_size({'width': 1366, 'height': 768})
        page.reload()
        expect(page.get_by_role('heading', name='Bilan du jour', exact=True)).to_be_visible()
        expect(page.get_by_role('dialog')).to_have_count(0)
        expect(page.locator('.daily-score-list')).to_be_visible()
        assert not errors, errors
        record['people'] = [{**person, 'name': 'Participant' + 'Long' * 10 + str(index), 'score': 1000 - index * 100} for index, person in enumerate(people[:3])]
        for width, height in [(320, 568), (1366, 768)]:
            page.set_viewport_size({'width': width, 'height': height})
            page.reload()
            expect(page.locator('[data-podium-rank]')).to_have_count(3)
            assert page.locator('[data-podium-rank]').evaluate_all('elements => elements.map(element => element.dataset.podiumRank)') == ['2', '1', '3']
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            if motion == 'reduce':
                page.screenshot(path=os.path.join(tempfile.gettempdir(), f'scrum-results-podium-{width}.png'))
        record['people'][1]['score'] = 1000
        page.reload()
        expect(page.locator('[data-podium-rank="1"]')).to_contain_text('2 ex æquo')
        expect(page.locator('[data-podium-rank="2"]')).to_have_count(0)
        expect(page.locator('[data-podium-rank="3"]')).to_have_count(1)
        record['people'] = [{**people[0], 'score': None, 'speakingSeconds': 0}]
        page.reload()
        expect(page.get_by_text('Aucun passage mesuré', exact=True)).to_be_visible()
        expect(page.locator('[data-results-podium]')).to_have_count(0)
        record['people'] = [people[0]]
        page.reload()
        expect(page.locator('[data-podium-rank="1"]')).to_be_visible()
        expect(page.locator('[data-podium-rank]')).to_have_count(1)
        bootstrap.assert_no_unexpected_api()
        context.close()
    browser.close()
    print('PASS: single podium dashboard, six sizes and landscape, shared ranks, score details, mood filters, same-view presentation and reload; all APIs mocked')