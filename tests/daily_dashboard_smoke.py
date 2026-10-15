"""Daily dashboard data, pagination and score details; mocked APIs only."""
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
        people = [{'id': f'p{i}', 'name': f'Personne {i:02}', 'mood': (i % 4) + 1, 'speakingSeconds': seconds, 'budgetSeconds': 120, 'timeUp': seconds >= 120, 'score': score, 'meterTitle': 'Baromètre exemple'} for i, (seconds, score) in enumerate([(30, 1000), (120, 1000), (144, 800), (15, 500), (240, 0), (60, 900), (45, 1000), (0, None), (110, 1000), (90, 1000)])]
        team = {'roster': [{'id': person['id'], 'name': person['name'], 'present': True, 'mood': person['mood'], 'moodUpdatedAt': now, 'moodSlide': {'title': 'Baromètre exemple', 'image': '/mood-meters/slides/test/meter.svg', 'slideNumber': 1}} for person in people], 'session': [], 'duration': 120, 'warning': 20, 'sound': False, 'usedMoodMeters': []}
        record = {'id': 'dashboard', 'completedAt': now, 'people': people}
        context.route('**/api/teams', lambda route: route.fulfill(json={'teams': [{'id': 'a' * 64, 'name': 'Équipe dashboard', 'memberCount': 10}], 'activeTeamId': 'a' * 64}))
        context.route('**/api/team', lambda route: route.fulfill(json={'team': team, 'revision': 1}))
        context.route('**/api/history', lambda route: route.fulfill(json={'rounds': [record]}))
        context.route('**/mood-meters/catalog.json', lambda route: route.fulfill(json=[]))
        context.route('**/mood-meters/slides/test/meter.svg', lambda route: route.fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#e0f2fe"/><text x="80" y="180" font-size="40">Mood meter test 1 2 3 4</text></svg>'))
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE + '/timer')
        expect(page.get_by_role('region', name='Point quotidien du jour')).to_be_visible()
        expect(page.get_by_text('800 / 1 000', exact=True)).to_be_visible()
        page.get_by_role('button', name='Voir le bilan du jour', exact=True).click()
        expect(page.get_by_role('heading', name='Équilibre des prises de parole')).to_be_visible()
        scores = page.locator('[data-dashboard-column=scores]')
        moods = page.locator('[data-dashboard-column=moods]')
        expect(scores.locator('[data-mood-choice]')).to_have_count(0)
        expect(moods.get_by_role('heading', name='Baromètres & choix partagés')).to_be_visible()
        expect(moods.locator('img').first).to_have_attribute('alt', 'Baromètre exemple — diapositive 1')
        expect(moods.locator('[data-mood-choice="1"]')).to_contain_text('Personne 00')
        expect(moods.locator('[data-mood-choice="2"]')).to_contain_text('Personne 01')
        assert moods.locator('[data-mood-choice]').evaluate_all('els => els.map(el => Number(el.dataset.moodChoice))') == [1, 4, 2, 3]
        page.wait_for_function("document.querySelector('[data-dashboard-column=moods] img')?.naturalWidth > 0")
        ranking = page.get_by_role('list', name='Classement du jour')
        expect(ranking.locator('li')).to_have_count(8)
        expect(ranking.locator('[aria-label="Rang 1"]')).to_have_count(5)
        page.get_by_role('button', name='Page suivante du bilan').click()
        expect(ranking.locator('li')).to_have_count(2)
        expect(ranking).to_contain_text('Personne 07')
        expect(ranking.locator('[aria-label="Sans rang"]')).to_have_count(1)
        page.get_by_role('button', name='Page précédente du bilan').click()
        for width, height in [(320, 568), (390, 844), (768, 1024), (1024, 576), (1366, 768), (1920, 1080)]:
            page.set_viewport_size({'width': width, 'height': height})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (motion, width)
            assert page.evaluate('document.documentElement.scrollHeight <= innerHeight'), (motion, width)
            score_box = scores.bounding_box()
            mood_box = moods.bounding_box()
            if width >= 1024:
                assert mood_box['x'] >= score_box['x'] + score_box['width'], (width, score_box, mood_box)
            else:
                assert mood_box['y'] >= score_box['y'] + score_box['height'], (width, score_box, mood_box)
            ranking.locator('li').first.scroll_into_view_if_needed()
            page.get_by_role('button', name='Comprendre le score de Personne 00').click()
            dialog = page.get_by_role('dialog')
            expect(dialog).to_contain_text('Score enregistré : 1000 pts')
            dialog.get_by_role('button', name='Fermer', exact=True).click()
            expect(dialog).not_to_be_visible()
            if motion == 'reduce' and width in [320, 1366]:
                page.get_by_role('region', name='Point quotidien du jour').evaluate('el => el.scrollTop = 0')
                page.screenshot(path=os.path.join(tempfile.gettempdir(), f'scrum-daily-dashboard-{width}.png'))
        if motion == 'reduce':
            assert page.evaluate("Array.from(document.querySelectorAll('#daily-dashboard *')).flatMap(el => el.getAnimations()).filter(a => a.playState === 'running').length") == 0
        assert not errors, errors
        context.close()
    browser.close()
    print('PASS: daily dashboard KPIs, ties, 10-person pagination, score details, six sizes and both motion preferences; mocked APIs only')