"""Live score thresholds, overtime and pause/resume; mocked APIs, no live writes."""
import os
import tempfile
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3000')
SIZES = [(320, 568), (390, 844), (768, 1024), (1024, 576), (1366, 768), (1920, 1080)]

with sync_playwright() as p:
    browser = p.chromium.launch()
    for motion in ['reduce', 'no-preference']:
        context = browser.new_context(viewport={'width': 1366, 'height': 768}, reduced_motion=motion)
        team = {
            'roster': [{'id': name.lower(), 'name': name, 'present': True, 'mood': 2, 'moodUpdatedAt': None} for name in ['Alice', 'Bob']],
            'session': [], 'duration': 120, 'warning': 20, 'sound': False, 'usedMoodMeters': [],
        }
        daily = {'day': '2026-10-15', 'meter': None}
        archived = []
        def history_api(route):
            if route.request.method == 'POST':
                archived.append(route.request.post_data_json)
            route.fulfill(json={'rounds': []})
        def daily_api(route):
            if route.request.method == 'POST':
                daily['meter'] = route.request.post_data_json
            route.fulfill(json=daily)
        context.route('**/api/teams', lambda route: route.fulfill(json={'teams': [{'id': 'a' * 64, 'name': 'Test score', 'memberCount': 2}], 'activeTeamId': 'a' * 64}))
        context.route('**/api/team', lambda route: route.fulfill(json={'team': team, 'revision': 1} if route.request.method == 'GET' else {'revision': 2}))
        context.route('**/api/daily-meter', daily_api)
        context.route('**/api/history', history_api)
        context.route('**/mood-meters/catalog.json', lambda route: route.fulfill(json={'remote': True}))
        context.route('**/api/mood-meters/catalog', lambda route: route.fulfill(json=[]))
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE + '/mood')
        page.get_by_role('button', name='Continuer vers le minuteur', exact=False).click()
        expect(page.locator('#start-button')).to_be_visible()
        page.clock.install()
        now = page.evaluate('Date.now()')
        page.clock.pause_at(datetime.fromtimestamp((now + 1000) / 1000, timezone.utc))
        page.locator('#start-button').click()
        first = page.locator('#speaker-name').inner_text()
        score = page.locator('#live-score')
        value = page.locator('#live-score-value')
        expect(score).to_have_attribute('data-score-zone', 'building')
        page.clock.run_for(15000)
        expect(value).to_contain_text('500 / 1 000 pts')
        building_color = score.evaluate('el => getComputedStyle(el).color')
        page.clock.run_for(15000)
        expect(value).to_contain_text('1000 / 1 000 pts')
        expect(score).to_have_attribute('data-score-zone', 'optimal')
        optimal_color = score.evaluate('el => getComputedStyle(el).color')
        page.clock.run_for(80000)
        expect(value).to_contain_text('1000 / 1 000 pts')
        page.locator('#start-button').click()
        page.clock.run_for(30000)
        expect(value).to_contain_text('1000 / 1 000 pts')
        page.locator('#start-button').click()
        page.clock.run_for(10000)
        expect(value).to_contain_text('1000 / 1 000 pts')
        expect(page.locator('#timer-display')).to_have_text('+00:00')
        page.clock.run_for(12000)
        expect(score).to_have_attribute('data-score-zone', 'overtime')
        expect(value).to_contain_text('900 / 1 000 pts')
        expect(page.locator('#timer-display')).to_have_text('+00:12')
        expect(page.locator('#speaker-name')).to_have_text(first)
        expect(page.locator('#start-button')).to_contain_text('Pause')
        overtime_color = score.evaluate('el => getComputedStyle(el).color')
        assert len({building_color, optimal_color, overtime_color}) == 3
        page.locator('#start-button').click()
        page.clock.run_for(20000)
        expect(value).to_contain_text('900 / 1 000 pts')
        page.locator('#start-button').click()
        page.clock.run_for(12000)
        expect(value).to_contain_text('800 / 1 000 pts')
        page.locator('#manage-timer-button').click()
        page.get_by_role('button', name='Fermer les réglages').click()
        page.clock.run_for(5000)
        expect(value).to_contain_text('800 / 1 000 pts')

        for width, height in SIZES:
            page.set_viewport_size({'width': width, 'height': height})
            page.clock.run_for(1000)
            # Delegated button feedback may begin on a render after the clock jump.
            # Finish only finite effects; leave ambient infinite motion untouched.
            page.evaluate("document.getAnimations().filter(a => Number.isFinite(a.effect.getComputedTiming().endTime)).forEach(a => a.finish())")
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (motion, width)
            ring = page.locator('#timer-ring').bounding_box()
            score_box = score.bounding_box()
            assert ring and ring['width'] >= 90, (motion, width, ring)
            assert score_box and score_box['y'] >= ring['y'] and score_box['y'] + score_box['height'] <= ring['y'] + ring['height'] + 1, (motion, width, ring, score_box)
            for selector in ['#start-button', '#next-button', '#manage-timer-button']:
                box = page.locator(selector).bounding_box()
                assert box and box['height'] >= 44 and box['y'] + box['height'] <= height + 1, (motion, width, selector, box)
            if motion == 'reduce' and width in [320, 1366]:
                page.screenshot(path=os.path.join(tempfile.gettempdir(), f'scrum-live-score-{width}.png'))
        if motion == 'reduce':
            assert page.evaluate("document.getAnimations().filter(a => a.playState === 'running').length") == 0
        page.locator('#next-button').click()
        expect(page.locator('#speaker-name')).not_to_have_text(first)
        expect(score).to_have_attribute('data-score-zone', 'building')
        page.clock.run_for(30000)
        expect(value).to_contain_text('1000 / 1 000 pts')
        page.locator('#next-button').click()
        expect(page.get_by_role('button', name='Voir le bilan du jour')).to_be_visible()
        page.get_by_role('button', name='Voir le bilan du jour').click()
        expect(page.get_by_role('heading', name='Bilan enregistré · Classement')).to_be_visible()
        expect(page.get_by_text('1000 pts', exact=True)).to_be_visible()
        expect(page.get_by_text('800 pts', exact=True)).to_be_visible()
        page.get_by_role('button', name=f'Comprendre le score de {first}').click()
        breakdown = page.get_by_role('dialog')
        expect(breakdown).to_contain_text('Dépassement de 20 %')
        expect(breakdown).to_contain_text('Score enregistré : 800 pts')
        expect(breakdown).to_contain_text('pas le nombre de relances ni la version du barème')
        breakdown.get_by_role('button', name='Fermer', exact=True).click()
        page.clock.run_for(1000)
        expect(breakdown).not_to_be_visible()
        page.get_by_role('link', name='Guide d’utilisation', exact=True).click()
        expect(page.get_by_role('heading', name='Une équipe, un tour de parole, un bilan.')).to_be_visible()
        assert page.locator('article img').count() == 4
        assert len(archived) == 1, archived
        snapshot = archived[0]
        people = snapshot.get('round', snapshot)['people']
        assert sorted(person['score'] for person in people) == [800, 1000], people
        assert sorted(person['speakingSeconds'] for person in people) == [30, 144], people
        assert not errors, errors
        context.close()
    browser.close()
    print('PASS: live quarter/full/overtime scoring, colors, pause/resume/management, final archive parity, six sizes and both motion preferences; mocked APIs only')