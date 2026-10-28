"""Speaking-turn cues with mocked Neon APIs; never writes to the live database."""
import os
import base64
import struct
import zlib
from playwright.sync_api import sync_playwright, expect
from browser_bootstrap import WARNING_SECONDS, install_browser_bootstrap, mauritius_day

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3000')
SIZES = [(320, 568), (390, 844), (768, 1024), (1024, 576), (1366, 768), (1920, 1080)]


def picture(color):
    def chunk(kind, data):
        return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data))
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!IIBBBBB', 32, 32, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress((b'\x00' + bytes(color) * 32) * 32)) + chunk(b'IEND', b'')
    return 'data:image/png;base64,' + base64.b64encode(png).decode()


PICTURES = [picture(color) for color in [(220, 40, 40), (30, 160, 80), (30, 90, 210), (240, 190, 30)]]
DECK_ID = 'deck-1234567890abcdef1234'
SLIDE_ROOT = f'/mood-meters/slides/{DECK_ID}'
SVG = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 960 540">' + ''.join(
    f'<g transform="matrix(2.4 0 0 2.4 {left} {top})"><image width="100" height="100" xlink:href="{PICTURES[index]}"/></g>'
    for index, left, top in [(3, 620, 10), (1, 80, 285), (2, 620, 285), (0, 80, 10)]
) + f'<image x="410" y="200" width="40" height="40" href="{PICTURES[3]}"/></svg>'

with sync_playwright() as p:
    browser = p.chromium.launch()
    for motion in ['no-preference', 'reduce']:
        context = browser.new_context(viewport={'width': 1366, 'height': 768}, reduced_motion=motion, service_workers='block')
        bootstrap = install_browser_bootstrap(context)
        team = {
            'roster': [
                {'id': name.lower(), 'name': name, 'present': True, 'mood': mood, 'moodUpdatedAt': None,
                 'moodSlide': {'title': 'Images test', 'image': f'{SLIDE_ROOT}/second.svg', 'slideNumber': 2}}
                for name, mood in [('Alice <safe>', 1), ('Bob', 2), ('Charlie', 4)]
            ],
            'session': [], 'duration': 120, 'warning': WARNING_SECONDS, 'sound': False, 'usedMoodMeters': [],
        }
        daily = {'day': mauritius_day(), 'meter': {'meterId': DECK_ID, 'title': 'Images test'}}
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
        hints = {person['id']: f"**Avancement**\n\n- API terminée\n- *Tests* en cours\n\n1. ~~Ancien~~\n2. Suite\n\n<script>alert(1)</script>\n\n![image](https://evil.invalid/note-image)\n\n[Lien](https://evil.invalid/note-link)"
                 for person in team['roster']}
        def hints_api(route):
            assert route.request.method == 'GET', 'Master timer must not edit notes'
            assert route.request.headers.get('x-team-id') == 'a' * 64
            day = mauritius_day()
            route.fulfill(json={'day': day, 'hints': [
                {'participantId': pid, 'hint': text, 'revision': 1}
                for pid, text in hints.items()]})
        context.route('**/api/daily-hints', hints_api)
        context.route('**/api/meeting-settings', lambda route: route.fulfill(json={'prompts': ['Qu’avez-vous fait hier ?', 'Sur quoi travaillez-vous ?', 'Que ferez-vous aujourd’hui ?'], 'revision': 0}))
        context.route('**/mood-meters/catalog.json', lambda route: route.fulfill(json={'remote': True}))
        context.route('**/api/mood-meters/catalog', lambda route: route.fulfill(json=[{'remoteId': DECK_ID, 'title': 'Images test', 'slides': []}]))
        context.route(f'**/api/mood-meters/decks/{DECK_ID}', lambda route: route.fulfill(json={'title': 'Images test', 'slides': [f'{SLIDE_ROOT[1:]}/first.svg', f'{SLIDE_ROOT[1:]}/second.svg']}))
        context.route(f'**{SLIDE_ROOT}/*.svg', lambda route: route.fulfill(content_type='image/svg+xml', body=SVG if route.request.url.endswith('first.svg') else '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540"/>'))
        page = context.new_page()
        errors = []
        external_notes = []
        context.route('https://evil.invalid/**', lambda route: (external_notes.append(route.request.url), route.abort()))
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
        row.get_by_role('button', name='Retirer Action test de l’équipe', exact=True).click()
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
        expect(page.locator('#meter-catalogue-select')).to_have_value('0')
        expect(page.locator('#daily-meter-note')).to_contain_text('Verrouillé après le premier vote')
        expect(page.locator('#meter-catalogue-select')).to_be_disabled()
        expect(page.locator('#random-meter-button')).to_be_disabled()
        expect(page.get_by_role('button', name='Continuer vers le minuteur', exact=False)).to_be_enabled()
        page.get_by_role('button', name='Continuer vers le minuteur', exact=False).click()
        expect(page.locator('#speaker-turn-cue')).to_have_count(0)
        expect(page.locator('#previous-button')).to_be_disabled()
        for width, height in SIZES:
            page.set_viewport_size({'width': width, 'height': height})
            page.wait_for_function("document.documentElement.scrollWidth <= innerWidth")
            ring = page.locator('#timer-ring').bounding_box()
            assert ring and ring['width'] >= 90, ('setup', motion, width, ring)
            for selector in ['#previous-button', '#start-button', '#next-button', '#manage-timer-button']:
                button = page.locator(selector).bounding_box()
                assert button and button['height'] >= 43.99 and button['y'] + button['height'] <= height + 1, ('setup', motion, width, selector, button)
                assert button['x'] >= 0 and button['x'] + button['width'] <= width + 1, ('setup', motion, width, selector, button)
        page.set_viewport_size({'width': 1366, 'height': 768})
        # Setup keeps the speaking stage clean; queue and settings have their own context.
        expect(page.locator('.timer-panel .timer-settings')).to_have_count(0)
        page.get_by_role('button', name='Voir le tour de parole', exact=True).click()
        lineup = page.get_by_role('dialog', name='Le tour de parole', exact=True)
        expect(lineup).to_be_visible()
        expect(lineup.locator('.person-row')).to_have_count(3)
        lineup.get_by_role('button', name='Revenir au passage').click()
        page.locator('#manage-timer-button').click()
        expect(page.locator('#duration-minutes')).to_be_visible()
        page.get_by_role('button', name='Fermer les réglages').click()
        page.locator('#start-button').click()
        cue = page.locator('#speaker-turn-cue')
        expect(cue).to_contain_text('À TOI DE PARLER !')
        first = page.locator('#speaker-name').inner_text()
        assert first in ['Alice <safe>', 'Bob', 'Charlie']
        chosen = next(person['mood'] for person in team['roster'] if person['name'] == first)
        expect(page.locator('#timer-ring [data-mood-picture] img')).to_have_attribute('src', PICTURES[chosen - 1])
        expect(page.locator('#timer-ring #speaker-name')).to_have_text(first)
        expect(page.locator('#timer-ring [data-mood-picture] span')).to_have_count(0)
        assert page.locator('#timer-display').evaluate('el => getComputedStyle(el).textShadow') != 'none'
        assert page.locator('#timer-display').evaluate('el => getComputedStyle(el.parentElement).backgroundColor') == 'rgba(0, 0, 0, 0)'
        note = page.locator('[data-speaker-hint]')
        expect(note.locator('strong')).to_have_text('Avancement')
        expect(note.locator('em')).to_have_text('Tests')
        expect(note.locator('del')).to_have_text('Ancien')
        expect(note.locator('ul')).to_have_count(1)
        expect(note.locator('ol')).to_have_count(1)
        expect(note.locator('script, img, a, iframe, input')).to_have_count(0)
        assert note.locator('ul').evaluate("el => getComputedStyle(el).listStyleType") == 'disc'
        assert note.locator('ol').evaluate("el => getComputedStyle(el).listStyleType") == 'decimal'
        expect(page.locator('.timer-panel [data-speaker-hint]')).to_have_count(0)
        expect(page.locator('[data-speaker-sidebar]')).to_contain_text(first)
        expect(page.locator('[data-speaker-sidebar] #prompts-title')).to_have_count(0)
        page.get_by_role('button', name=f'Lire la note de {first}', exact=True).click()
        note_dialog = page.get_by_role('dialog', name=f'Le pense-bête de {first}', exact=True)
        expect(note_dialog).to_be_visible()
        expect(note_dialog.locator('strong')).to_have_text('Avancement')
        expect(note_dialog.locator('em')).to_have_text('Tests')
        expect(note_dialog.locator('del')).to_have_text('Ancien')
        expect(note_dialog.locator('script, textarea, input, img, a, iframe')).to_have_count(0)
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
            expect(page.locator('#upcoming-speaker')).to_be_visible()
            for selector in ['#speaker-name', '#timer-display']:
                text = page.locator(selector).bounding_box()
                assert text and text['x'] >= ring['x'] and text['x'] + text['width'] <= ring['x'] + ring['width'] + 1, (width, selector, text, ring)
                assert text['y'] >= ring['y'] and text['y'] + text['height'] <= ring['y'] + ring['height'] + 1, (width, selector, text, ring)
            for selector in ['#previous-button', '#start-button', '#next-button', '#manage-timer-button']:
                button = page.locator(selector).bounding_box()
                assert button and button['height'] >= 44 and button['y'] + button['height'] <= height + 1, (motion, width, selector, button)
                assert button['x'] >= 0 and button['x'] + button['width'] <= width + 1, (motion, width, selector, button)
            if width <= 800:
                page.get_by_role('button', name='Pense-bête', exact=True).click()
                expect(page.locator('[data-speaker-sidebar]')).to_be_visible()
                expect(page.locator('[data-speaker-hint] strong')).to_have_text('Avancement')
                expect(page.get_by_role('button', name='Revenir au minuteur', exact=True)).to_be_visible()
                page.get_by_role('button', name='Revenir au minuteur', exact=True).click()
                expect(page.locator('#start-button')).to_contain_text('Pause')
            if motion == 'reduce' and width in [320, 1366]:
                page.screenshot(path=os.path.join(os.environ.get('TEMP', '.'), f'scrum-timer-focus-{width}.png'))

        # Exiting desktop fullscreen pauses the timer before the entry gate blocks it.
        page.evaluate('document.exitFullscreen()')
        gate = page.get_by_role('dialog', name='Place à votre équipe', exact=True)
        expect(gate).to_be_visible()
        expect(cue).to_contain_text('TON TOUR EST EN PAUSE')
        gate.get_by_role('button', name='Entrer en plein écran', exact=True).click()
        expect(gate).not_to_be_visible()
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
        chosen = next(person['mood'] for person in team['roster'] if person['name'] == next_name)
        expect(page.locator('#timer-ring [data-mood-picture] img')).to_have_attribute('src', PICTURES[chosen - 1])
        expect(page.locator('[data-speaker-hint] strong')).to_have_text('Avancement')
        expect(cue).to_contain_text('À TOI DE PARLER !')
        expect(page.locator('#start-button')).to_contain_text('Pause')
        expect(page.locator('#previous-button')).to_be_enabled()
        saved = page.evaluate("JSON.parse(sessionStorage.getItem('standup.timer.tab.v1:' + 'a'.repeat(64))).timer")
        first_metrics = next(person for person in saved['people'] if person['name'] == first)
        page.locator('#previous-button').click()
        expect(page.locator('#speaker-name')).to_have_text(first)
        expect(page.locator('#previous-button')).to_be_disabled()
        expect(page.locator('#start-button')).to_contain_text('Démarrer')
        expect(page.locator('#timer-display')).to_have_text('02:00')
        returned = page.evaluate("JSON.parse(sessionStorage.getItem('standup.timer.tab.v1:' + 'a'.repeat(64))).timer")
        assert returned['running'] is False
        assert next(person for person in returned['people'] if person['name'] == first) == {**first_metrics, 'done': False}
        assert next(person for person in returned['people'] if person['name'] == next_name)['done'] is False
        page.locator('#start-button').click()
        page.locator('#next-button').click()
        expect(page.locator('#speaker-name')).to_have_text(next_name)
        page.locator('#start-button').click()
        expect(page.locator('#start-button')).to_contain_text('Reprendre')
        page.locator('#previous-button').click()
        expect(page.locator('#speaker-name')).to_have_text(first)
        expect(page.locator('#start-button')).to_contain_text('Démarrer')
        page.locator('#next-button').click()
        expect(page.locator('#speaker-name')).to_have_text(next_name)
        expect(page.locator('#start-button')).to_contain_text('Pause')
        # Next speaker without a note restores questions, with slide-only motion.
        hints.clear()
        page.set_viewport_size({'width': 1366, 'height': 768})
        page.locator('#next-button').click()
        expect(page.locator('[data-speaker-sidebar] #prompts-title')).to_be_visible()
        expect(page.locator('[data-speaker-sidebar]')).to_contain_text('Qu’avez-vous fait hier ?')
        expect(page.locator('[data-speaker-sidebar] [data-speaker-hint]')).to_have_count(0)

        current = page.locator('#speaker-name').inner_text()
        page.evaluate("""() => {
            const original = Date.now;
            Date.now = () => original() + 130000;
            document.dispatchEvent(new Event('visibilitychange'));
            Date.now = original;
        }""")
        expect(cue).to_contain_text('Merci de passer la parole')
        expect(page.locator('#speaker-name')).to_have_text(current)
        context.route(f'**{SLIDE_ROOT}/first.svg', lambda route: route.fulfill(status=502, json={'error': 'SVG unavailable'}))
        with page.expect_response(f'**{SLIDE_ROOT}/first.svg') as failed_image:
            page.reload()
        assert failed_image.value.status == 502
        expect(page.locator('#speaker-name')).to_have_text(current)
        expect(page.locator('#timer-ring [data-mood-picture]')).to_have_count(0)
        expect(page.locator('#timer-ring #speaker-name')).to_have_text(current)
        expect(page.locator('#timer-display')).to_be_visible()
        assert not errors, errors
        assert not external_notes, external_notes
        bootstrap.assert_no_unexpected_api()
        context.close()
    browser.close()
    print('PASS: page/brand motion and reduced-motion opt-out, speaking banner, start/pause/resume/handoff/expiry, read-only speaker notes without pausing, safe names, master workflow at six sizes; mocked Neon only')