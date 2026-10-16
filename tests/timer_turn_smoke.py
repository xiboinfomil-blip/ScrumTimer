"""Speaking-turn cues with mocked Neon APIs; never writes to the live database."""
import os
from datetime import datetime, timedelta, timezone
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3000')
SIZES = [(320, 568), (390, 844), (768, 1024), (1024, 576), (1366, 768), (1920, 1080)]

with sync_playwright() as p:
    browser = p.chromium.launch()
    for motion in ['no-preference', 'reduce']:
        context = browser.new_context(viewport={'width': 1366, 'height': 768}, reduced_motion=motion)
        team = {
            'roster': [
                {'id': name.lower(), 'name': name, 'present': True, 'mood': 2, 'moodUpdatedAt': None}
                for name in ['Alice <safe>', 'Bob', 'Charlie']
            ],
            'session': [], 'duration': 120, 'warning': 20, 'sound': False, 'usedMoodMeters': [],
        }
        daily = {'day': '2026-10-14', 'meter': None}
        def daily_api(route):
            assert route.request.headers.get('x-team-id') == 'a' * 64
            if route.request.method == 'POST' and daily['meter'] is None:
                daily['meter'] = route.request.post_data_json
            route.fulfill(json=daily)
        context.route('**/api/teams', lambda route: route.fulfill(json={'teams': [{'id': 'a' * 64, 'name': 'Mon équipe', 'memberCount': len(team['roster'])}], 'activeTeamId': 'a' * 64}))
        context.route('**/api/daily-meter', daily_api)
        context.route('**/api/team', lambda route: route.fulfill(json={
            'team': team, 'revision': 1,
        } if route.request.method == 'GET' else {'revision': 2}))
        context.route('**/api/history', lambda route: route.fulfill(json={'rounds': []}))
        hints = {person['id']: f"{person['name']} : sujet préparé\n<script>literal</script>"
                 for person in team['roster']}
        def hints_api(route):
            assert route.request.method == 'GET', 'Master timer must not edit notes'
            assert route.request.headers.get('x-team-id') == 'a' * 64
            day = datetime.now(timezone(timedelta(hours=4))).date().isoformat()
            route.fulfill(json={'day': day, 'hints': [
                {'participantId': pid, 'hint': text, 'revision': 1}
                for pid, text in hints.items()]})
        context.route('**/api/daily-hints', hints_api)
        context.route('**/api/meeting-settings', lambda route: route.fulfill(json={'prompts': [], 'revision': 0}))
        context.route('**/mood-meters/catalog.json', lambda route: route.fulfill(json={'remote': True}))
        context.route('**/api/mood-meters/catalog', lambda route: route.fulfill(json=[]))
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        for path in ['/participants', '/mood']:
            page.goto(BASE + path)
            page.wait_for_function("document.querySelector('header [role=status]')?.title === 'Équipe enregistrée dans Neon.'")
            stage = page.locator('#main-content > section, #main-content > div').first
            expect(stage).to_be_visible()
            expect(page.locator('[data-route-transition]')).to_be_visible()
            expect(page.get_by_role('list', name='Progression du point quotidien')).to_be_visible()
            expect(page.get_by_role('list', name='Progression du point quotidien').get_by_role('listitem')).to_have_count(3)
            expect(page.get_by_role('navigation', name='Navigation du point quotidien').get_by_role('link', name='Participants' if path == '/participants' else 'Humeurs', exact=True)).to_have_attribute('aria-current', 'page')
            for width, height in SIZES:
                page.set_viewport_size({'width': width, 'height': height})
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (path, width)
            if motion == 'reduce':
                assert page.evaluate("document.getAnimations().filter(a => a.playState === 'running').length") == 0, path
        page.set_viewport_size({'width': 1366, 'height': 768})
        page.goto(BASE + '/manage-team')
        page.locator('#checkin-name').fill('Action test')
        action = page.get_by_role('button', name='Enregistrer cette personne')
        action.evaluate('el => el.click()')
        if motion == 'no-preference':
            page.wait_for_function("Array.from(document.querySelectorAll('button')).some(el => el.getAnimations().some(a => a.effect.getTiming().duration === 380))")
        feedback = action.evaluate('el => el.getAnimations().some(a => a.effect.getTiming().duration === 380)')
        assert feedback == (motion == 'no-preference'), (motion, 'tap feedback')
        page.get_by_role('searchbox', name='Rechercher un membre', exact=True).fill('Action test')
        row = page.locator('li').filter(has_text='Action test')
        expect(row).to_have_count(1)
        row.get_by_role('checkbox').check()
        row.get_by_role('button', name='Retirer Action test').click()
        deletion = page.get_by_role('dialog', name='Supprimer cette personne ?', exact=True)
        expect(deletion).to_be_visible()
        deletion.get_by_role('button', name='Supprimer', exact=True).click()
        expect(row).to_have_count(0)
        page.goto(BASE + '/participants')
        page.get_by_role('button', name='Nouveau bilan', exact=True).click()
        dialog = page.get_by_role('dialog')
        expect(dialog).to_be_visible()
        expect(dialog.locator('.MuiDialogTitle-root')).to_be_visible()
        dialog.get_by_role('button', name='Annuler').click()
        expect(dialog).not_to_be_visible()
        page.goto(BASE + '/mood')
        expect(page.locator('#meter-catalogue-select')).to_have_value('-2')
        expect(page.locator('#daily-meter-note')).to_contain_text('Verrouillé après le premier vote')
        expect(page.locator('#meter-catalogue-select')).to_be_disabled()
        expect(page.locator('#random-meter-button')).to_be_disabled()
        expect(page.get_by_role('button', name='Continuer vers le minuteur', exact=False)).to_be_enabled()
        page.get_by_role('button', name='Continuer vers le minuteur', exact=False).click()
        expect(page.locator('#speaker-turn-cue')).to_have_count(0)
        page.locator('#start-button').click()
        cue = page.locator('#speaker-turn-cue')
        expect(cue).to_contain_text('À TOI DE PARLER !')
        first = page.locator('#speaker-name').inner_text()
        assert first in ['Alice <safe>', 'Bob', 'Charlie']
        expect(page.locator('[data-speaker-hint]')).to_have_text(hints[first.lower()])
        page.get_by_role('button', name=f'Lire la note de {first}', exact=True).click()
        note_dialog = page.get_by_role('dialog', name=f'Le pense-bête de {first}', exact=True)
        expect(note_dialog).to_be_visible()
        expect(note_dialog.get_by_text(hints[first.lower()], exact=True)).to_be_visible()
        expect(note_dialog.locator('script, textarea, input')).to_have_count(0)
        before = page.locator('#timer-display').inner_text()
        expect(page.locator('#start-button')).to_contain_text('Pause')
        page.wait_for_timeout(1100)
        expect(page.locator('#timer-display')).not_to_have_text(before)
        note_dialog.get_by_role('button', name='Fermer', exact=True).click()
        expect(note_dialog).not_to_be_visible()
        expect(page.locator('#start-button')).to_contain_text('Pause')
        assert cue.locator('script').count() == 0
        expect(cue).to_have_attribute('aria-atomic', 'true')
        halo = page.locator('#timer-ring > span').first
        halo_animation = halo.evaluate('el => getComputedStyle(el).animationName')
        assert halo_animation == ('none' if motion == 'reduce' else 'turn-halo'), halo_animation

        # Let the one-shot entrance finish before measuring geometry.
        page.wait_for_function("getComputedStyle(document.querySelector('#speaker-turn-cue')).opacity === '1' && ['none', 'matrix(1, 0, 0, 1, 0, 0)'].includes(getComputedStyle(document.querySelector('#speaker-turn-cue')).transform)")
        for width, height in SIZES:
            page.set_viewport_size({'width': width, 'height': height})
            page.wait_for_function("document.documentElement.scrollWidth <= innerWidth")
            box = cue.bounding_box()
            assert box and box['x'] >= 0 and box['x'] + box['width'] <= width + 1, (motion, width, box)
            ring = page.locator('#timer-ring').bounding_box()
            assert ring and ring['width'] >= 90, (motion, width, ring)
            for selector in ['#start-button', '#next-button', '#manage-timer-button']:
                button = page.locator(selector).bounding_box()
                assert button and button['height'] >= 44 and button['y'] + button['height'] <= height + 1, (motion, width, selector, button)

        page.locator('#start-button').click()
        expect(cue).to_contain_text('TON TOUR EST EN PAUSE')
        expect(page.locator('#speaker-name')).to_have_text(first)
        page.locator('#start-button').click()
        expect(cue).to_contain_text('À TOI DE PARLER !')
        page.locator('#manage-timer-button').click()
        expect(page.locator('#timer-management-dialog')).to_be_visible()
        page.get_by_role('button', name='Fermer les réglages').click()
        expect(page.locator('#timer-management-dialog')).not_to_be_visible()
        expect(cue).to_contain_text('TON TOUR EST EN PAUSE')
        page.locator('#start-button').click()
        page.locator('#next-button').click()
        expect(page.locator('#speaker-name')).not_to_have_text(first)
        next_name = page.locator('#speaker-name').inner_text()
        expect(page.locator('[data-speaker-hint]')).to_have_text(hints[next_name.lower()])
        expect(cue).to_contain_text('À TOI DE PARLER !')
        expect(page.locator('#start-button')).to_contain_text('Pause')

        current = page.locator('#speaker-name').inner_text()
        page.evaluate("""() => {
            const original = Date.now;
            Date.now = () => original() + 130000;
            document.dispatchEvent(new Event('visibilitychange'));
            Date.now = original;
        }""")
        expect(cue).to_contain_text('Merci de passer la parole')
        expect(page.locator('#speaker-name')).to_have_text(current)
        assert not errors, errors
        context.close()
    browser.close()
    print('PASS: page/brand motion and reduced-motion opt-out, speaking banner, start/pause/resume/handoff/expiry, read-only speaker notes without pausing, safe names, master workflow at six sizes; mocked Neon only')