"""Optional browser regression suite: install Python Playwright and run with a server on :3000."""
import json
import os
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3000')
KEY = 'standup.team.v2'

def seeded_state(count=3):
    return dict(roster=[dict(id=f'p{i}', name=f'Personne {i} avec un nom assez long', present=True, mood=(i % 4) + 1, moodUpdatedAt=None) for i in range(count)], session=[f'p{i}' for i in range(count)], duration=120, warning=30, sound=False)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    context = browser.new_context(viewport=dict(width=1366, height=768))
    page = context.new_page()
    errors = []
    asset_failures = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('response', lambda response: asset_failures.append((response.status, response.url)) if '/_next/static/' in response.url and response.status >= 400 else None)
    page.goto(BASE)
    assert not asset_failures, f'CSS/JavaScript unavailable; restart the production server after rebuilding: {asset_failures}'
    header_style = page.locator('.site-header').evaluate('(element) => getComputedStyle(element).position')
    assert header_style == 'relative', 'Navbar styles missing; check CSS loading and restart stale production servers.'
    page.get_by_role('textbox', name='Nom du membre').wait_for()
    page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    assert not page.locator('main h1').evaluate('(heading) => heading === document.activeElement'), 'Page load must not focus the heading.'
    assert page.url.endswith('/participants')
    nav = page.get_by_role('navigation', name='Navigation du point quotidien')
    assert nav.get_by_role('link', name='Participants', exact=True).get_attribute('aria-current') == 'page'
    assert nav.get_by_role('button', name='Humeurs —').is_disabled()
    assert nav.get_by_role('button', name='Minuteur —').is_disabled()
    page.goto(BASE + '/timer')
    page.wait_for_url('**/participants')
    for name in ['Alice', 'Bob', '<img src=x onerror=alert(1)>']:
        page.get_by_role('textbox', name='Nom du membre').fill(name)
        page.get_by_role('button', name='Enregistrer cette personne').click()
    assert len(page.evaluate(f'JSON.parse(localStorage.getItem("{KEY}")).roster')) == 3
    assert page.locator('.attendance-section img').count() == 0
    present_list = page.get_by_role('region', name='Présents', exact=True)
    while not present_list.get_by_role('button', name='Déplacer Bob vers les absents').count():
        present_list.get_by_role('button', name='Page suivante').click()
    present_list.get_by_role('button', name='Déplacer Bob vers les absents').click()
    assert nav.get_by_role('link', name='Humeurs').is_visible()
    page.get_by_role('button', name='Continuer vers les humeurs').click()
    page.wait_for_url('**/mood')
    assert page.get_by_role('button', name='Continuer vers le minuteur').is_disabled()
    page.get_by_role('button', name='Humeur 2 pour Alice', exact=True).click()
    page.get_by_role('button', name='Humeur 3 pour <img src=x onerror=alert(1)>', exact=True).click()
    page.locator('#meter-catalogue-select option').nth(1).wait_for(state='attached')
    assert page.locator('#meter-catalogue-select option').count() == 888
    page.select_option('#meter-catalogue-select', label='Alligators')
    page.wait_for_function("Array.from(document.querySelectorAll('#meter-slide-wrapper img')).every(image => image.complete && image.naturalWidth > 0)")
    assert page.locator('#meter-overlays img').count() > 0
    page.get_by_role('button', name='Humeur 2 pour Alice', exact=True).click()
    saved_mood_slide = page.evaluate(f'JSON.parse(localStorage.getItem("{KEY}")).roster.find(p => p.name === "Alice").moodSlide')
    assert saved_mood_slide and saved_mood_slide['slideNumber'] == 1
    page.get_by_role('button', name='Mettre les animations en pause').click()
    assert page.locator('#meter-overlays img:visible').count() == 0
    assert page.locator('#meter-overlays canvas:visible').count() > 0
    page.get_by_role('button', name='Lire les animations').click()
    page.get_by_role('button', name='Continuer vers le minuteur').click()
    page.wait_for_url('**/timer')
    assert page.locator('#person-list li').count() == 2
    first = page.locator('#speaker-name').inner_text()
    page.locator('#shuffle-button').click()
    assert page.locator('#speaker-name').inner_text() != first
    page.locator('#duration-minutes').fill('0')
    page.locator('#duration-seconds').fill('2')
    page.locator('#apply-duration').click()
    page.locator('#start-button').click()
    locked = page.locator('#speaker-name').inner_text()
    page.locator('#start-button').click()
    assert page.locator('#speaker-name').inner_text() == locked
    page.locator('#start-button').click()
    page.wait_for_function("document.querySelector('#status-pill').textContent.includes('Temps écoulé')")
    assert page.locator('#speaker-name').inner_text() == locked
    assert '00:00' == page.locator('#timer-display').inner_text()
    assert page.locator('#speaker-slider').is_visible()
    assert page.locator('#duration-minutes').count() == 0
    page.locator('#manage-timer-button').click()
    page.locator('#add-time-button').click()
    assert page.locator('#timer-display').inner_text() == '00:30'
    page.get_by_role('button', name='Fermer les réglages').click()
    page.locator('#next-button').click()
    assert page.locator('#speaker-name').inner_text() != locked
    assert 'Pause' in page.locator('#start-button').inner_text()
    assert page.locator('#speaker-slider').is_visible()
    page.locator('#next-button').click()
    page.locator('#session-leaderboard').wait_for()
    assert page.locator('#timer-page').get_attribute('data-mode') == 'results'
    page.locator('#used-mood-slides').wait_for()
    page.locator('#result-meter-0-slide').wait_for(state='attached')
    assert saved_mood_slide['image'] == page.locator('#result-meter-0-slide').get_attribute('src')
    page.locator('#new-round-button').click()
    page.locator('#start-button').click()
    page.reload()
    page.locator('#start-button').wait_for()
    assert 'Démarrer' in page.locator('#start-button').inner_text()
    assert page.locator('#timer-display').inner_text() == '00:02'
    page.goto(BASE + '/participants')
    page.get_by_role('checkbox', name='Tout sélectionner', exact=True).check()
    page.get_by_role('button', name='Supprimer la sélection').click()
    page.get_by_role('button', name='Annuler', exact=True).click()
    assert len(page.evaluate(f'JSON.parse(localStorage.getItem("{KEY}")).roster')) == 3
    page.get_by_role('button', name='Supprimer la sélection').click()
    page.get_by_role('button', name='Supprimer', exact=True).click()
    page.wait_for_function(f'JSON.parse(localStorage.getItem("{KEY}")).roster.length === 0')
    assert not errors, errors
    assert not asset_failures, asset_failures
    print('PASS: gated flow, safe names, attendance, moods, 888-deck catalog, GIF pause/resume, timer, reload, deletion.')
    context.close()

    for width, height in [(320, 568), (390, 844), (768, 1024), (1024, 576), (1366, 768), (1920, 1080)]:
        context = browser.new_context(viewport=dict(width=width, height=height), reduced_motion='reduce')
        context.add_init_script(f'localStorage.setItem("{KEY}", {json.dumps(json.dumps(seeded_state(40)))})')
        page = context.new_page()
        for route in ['participants', 'mood', 'timer']:
            page.goto(BASE + '/' + route)
            page.locator(f'#{route}-page').wait_for()
            page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
            assert not page.locator('main h1').evaluate('(heading) => heading === document.activeElement'), (route, 'Page load must not focus the heading.')
            nav = page.get_by_role('navigation', name='Navigation du point quotidien')
            assert nav.locator('[aria-current="page"]').count() == 1
            for link in nav.get_by_role('link').all():
                box = link.bounding_box()
                assert box and box['height'] >= 44 and box['x'] >= 0 and box['x'] + box['width'] <= width, (width, height, route, 'navbar target clipped')
            page.wait_for_function("document.querySelector('.checkin-list li,.person-list li') !== null")
            page.wait_for_function("document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight")
            overflow = page.evaluate("""() => Array.from(document.querySelectorAll('.checkin-list,.person-list')).filter(el => el.getBoundingClientRect().width > 0).some(el => el.scrollHeight > el.clientHeight + 2)""")
            assert not overflow, (width, height, route, 'list overflow')
            if route == 'participants':
                for control in page.locator('.add-person button:visible,.attendance-button:visible,.remove-person:visible,.wizard-actions button:visible').all():
                    box = control.bounding_box()
                    assert box and box['height'] >= 43.99 and box['x'] >= 0 and box['x'] + box['width'] <= width and box['y'] + box['height'] <= height, (width, height, 'participant control clipped', box)
                assert page.locator('.checkin-person:visible').first.bounding_box()['height'] <= 48
                assert page.locator('.add-person').bounding_box()['height'] <= 44
                if width <= 650:
                    page.get_by_role('button', name='Absents 0', exact=True).click()
                    page.get_by_role('region', name='Absents', exact=True).wait_for(state='visible')
                    page.get_by_role('region', name='Présents', exact=True).wait_for(state='hidden')
                    page.get_by_role('button', name='Présents 40', exact=True).click()
            if route == 'timer':
                ring = page.locator('#timer-ring').bounding_box()
                assert ring and ring['width'] >= 90 and ring['height'] >= 90, (width, height, 'ring collapsed', ring, page.locator('.timer-panel').bounding_box())
                for selector in ['#timer-display', '#start-button', '#duration-minutes', '#warning-seconds', '#add-time-button']:
                    box = page.locator(selector).bounding_box()
                    assert box and box['y'] >= 0 and box['y'] + box['height'] <= height, (width, height, selector, 'control clipped')
                for selector in ['#reset-button', '#start-button', '#next-button', '#duration-minutes', '#duration-seconds', '#apply-duration', '#warning-seconds', '#add-time-button']:
                    box = page.locator(selector).bounding_box()
                    assert box and box['height'] >= 44 and box['x'] >= 0 and box['x'] + box['width'] <= width, (width, height, selector, 'timer target too small or clipped')
                if width <= 800:
                    page.get_by_role('button', name='Participants', exact=True).click()
                    page.locator('.team-panel').wait_for(state='visible')
                    page.locator('.timer-panel').wait_for(state='hidden')
                    page.get_by_role('button', name='Questions', exact=True).click()
                    page.locator('.daily-prompts').wait_for(state='visible')
                sound = page.get_by_role('button', name='Activer les alertes sonores', exact=True)
                sound.click()
                assert page.get_by_role('button', name='Couper les alertes sonores', exact=True).get_attribute('aria-pressed') == 'true'
                page.get_by_role('button', name='Couper les alertes sonores', exact=True).click()
                if width <= 800:
                    page.get_by_role('button', name='Minuteur', exact=True).click()
                page.locator('#start-button').click()
                assert page.locator('#speaker-slider').is_visible()
                assert page.locator('#duration-minutes').count() == 0
                assert page.locator('#reset-button').count() == 0
                assert page.locator('#timer-page').get_attribute('data-mode') == 'speaking'
                ring = page.locator('#timer-ring').bounding_box()
                assert ring and ring['width'] >= 90 and ring['height'] >= 90, (width, height, 'focused ring collapsed')
                for selector in ['#speaker-slider', '#next-button', '#manage-timer-button']:
                    box = page.locator(selector).bounding_box()
                    assert box and box['x'] >= 0 and box['x'] + box['width'] <= width and box['y'] + box['height'] <= height, (width, height, 'focused control clipped', selector, box)
                upcoming = page.locator('#upcoming-speaker').inner_text()
                previous = page.locator('#speaker-name').inner_text()
                page.locator('#next-button').click()
                assert page.locator('#speaker-name').inner_text() == upcoming
                assert previous in page.locator('#speaker-slider').inner_text()
                assert 'Pause' in page.locator('#start-button').inner_text()
                page.locator('#manage-timer-button').click()
                assert page.locator('#duration-minutes').is_visible()
                assert page.get_by_role('dialog', name='Modifier le minuteur').is_visible()
                assert 'Reprendre' in page.locator('#start-button').inner_text()
                page.keyboard.press('Escape')
                assert page.locator('#duration-minutes').count() == 0
                for _ in range(39):
                    if page.locator('#next-button').count():
                        page.locator('#next-button').click()
                page.locator('#session-leaderboard').wait_for()
                page.wait_for_function("document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight")
                assert not page.locator('.leaderboard-list').evaluate('(el) => el.scrollHeight > el.clientHeight + 2')
                if width <= 800:
                    page.get_by_role('button', name='Statistiques', exact=True).click()
                assert page.locator('#session-statistics').is_visible()
                page.locator('#new-round-button').click()
                page.locator('#start-button').wait_for()
            if route == 'mood' and width <= 800:
                page.get_by_role('button', name='Humeurs de l’équipe', exact=True).click()
                page.get_by_role('region', name='Le ressenti de votre équipe').wait_for(state='visible')
                page.get_by_role('region', name='Le baromètre d’humeur').wait_for(state='hidden')
            nav.get_by_role('link', name='Participants').click()
            page.wait_for_url('**/participants')
            page.get_by_role('navigation', name='Navigation du point quotidien').get_by_role('link', name='Humeurs').click()
            page.wait_for_url('**/mood')
        print(f'PASS: three routes, 40-person pagination, no overflow at {width}x{height}.')
        context.close()

    context = browser.new_context(reduced_motion='no-preference')
    context.add_init_script(f'localStorage.setItem("{KEY}", {json.dumps(json.dumps(seeded_state()))})')
    page = context.new_page()
    page.clock.install()
    page.goto(BASE + '/mood')
    page.locator('#meter-catalogue-select option').nth(1).wait_for(state='attached')
    page.select_option('#meter-catalogue-select', label='Alligators')
    page.get_by_role('button', name='Mettre les animations en pause').wait_for()
    page.clock.pause_at(datetime.fromtimestamp((page.evaluate('Date.now()') + 1000) / 1000, timezone.utc))
    assert page.locator('#meter-slide-count').inner_text() == '1 / 2'
    assert page.get_by_role('button', name='Diapositive précédente').is_disabled()
    page.clock.run_for(60_000)
    assert page.locator('#meter-slide-count').inner_text() == '1 / 2'
    assert page.locator('#meter-overlays img:visible').count() > 0
    page.get_by_role('button', name='Mettre les animations en pause').click()
    assert page.locator('#meter-overlays img:visible').count() == 0
    page.get_by_role('button', name='Diapositive suivante').click()
    assert page.locator('#meter-slide-count').inner_text() == '2 / 2'
    assert page.get_by_role('button', name='Diapositive suivante').is_disabled()
    assert page.get_by_role('button', name='Mettre les animations en pause').get_attribute('aria-pressed') == 'false'
    page.get_by_role('button', name='Mettre les animations en pause').click()
    page.get_by_role('button', name='Diapositive précédente').click()
    assert page.locator('#meter-slide-count').inner_text() == '1 / 2'
    assert page.get_by_role('button', name='Mettre les animations en pause').get_attribute('aria-pressed') == 'false'
    page.get_by_role('button', name='Mettre les animations en pause').click()
    page.get_by_role('button', name='Lire les animations').click()
    page.clock.run_for(100)
    page.locator('#meter-overlays img').first.wait_for(state='visible')
    assert page.locator('#meter-overlays img:visible').count() > 0
    page.get_by_role('button', name='Mettre les animations en pause').click()
    page.select_option('#meter-catalogue-select', label='Alligators')
    assert page.get_by_role('button', name='Mettre les animations en pause').get_attribute('aria-pressed') == 'false'
    context.close()
    print('PASS: GIF autoplay on load/slide/deck changes, stop/resume, manual navigation, no timed slide advance.')

    for motion in ['no-preference', 'reduce']:
        context = browser.new_context(reduced_motion=motion)
        state = seeded_state()
        state.update(duration=40, warning=30)
        context.add_init_script(f'localStorage.setItem("{KEY}", {json.dumps(json.dumps(state))})')
        page = context.new_page()
        page.clock.install()
        page.goto(BASE + '/timer')
        page.locator('#start-button').wait_for()
        page.locator('.timer-panel[data-urgency="normal"]').wait_for()
        page.clock.pause_at(datetime.fromtimestamp((page.evaluate('Date.now()') + 1000) / 1000, timezone.utc))
        panel = page.locator('.timer-panel')
        assert panel.get_attribute('data-urgency') == 'normal'
        page.locator('#start-button').click()
        speaker = page.locator('#speaker-name').inner_text()
        page.clock.run_for(11_000)
        assert panel.get_attribute('data-urgency') == 'warning'
        animation = page.locator('#timer-ring').evaluate('(el) => getComputedStyle(el).animationName')
        assert animation == ('warning-glow' if motion == 'no-preference' else 'none'), animation
        page.locator('#start-button').click()
        assert page.locator('#timer-ring').evaluate('(el) => getComputedStyle(el).animationName') == 'none'
        frozen = page.locator('#timer-display').inner_text()
        page.locator('#main-content').focus()
        page.keyboard.press('r')
        assert page.locator('#timer-display').inner_text() == frozen
        assert page.locator('#speaker-slider').is_visible()
        page.clock.run_for(5000)
        assert page.locator('#timer-display').inner_text() == frozen
        page.locator('#start-button').click()
        page.clock.run_for(20_000)
        assert panel.get_attribute('data-urgency') == 'critical'
        animation = page.locator('#timer-ring').evaluate('(el) => getComputedStyle(el).animationName')
        assert animation == ('critical-glow' if motion == 'no-preference' else 'none'), animation
        page.clock.run_for(10_000)
        assert panel.get_attribute('data-urgency') == 'expired'
        assert page.locator('#time-up-alert').is_visible()
        assert page.locator('#speaker-name').inner_text() == speaker
        assert '00:00' == page.locator('#timer-display').inner_text()
        page.clock.run_for(10_000)
        assert page.locator('#time-up-alert').is_visible()
        assert page.locator('#speaker-name').inner_text() == speaker
        page.locator('#next-button').click()
        assert page.locator('#time-up-alert').count() == 0
        assert panel.get_attribute('data-urgency') == 'normal'
        assert 'Pause' in page.locator('#start-button').inner_text()
        assert page.locator('#speaker-slider').is_visible()
        page.clock.run_for(2000)
        assert page.locator('#timer-display').inner_text() == '00:38'
        page.locator('#next-button').click()
        page.clock.run_for(2000)
        page.locator('#next-button').click()
        page.locator('#session-leaderboard').wait_for()
        rows = page.locator('.leaderboard-list').inner_text()
        assert '760' in rows and '400' in rows, rows
        assert page.locator('#session-statistics').is_visible()
        page.locator('#new-round-button').click()
        assert page.locator('#timer-page').get_attribute('data-mode') == 'setup'
        context.close()
    print('PASS: orange/red urgency, pause freezes time and motion, reduced-motion support, persistent expiry alert and manual handoff.')

    context = browser.new_context(reduced_motion='reduce')
    state = seeded_state(1)
    state.update(duration=100, warning=30)
    context.add_init_script(f'localStorage.setItem("{KEY}", {json.dumps(json.dumps(state))})')
    page = context.new_page()
    page.clock.install()
    page.goto(BASE + '/timer')
    page.locator('#start-button').wait_for()
    page.clock.pause_at(datetime.fromtimestamp((page.evaluate('Date.now()') + 1000) / 1000, timezone.utc))
    page.locator('#start-button').click()
    page.clock.run_for(30_000)
    page.locator('#manage-timer-button').click()
    paused = page.locator('#timer-display').inner_text()
    page.clock.run_for(5000)
    assert page.locator('#timer-display').inner_text() == paused
    page.keyboard.press('Escape')
    page.locator('#start-button').click()
    page.clock.run_for(1000)
    page.locator('#manage-timer-button').click()
    page.get_by_role('dialog', name='Modifier le minuteur').get_by_role('button', name='Réinitialiser', exact=True).click()
    page.get_by_role('button', name='Fermer les réglages').click()
    page.locator('#start-button').click()
    page.clock.run_for(30_000)
    page.locator('#next-button').click()
    page.locator('#session-leaderboard').wait_for()
    row = page.locator('.leaderboard-list').inner_text()
    assert '900' in row and '2 passage(s)' in row, row
    context.close()
    print('PASS: edit modal freezes countdown, Escape closes, pause/resume does not count as a restart, reset adds one attempt and score penalty.')

    context = browser.new_context(reduced_motion='reduce')
    context.add_init_script(f'localStorage.setItem("{KEY}", {json.dumps(json.dumps(seeded_state()))})')
    page = context.new_page()
    page.goto(BASE + '/mood')
    page.locator('#meter-catalogue-select option').nth(1).wait_for(state='attached')
    page.select_option('#meter-catalogue-select', label='Alligators')
    page.get_by_role('button', name='Mettre les animations en pause').wait_for()
    page.locator('#meter-overlays img').first.wait_for(state='visible')
    assert page.locator('#meter-overlays img:visible').count() > 0
    page.get_by_role('button', name='Mettre les animations en pause').click()
    assert page.locator('#meter-overlays img:visible').count() == 0
    page.clock.install()
    page.clock.pause_at(datetime.fromtimestamp((page.evaluate('Date.now()') + 1000) / 1000, timezone.utc))
    before = page.locator('#meter-slide-count').inner_text()
    page.clock.run_for(24_100)
    assert page.locator('#meter-slide-count').inner_text() == before
    page.get_by_role('button', name='Diapositive suivante').click()
    assert page.get_by_role('button', name='Mettre les animations en pause').get_attribute('aria-pressed') == 'false'
    context.close()

    context = browser.new_context()
    context.add_init_script("Storage.prototype.getItem = () => { throw new Error('blocked') }; Storage.prototype.setItem = () => { throw new Error('blocked') }")
    page = context.new_page()
    page.goto(BASE + '/participants')
    page.locator('.storage-notice').wait_for()
    page.get_by_role('textbox', name='Nom du membre').fill('Mémoire uniquement')
    page.get_by_role('button', name='Enregistrer cette personne').click()
    assert page.get_by_role('button', name='Continuer vers les humeurs').is_enabled()
    context.close()
    print('PASS: explicitly requested GIF autoplay with reduced motion, manual stop, and unavailable-storage fallback.')
    browser.close()