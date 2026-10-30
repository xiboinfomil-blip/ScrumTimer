"""Score-free timer, pause/resume and archived scores; mocked APIs, no live writes."""
import os
import re
import tempfile
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright, expect
from browser_bootstrap import WARNING_SECONDS, install_browser_bootstrap, mauritius_day

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3000')
SIZES = [(320, 568), (390, 844), (768, 1024), (1024, 576), (1366, 768), (1920, 1080)]

def assert_score_free_timer(page):
    expect(page.locator('#live-score')).to_have_count(0)
    expect(page.locator('#live-score-value')).to_have_count(0)
    expect(page.locator('.timer-panel')).not_to_contain_text(re.compile(r'\b(?:scores?|points?|pts)\b', re.IGNORECASE))

with sync_playwright() as p:
    browser = p.chromium.launch()
    for motion in ['reduce', 'no-preference']:
        context = browser.new_context(viewport={'width': 1366, 'height': 768}, reduced_motion=motion, service_workers='block')
        bootstrap = install_browser_bootstrap(context)
        team = {
            'roster': [{'id': name.lower(), 'name': name, 'present': True, 'mood': 2, 'moodUpdatedAt': None} for name in ['Alice', 'Bob']],
            'session': [], 'duration': 120, 'warning': WARNING_SECONDS, 'sound': False, 'usedMoodMeters': [],
        }
        daily = {'day': mauritius_day(), 'meter': None}
        archived = []
        def history_api(route):
            if route.request.method == 'POST':
                archived.append(route.request.post_data_json)
            route.fulfill(json={'rounds': archived, 'day': mauritius_day()})
        def daily_api(route):
            if route.request.method == 'POST':
                daily['meter'] = route.request.post_data_json
            route.fulfill(json=daily)
        context.route('**/api/teams', lambda route: route.fulfill(json={'teams': [{'id': 'a' * 64, 'name': 'Test score', 'memberCount': 2}], 'activeTeamId': 'a' * 64}))
        context.route('**/api/team', lambda route: route.fulfill(json={'team': team, 'revision': 1} if route.request.method == 'GET' else {'revision': 2}))
        context.route('**/api/daily-meter', daily_api)
        context.route('**/api/history', history_api)
        context.route('**/api/meeting-settings', lambda route: route.fulfill(json={'prompts': [], 'revision': 0}))
        context.route('**/api/daily-hints', lambda route: route.fulfill(json={'day': mauritius_day(), 'hints': []}))
        context.route('**/mood-meters/catalog.json', lambda route: route.fulfill(json={'remote': True}))
        context.route('**/api/mood-meters/catalog', lambda route: route.fulfill(json=[]))
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE + '/mood')
        page.get_by_role('button', name='Continuer vers le minuteur', exact=False).click()
        expect(page.locator('#start-button')).to_be_visible()
        assert_score_free_timer(page)
        page.clock.install()
        now = page.evaluate('Date.now()')
        page.clock.pause_at(datetime.fromtimestamp((now + 1000) / 1000, timezone.utc))
        page.locator('#start-button').click()
        first = page.locator('#speaker-name').inner_text()
        assert_score_free_timer(page)
        page.clock.run_for(15000)
        assert_score_free_timer(page)
        page.clock.run_for(15000)
        assert_score_free_timer(page)
        page.clock.run_for(80000)
        assert_score_free_timer(page)
        page.locator('#start-button').click()
        page.clock.run_for(30000)
        assert_score_free_timer(page)
        page.locator('#start-button').click()
        page.clock.run_for(10000)
        assert_score_free_timer(page)
        expect(page.locator('#timer-display')).to_have_text('+00:00')
        page.clock.run_for(12000)
        assert_score_free_timer(page)
        expect(page.locator('#timer-display')).to_have_text('+00:12')
        expect(page.locator('#speaker-name')).to_have_text(first)
        expect(page.locator('#start-button')).to_contain_text('Pause')
        page.locator('#start-button').click()
        page.clock.run_for(20000)
        assert_score_free_timer(page)
        page.locator('#start-button').click()
        page.clock.run_for(12000)
        assert_score_free_timer(page)
        expect(page.locator('#timer-display')).to_have_text('+00:24')
        page.locator('#manage-timer-button').click()
        page.get_by_role('button', name='Fermer les réglages').click()
        page.clock.run_for(5000)
        assert_score_free_timer(page)
        expect(page.locator('#timer-display')).to_have_text('+00:24')

        for width, height in SIZES:
            page.set_viewport_size({'width': width, 'height': height})
            page.clock.run_for(1000)
            # Delegated button feedback may begin on a render after the clock jump.
            # Finish only finite effects; leave ambient infinite motion untouched.
            page.evaluate("document.getAnimations().filter(a => Number.isFinite(a.effect.getComputedTiming().endTime)).forEach(a => a.finish())")
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (motion, width)
            stage = page.locator('#timer-stage').bounding_box()
            display_box = page.locator('#timer-display').bounding_box()
            assert stage and stage['width'] >= 90, (motion, width, stage)
            assert display_box and display_box['y'] >= stage['y'] and display_box['y'] + display_box['height'] <= stage['y'] + stage['height'] + 1, (motion, width, stage, display_box)
            assert_score_free_timer(page)
            for selector in ['#start-button', '#next-button', '#manage-timer-button']:
                box = page.locator(selector).bounding_box()
                assert box and box['height'] >= 44 and box['y'] + box['height'] <= height + 1, (motion, width, selector, box)
            if motion == 'reduce' and width in [320, 1366]:
                page.screenshot(path=os.path.join(tempfile.gettempdir(), f'scrum-score-free-timer-{width}.png'))
        if motion == 'reduce':
            assert page.evaluate("document.getAnimations().filter(a => a.playState === 'running').length") == 0
        page.locator('#next-button').click()
        expect(page.locator('#speaker-name')).not_to_have_text(first)
        assert_score_free_timer(page)
        page.clock.run_for(72000)
        assert_score_free_timer(page)
        page.locator('#next-button').click()
        expect(page.get_by_role('button', name='Voir le bilan du jour')).to_be_visible()
        page.get_by_role('button', name='Voir le bilan du jour').click()
        expect(page.get_by_role('heading', name='Bilan enregistré · Classement')).to_be_visible()
        expect(page.get_by_text('670 pts', exact=True)).to_be_visible()
        expect(page.get_by_text('750 pts', exact=True)).to_be_visible()
        page.get_by_role('button', name=f'Comprendre le score de {first}').click()
        breakdown = page.get_by_role('dialog')
        expect(breakdown).to_contain_text('Après 120 s')
        expect(breakdown).to_contain_text('850 − 50 × 2) = 750 pts')
        expect(breakdown).to_contain_text('Score enregistré : 750 pts')
        expect(breakdown).to_contain_text('pas le nombre de relances ni la version du barème')
        breakdown.get_by_role('button', name='Fermer', exact=True).click()
        page.clock.run_for(1000)
        expect(breakdown).not_to_be_visible()
        # A fresh provider must read the persisted score without a duplicate archive.
        page.reload()
        page.get_by_role('button', name='Voir le bilan du jour').click()
        expect(page.get_by_text('670 pts', exact=True)).to_be_visible()
        expect(page.get_by_text('750 pts', exact=True)).to_be_visible()
        assert len(archived) == 1, 'Reload must not create another archive'
        page.get_by_role('link', name='Guide d’utilisation', exact=True).click()
        expect(page.get_by_role('heading', name='Guide d’utilisation', exact=True)).to_be_visible()
        assert page.locator('article img').count() == 4
        assert len(archived) == 1, archived
        snapshot = archived[0]
        people = snapshot.get('round', snapshot)['people']
        assert sorted(person['score'] for person in people) == [670, 750], people
        assert sorted(person['speakingSeconds'] for person in people) == [72, 144], people
        assert not errors, errors
        bootstrap.assert_no_unexpected_api()
        context.close()
    browser.close()
    print('PASS: score-free setup/running/pause/overtime timer, pause/resume/management, archived scores 750/670 and active times 144/72, reload readback without duplicate archive, ring geometry, timer controls, guide, six sizes and both motion preferences; mocked APIs only')