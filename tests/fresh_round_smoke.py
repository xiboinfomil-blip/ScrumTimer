"""Reset/re-entry/checkpoint invalidation; all API traffic isolated from Neon."""
import os
import tempfile
from datetime import date, timedelta
from pathlib import Path

from playwright.sync_api import expect, sync_playwright
from browser_bootstrap import install_browser_bootstrap
from contrast_helpers import assert_contrast
from postponement_smoke import WorkspaceMock, saved

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3001').rstrip('/')


def run_archive_reconciliation(browser, width, height, failure):
    context = browser.new_context(viewport={'width': width, 'height': height},
                                  reduced_motion='reduce', service_workers='block')
    bootstrap = install_browser_bootstrap(context)
    db = WorkspaceMock()
    for person in db.team['roster']:
        person['mood'] = 2
    db.team['session'] = [person['id'] for person in db.team['roster']]
    context.route('**/api/**', db.api)
    posts, reads, pending, refreshes = [], [], [], []
    winner = None

    def team(route):
        if route.request.method == 'GET' and posts and failure.startswith('midnight'):
            assert route.request.headers.get('x-team-refresh') == '1'
            refreshes.append(route.request)
        route.fallback()

    def history(route):
        if route.request.method == 'POST':
            posts.append(route.request.post_data_json)
            assert len(posts) == 1, 'Reconciliation must not resubmit the archive'
            if failure == 'midnight-saved':
                db.day = (date.fromisoformat(db.day) + timedelta(days=1)).isoformat()
                route.fulfill(json={'saved': True, 'day': db.day})
            else:
                route.fulfill(status=409, json={'error': 'Already completed elsewhere'})
        elif not posts:
            route.fulfill(json={'rounds': [], 'day': db.day})
        else:
            assert route.request.headers.get('x-team-refresh') == '1'
            reads.append(route.request)
            if failure.startswith('midnight') and len(reads) > 2:
                route.fulfill(json={'rounds': [] if failure == 'midnight-empty' else [winner], 'day': db.day})
            elif len(reads) == 1:
                if failure == 'empty':
                    route.fulfill(json={'rounds': [], 'day': db.day})
                else:
                    route.fulfill(status=503, json={'error': 'Temporarily unavailable'})
            else:
                pending.append(route)

    context.route('**/api/history', history)
    context.route('**/api/team', team)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    key = 'standup.timer.tab.v1:' + 'a' * 64
    try:
        page.goto(BASE + '/timer')
        saved(page)
        expect(page.locator('#start-button')).to_be_visible()
        page.locator('#main-content').focus()
        page.keyboard.press('n')
        page.keyboard.press('n')
        expect(page.locator('#timer-page[data-mode="results"]')).to_be_visible()
        expect(page.get_by_text('Donn\u00e9es Neon indisponibles ou conflit de sauvegarde.', exact=False)).to_be_visible()
        assert page.evaluate('(key) => sessionStorage.getItem(key) !== null', key)
        page.wait_for_timeout(1200)
        assert pending, 'A failed reconciliation must retry automatically'
        assert len(posts) == 1 and len(reads) == 2
        assert page.evaluate('(key) => sessionStorage.getItem(key) !== null', key)
        winner = {**posts[0], 'id': 'remote-winner', 'people': [
            {**person, 'speakingSeconds': 80, 'budgetSeconds': 120, 'score': 750}
            for person in posts[0]['people']]}
        if failure.startswith('midnight'):
            if failure != 'midnight-saved':
                db.day = (date.fromisoformat(db.day) + timedelta(days=1)).isoformat()
            db.team['session'] = []
            for person in db.team['roster']:
                person['mood'] = None
                person['moodUpdatedAt'] = None
        pending[0].fulfill(json={'rounds': [] if failure == 'midnight-empty' else [winner], 'day': db.day})
        saved(page)
        page.wait_for_function('(key) => sessionStorage.getItem(key) === null', arg=key)
        expect(page.locator('#timer-page[data-mode="results"]')).to_have_count(0)
        if failure.startswith('midnight'):
            expect(page.locator('.daily-score-list')).to_have_count(0)
            assert refreshes and len(reads) == 3
        else:
            if width < 1024:
                page.get_by_role('button', name='Classement', exact=True).click()
            expect(page.locator('.daily-score-list')).to_be_visible()
        assert len(posts) == 1
        bootstrap.assert_no_unexpected_api()
        assert not db.unexpected and not errors, (db.unexpected, errors)
        print(f'PASS archive reconciliation {failure} {width}x{height}: fresh read retry, one POST, checkpoint retained until winner')
    finally:
        context.close()


def show_votes(page, width):
    if width < 801:
        page.get_by_role('button', name='Humeurs de l’équipe', exact=True).click()


def show_bob(page):
    if page.locator('.checkin-person').filter(has_text='Bob').count() == 0:
        page.get_by_role('button', name='Page suivante', exact=True).click()


def move_bob(page, width, present):
    if width < 650:
        group = page.get_by_role('group', name='Afficher les présences', exact=True)
        group.get_by_role('button', name='Présents' if present else 'Absents', exact=False).click()
    section = page.locator('#attendance-present' if present else '#attendance-absent')
    page.locator('#attendance-search').fill('Bob')
    section.locator('.checkin-person').filter(has_text='Bob').locator('.attendance-button').click()
    saved(page)


def run_warning_change(browser, width, height):
    context = browser.new_context(viewport={'width': width, 'height': height},
                                  reduced_motion='reduce', service_workers='block')
    bootstrap = install_browser_bootstrap(context)
    context.add_init_script('window.__timerNow = Date.now(); Date.now = () => window.__timerNow;')
    db = WorkspaceMock()
    db.team['warning'] = 30
    for person in db.team['roster']:
        person['mood'] = 2
    db.team['session'] = [person['id'] for person in db.team['roster']]
    db.daily = db.meter.copy()
    context.route('**/api/**', db.api)
    context.route('**/mood-meters/catalog.json', lambda route: route.fulfill(json={'remote': True}))
    page = context.new_page()
    key = 'standup.timer.tab.v1:' + 'a' * 64

    def state():
        return page.evaluate('(key) => JSON.parse(sessionStorage.getItem(key)).timer', key)

    try:
        page.goto(BASE + '/timer')
        saved(page)
        page.locator('#start-button').click()
        page.evaluate('window.__timerNow += 95000; document.dispatchEvent(new Event("visibilitychange"));')
        expect(page.locator('#timer-display')).to_have_text('00:25')
        assert state()['warned']
        notification = page.locator('[data-notification]')
        expect(notification).to_contain_text('Il reste 25 secondes')
        assert_contrast(page, f'warning-notification-{width}', '[data-notification]')
        page.locator('#next-button').click()
        assert state()['people'][0]['turn']['warned']
        page.locator('#manage-timer-button').click()
        settings = page.get_by_role('dialog', name='Modifier le minuteur', exact=True)
        settings.locator('#warning-seconds').select_option('10')
        settings.get_by_role('button', name='Fermer les réglages', exact=True).click()
        expect(settings).not_to_be_visible()
        assert not state()['people'][0]['turn']['warned']
        page.locator('#previous-button').click()
        assert state()['remaining'] == 25 and not state()['warned']
        page.locator('#start-button').click()
        page.evaluate('window.__timerNow += 16000; document.dispatchEvent(new Event("visibilitychange"));')
        expect(page.locator('#timer-display')).to_have_text('00:09')
        assert state()['warned']
        expect(notification).to_contain_text('Il reste 9 secondes')
        assert_contrast(page, f'changed-warning-notification-{width}', '[data-notification]')
        bootstrap.assert_no_unexpected_api()
        assert not db.unexpected, db.unexpected
        print(f'PASS warning change {width}x{height}: saved turn re-armed, 25s preserved, warning contrast')
    finally:
        context.close()


def run_timer_safety(browser, width, height):
    context = browser.new_context(viewport={'width': width, 'height': height},
                                  reduced_motion='reduce', service_workers='block')
    bootstrap = install_browser_bootstrap(context)
    db = WorkspaceMock()
    for person in db.team['roster']:
        person['mood'] = 2
    db.team['session'] = [person['id'] for person in db.team['roster']]
    context.route('**/api/**', db.api)
    context.route('**/mood-meters/catalog.json', lambda route: route.fulfill(json={'remote': True}))
    pending = []
    context.route('**/api/history', lambda route: pending.append(route)
                  if route.request.method == 'POST' else route.fallback())
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    key = 'standup.timer.tab.v1:' + 'a' * 64

    def timer_state():
        return page.evaluate('(key) => JSON.parse(sessionStorage.getItem(key)).timer', key)

    try:
        page.goto(BASE + '/timer')
        saved(page)
        expect(page.locator('#start-button')).to_be_visible()
        expect(page.locator('[aria-labelledby="lineup-dialog-title"]')).not_to_be_visible()
        page.locator('#start-button').focus()
        page.keyboard.press('n')
        assert timer_state()['activeId'] == 'alice'
        page.locator('#manage-timer-button').click()
        settings = page.get_by_role('dialog', name='Modifier le minuteur', exact=True)
        expect(settings.get_by_text('En attente', exact=True)).to_have_count(0)
        expect(settings.get_by_text('En pause', exact=True)).to_be_visible()
        expect(settings.get_by_role('button', name='Termin\u00e9', exact=True)).to_be_in_viewport()
        settings.locator('#duration-minutes').fill('3')
        settings.locator('#duration-seconds').fill('15')
        settings.locator('#apply-duration').click()
        assert timer_state()['remaining'] == 195
        settings.locator('#warning-seconds').select_option('15')
        settings.locator('#add-time-button').click()
        assert timer_state()['remaining'] == 225 and not timer_state()['running']
        settings.locator('#duration-minutes').fill('2')
        settings.locator('#duration-seconds').fill('0')
        settings.locator('#apply-duration').click()
        settings.locator('#duration-minutes').scroll_into_view_if_needed()
        page.screenshot(path=os.path.join(os.environ.get('TEMP', '.'), f'scrum-timer-settings-{width}.png'))
        assert settings.evaluate('element => element.scrollWidth <= element.clientWidth')
        page.locator('#add-time-button').click()
        page.get_by_role('button', name='Fermer les r\u00e9glages', exact=True).click()
        expect(page.get_by_role('dialog', name='Modifier le minuteur', exact=True)).not_to_be_visible()
        assert timer_state()['remaining'] == 150
        page.locator('#main-content').focus()
        page.keyboard.press('r')
        assert timer_state()['remaining'] == 120
        page.keyboard.press('Space')
        expect(page.locator('#start-button')).to_contain_text('Pause')
        assert timer_state()['running']
        page.keyboard.press('Space')
        saver = page.get_by_role('dialog', name='\u00c9conomiseur d\u2019\u00e9cran', exact=True)
        expect(saver).to_be_visible()
        before = timer_state()
        saver.focus()
        page.keyboard.press('n')
        assert timer_state() == before
        saver.get_by_role('button', name='Revenir au minuteur', exact=True).click()
        expect(saver).not_to_be_visible()
        page.locator('#main-content').focus()
        page.keyboard.press('n')
        assert timer_state()['activeId'] == 'bob'
        assert timer_state()['running']
        page.keyboard.press('n')
        expect(page.locator('#timer-page[data-mode="results"]')).to_be_visible()
        expect(page.locator('#new-round-button')).to_have_count(0)
        assert len(pending) == 1
        checkpoint = page.evaluate('(key) => sessionStorage.getItem(key)', key)
        assert checkpoint
        page.get_by_role('link', name='Participants', exact=True).click()
        expect(page.locator('#participants-page')).to_be_visible()
        page.get_by_role('button', name='D\u00e9placer Alice vers les absents', exact=True).click()
        expect(page.locator('#attendance-present .attendance-button')).to_have_count(2)
        assert page.evaluate('(key) => sessionStorage.getItem(key)', key) == checkpoint
        pending[0].fulfill(json={'saved': True})
        page.wait_for_function('(key) => sessionStorage.getItem(key) === null', arg=key)
        assert len(pending) == 1
        bootstrap.assert_no_unexpected_api()
        assert not db.unexpected and not errors, (db.unexpected, errors)
        print(f'PASS timer safety {width}x{height}: shortcuts, visible dialog isolation, delayed archive protection')
    finally:
        context.close()


def run_speaker_navigation(browser, width, height, motion='reduce'):
    context = browser.new_context(viewport={'width': width, 'height': height},
                                  reduced_motion=motion, service_workers='block')
    bootstrap = install_browser_bootstrap(context)
    context.add_init_script('window.__timerNow = Date.now(); Date.now = () => window.__timerNow;')
    db = WorkspaceMock()
    db.team['roster'].append({**db.team['roster'][0], 'id': 'carol', 'name': 'Carol'})
    for person in db.team['roster']:
        person['mood'] = 2
    db.team['session'] = [person['id'] for person in db.team['roster']]
    db.daily = db.meter.copy()
    context.route('**/api/**', db.api)
    context.route('**/mood-meters/catalog.json', lambda route: route.fulfill(json={'remote': True}))
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    key = 'standup.timer.tab.v1:' + 'a' * 64

    def state():
        return page.evaluate('(key) => JSON.parse(sessionStorage.getItem(key)).timer', key)

    def advance(seconds):
        page.evaluate('seconds => { window.__timerNow += seconds * 1000; document.dispatchEvent(new Event("visibilitychange")); }', seconds)
        page.wait_for_function('key => { const timer = JSON.parse(sessionStorage.getItem(key)).timer; return timer.running && Math.abs(timer.remaining - (timer.deadline - Date.now()) / 1000) < .001; }', arg=key)

    try:
        page.goto(BASE + '/timer')
        saved(page)
        expect(page.locator('#start-button')).to_be_visible()
        page.locator('#start-button').click()
        advance(17)
        assert state()['remaining'] == 103
        postpone_next = page.get_by_role('button', name='Reporter le prochain passage de Bob', exact=True)
        expect(postpone_next).to_contain_text('Prochain passage')
        expect(postpone_next).to_contain_text('Reporter Bob')
        postpone_next.click()
        expect(page.locator('#speaker-name')).to_have_text('Alice')
        expect(page.locator('#upcoming-speaker')).to_have_text('Carol')
        assert state()['remaining'] == 103 and state()['running']
        assert state()['people'][1]['postponed'] and not state()['people'][1]['done']
        page.wait_for_function("document.querySelector('[data-postpone-next]').getAnimations().every(animation => animation.playState !== 'running')")
        queue = page.get_by_role('group', name='Gestion de la file d’attente', exact=True)
        queue_box = queue.bounding_box()
        controls = page.locator('[data-timer-controls]').bounding_box()
        assert queue_box['y'] >= controls['y'] + controls['height'] - 1
        assert queue_box['y'] + queue_box['height'] <= height
        assert queue.get_by_role('button', name='En attente', exact=True).bounding_box()['height'] >= 44
        assert queue.get_by_role('button', name='Reporter le prochain passage de Carol', exact=True).bounding_box()['height'] >= 44
        assert page.locator('[data-speaker-navigation] [data-postpone-next]').count() == 0
        expect(page.locator('[data-testid="stopwatch-timer"]')).to_have_css('transform', 'none')
        assert page.locator('[data-testid="stopwatch-timer"]').bounding_box()['height'] >= 90
        if motion == 'reduce':
            page.screenshot(path=str(Path(tempfile.gettempdir()) / f'scrum-queue-{width}.png'))
        advance(2)
        assert state()['remaining'] == 101
        expect(page.get_by_role('dialog', name='Économiseur d’écran', exact=True)).not_to_be_visible()
        page.get_by_role('button', name='En attente', exact=True).click()
        waiting = page.get_by_role('dialog', name='Un instant pour votre humeur', exact=True)
        waiting.get_by_role('button', name='Faire rejoindre Bob', exact=True).click()
        saved(page)
        waiting.get_by_role('button', name='Revenir au tour', exact=True).click()
        expect(waiting).not_to_be_visible()
        expect(page.locator('#upcoming-speaker')).to_have_text('Bob')
        assert state()['remaining'] == 101 and not state()['running']
        page.locator('#start-button').click()
        page.locator('#next-button').click()
        advance(9)
        assert state()['remaining'] == 111, state()
        page.locator('#previous-button').click()
        expect(page.locator('#speaker-name')).to_have_text('Alice')
        assert state()['remaining'] == 101 and state()['running']
        assert state()['people'][0]['attempts'] == 1
        page.locator('#next-button').click()
        assert state()['remaining'] == 111 and state()['running']
        assert state()['people'][1]['attempts'] == 1
        page.locator('#previous-button').click()
        header = page.locator('[data-active-speaker]')
        report = header.get_by_role('button', name='Reporter le passage de Alice', exact=True)
        expect(report).to_contain_text('Reporter ce passage')
        navigation = page.locator('[data-speaker-navigation]').bounding_box()
        current = page.locator('#speaker-name').bounding_box()
        panel = page.locator('.timer-panel').bounding_box()
        assert header.bounding_box()['y'] >= navigation['y'] + navigation['height'] - 1
        assert abs(current['x'] + current['width'] / 2 - panel['x'] - panel['width'] / 2) <= 2
        assert page.locator('#speaker-name').evaluate('el=>parseFloat(getComputedStyle(el).fontSize)') > page.locator('#upcoming-speaker').evaluate('el=>parseFloat(getComputedStyle(el).fontSize)')
        assert header.bounding_box()['y'] < page.locator('#timer-stage').bounding_box()['y']
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        expect(page.locator('[data-testid="stopwatch-timer"]')).to_have_css('transform', 'none')
        assert page.locator('[data-testid="stopwatch-timer"]').bounding_box()['height'] >= 90
        if motion == 'reduce':
            page.screenshot(path=str(Path(tempfile.gettempdir()) / f'scrum-timer-dock-{width}.png'))
        report.click()
        expect(page.locator('#speaker-name')).to_have_text('Bob')
        assert state()['remaining'] == 111 and not state()['running']
        expect(page.get_by_role('dialog', name='Économiseur d’écran', exact=True)).not_to_be_visible()
        page.locator('#start-button').click()
        page.get_by_role('button', name='Reporter le passage de Bob', exact=True).click()
        expect(page.locator('#speaker-name')).to_have_text('Carol')
        expect(page.locator('[data-postpone-next]')).to_have_count(0)
        expect(page.get_by_role('dialog', name='Économiseur d’écran', exact=True)).not_to_be_visible()
        page.evaluate('''() => {
          window.__routeFrames = [];
          function sample() {
            const root = document.querySelector('[data-route-transition]');
            if (root) window.__routeFrames.push(Number(getComputedStyle(root).opacity));
            if (window.__routeFrames.length < 60) requestAnimationFrame(sample);
          }
          requestAnimationFrame(sample);
        }''')
        page.get_by_role('link', name='Participants', exact=True).click()
        expect(page.locator('#participants-page')).to_be_visible()
        page.wait_for_timeout(700)
        frames = page.evaluate('window.__routeFrames')
        if motion == 'no-preference':
            assert any(value < .95 for value in frames), frames
        else:
            assert all(value == 1 for value in frames), frames
        bootstrap.assert_no_unexpected_api()
        assert not db.unexpected and not errors, (db.unexpected, errors)
        print(f'PASS speaker navigation {width}x{height} {motion}: exact countdowns, centered speaker, next-person report without interruption, route motion')
    finally:
        context.close()


def run_note_handoff(browser, width, height):
    context = browser.new_context(viewport={'width': width, 'height': height},
                                  reduced_motion='reduce', service_workers='block')
    bootstrap = install_browser_bootstrap(context)
    db = WorkspaceMock()
    db.team['roster'].append({**db.team['roster'][0], 'id': 'carol', 'name': 'Carol'})
    for person in db.team['roster']:
        person['mood'] = 2
    db.team['session'] = [person['id'] for person in db.team['roster']]
    context.route('**/api/**', db.api)
    context.route('**/mood-meters/catalog.json', lambda route: route.fulfill(json={'remote': True}))
    pending = []
    held = False
    refreshed = False
    unsafe_requests = []
    context.route('https://evil.invalid/**', lambda route: (unsafe_requests.append(route.request.url), route.abort()))
    markdown = '**Avancement**\n\n- API terminée\n- *Tests* en cours\n\n1. ~~Ancien~~\n2. Suite\n\n<script>alert(1)</script>\n\n![image](https://evil.invalid/note-image)\n\n[Lien](https://evil.invalid/note-link)'

    def hints(route):
        if held:
            pending.append(route)
        else:
            route.fulfill(json={'day': db.day, 'hints': [
                {'participantId': 'carol', 'hint': 'Updated during handoff', 'revision': 1}
            ] if refreshed else [{'participantId': 'alice', 'hint': markdown, 'revision': 1}]})

    context.route('**/api/daily-hints', hints)
    page = context.new_page()
    try:
        page.goto(BASE + '/timer')
        saved(page)
        expect(page.locator('#start-button')).to_be_visible()
        page.locator('#start-button').click()
        page.get_by_role('button', name='Lire la note de Alice', exact=True).click()
        note = page.get_by_role('dialog', name='Le pense-bête de Alice', exact=True)
        expect(note.locator('strong')).to_have_text('Avancement')
        expect(note.locator('em')).to_have_text('Tests')
        expect(note.locator('del')).to_have_text('Ancien')
        expect(note.locator('script, textarea, input, img, a, iframe')).to_have_count(0)
        before = page.locator('#timer-display').inner_text()
        expect(page.locator('#start-button')).to_contain_text('Pause')
        expect(page.locator('#timer-display')).not_to_have_text(before)
        note.get_by_role('button', name='Fermer', exact=True).click()
        expect(note).not_to_be_visible()
        expect(page.locator('#start-button')).to_contain_text('Pause')
        held = True
        page.locator('#next-button').click()
        expect(page.locator('#speaker-name')).to_have_text('Bob')
        page.wait_for_function("document.querySelector('#speaker-name')?.textContent === 'Bob'")
        assert pending, 'Speaker handoff must refresh notes'
        page.locator('#next-button').click()
        expect(page.locator('#speaker-name')).to_have_text('Carol')
        held = False
        refreshed = True
        for route in pending:
            route.fulfill(json={'day': db.day, 'hints': []})
        if width < 1100:
            page.get_by_role('button', name='Pense-bête & humeur', exact=True).click()
        expect(page.locator('.notes-rail')).to_contain_text('Updated during handoff')
        bootstrap.assert_no_unexpected_api()
        assert not db.unexpected and not unsafe_requests, (db.unexpected, unsafe_requests)
        print(f'PASS note Markdown safety, running countdown and in-flight handoff {width}x{height}')
    finally:
        context.close()


def run_case(browser, width, height, case):
    context = browser.new_context(viewport={'width': width, 'height': height},
                                  reduced_motion='reduce', service_workers='block')
    bootstrap = install_browser_bootstrap(context)
    db = WorkspaceMock()
    context.route('**/api/**', db.api)
    context.route('**/mood-meters/catalog.json', lambda r: r.fulfill(json={'remote': True}))
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    try:
        page.goto(BASE + '/mood')
        saved(page)
        show_votes(page, width)
        page.get_by_role('button', name='Humeur 2 pour Alice', exact=True).click()
        show_bob(page)
        page.get_by_role('button', name='Reporter l’humeur et le passage de Bob', exact=True).click()
        saved(page)
        page.get_by_role('button', name='Continuer vers le minuteur', exact=False).click()
        page.locator('#start-button').click()
        expect(page.locator('#start-button')).to_contain_text('Pause')
        page.locator('#start-button').click()
        page.wait_for_function("Object.keys(sessionStorage).some(k => k.startsWith('standup.timer.tab.v1:'))")
        saver = page.get_by_role('dialog', name='\u00c9conomiseur d\u2019\u00e9cran', exact=True)
        expect(saver).to_be_visible()
        saver.get_by_role('button', name='Revenir au minuteur', exact=True).click()
        expect(saver).not_to_be_visible()
        page.get_by_role('link', name='Participants', exact=True).click()
        expect(page.locator('#participants-page')).to_be_visible()
        if case == 'reset':
            page.get_by_role('button', name='Réglages et outils', exact=True).click()
            page.get_by_role('menuitem', name='Nouveau bilan', exact=True).click()
            modal = page.get_by_role('dialog', name='Commencer un nouveau bilan ?', exact=True)
            modal.get_by_role('button', name='Annuler', exact=True).click()
            assert page.evaluate("Object.keys(sessionStorage).some(k => k.startsWith('standup.timer.tab.v1:'))")
            page.get_by_role('button', name='Réglages et outils', exact=True).click()
            page.get_by_role('menuitem', name='Nouveau bilan', exact=True).click()
            modal.get_by_role('button', name='Recommencer', exact=True).click()
            saved(page)
            assert all(p['present'] and p['mood'] is None for p in db.team['roster'])
        else:
            move_bob(page, width, True)
            # Immediate removal is essential: reverting to the original durable
            # roster must not resurrect the old, otherwise context-valid timer.
            assert not page.evaluate("Object.keys(sessionStorage).some(k => k.startsWith('standup.timer.tab.v1:'))")
            move_bob(page, width, False)
            page.locator('#attendance-search').fill('')
        assert not db.team.get('postponed'), db.team
        assert not page.evaluate("Object.keys(sessionStorage).some(k => k.startsWith('standup.timer.tab.v1:'))")
        if case == 'checkpoint':
            page.reload()
            saved(page)
            assert not page.evaluate("Object.keys(sessionStorage).some(k => k.startsWith('standup.timer.tab.v1:'))")
        page.get_by_role('link', name='Humeurs', exact=True).click()
        show_votes(page, width)
        if case == 'reset':
            page.get_by_role('button', name='Humeur 2 pour Alice', exact=True).click()
        show_bob(page)
        bob = page.locator('.checkin-person').filter(has_text='Bob')
        expect(bob.get_by_role('button', name='Reporter l’humeur et le passage de Bob', exact=True)).to_have_attribute('aria-pressed', 'false')
        expect(page.get_by_role('button', name='Continuer vers le minuteur', exact=False)).to_be_disabled()
        bootstrap.assert_no_unexpected_api()
        assert not db.unexpected and not errors, (db.unexpected, errors)
        assert not db.history_posts
        print(f'PASS fresh-round {case} {width}x{height}: no inherited wait or timer recovery')
    finally:
        context.close()


def run_timer_design(browser, width, height, motion, long_names=False):
    context = browser.new_context(viewport={'width': width, 'height': height},
                                  reduced_motion=motion, service_workers='block')
    bootstrap = install_browser_bootstrap(context)
    context.add_init_script('window.__timerNow = Date.now(); Date.now = () => window.__timerNow;')
    db = WorkspaceMock()
    db.team['warning'] = 30
    for person in db.team['roster']:
        person['mood'] = 2
        if long_names:
            person['name'] = person['name'] + 'W' * (60 - len(person['name']))
    db.team['session'] = [person['id'] for person in db.team['roster']]
    db.daily = db.meter.copy()
    context.route('**/api/**', db.api)
    context.route('**/api/meeting-settings', lambda route: route.fulfill(json={'prompts': ['Votre avancement du jour ?'], 'revision': 1}))
    context.route('**/mood-meters/catalog.json', lambda route: route.fulfill(json={'remote': True}))
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' and 'hydration' in message.text.lower() else None)
    label = f'timer-{width}-{height}-{motion}-{"long" if long_names else "normal"}'

    def check_layout(state):
        expect(page.locator('[data-testid="stopwatch-timer"]')).to_have_css('transform', 'none')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), label
        dial = page.locator('[data-timer-dial]')
        dial.scroll_into_view_if_needed()
        assert dial.bounding_box()['height'] >= 90, (label, state, dial.bounding_box())
        assert dial.locator('line').count() == 60
        assert dial.locator('[data-timer-track], [data-timer-progress]').count() == 2
        assert page.locator('#timer-display').evaluate('el => { const dial = el.closest("#timer-stage").querySelector("[data-timer-dial]").getBoundingClientRect(); const text = el.getBoundingClientRect(); return text.left >= dial.left && text.right <= dial.right && text.top >= dial.top && text.bottom <= dial.bottom; }'), (label, state, 'countdown outside dial')
        assert page.locator('#timer-display').evaluate('el => { const face = el.closest("[data-stopwatch-readout]").getBoundingClientRect(); const text = el.getBoundingClientRect(); return text.left >= face.left - 1 && text.right <= face.right + 1 && text.top >= face.top - 1 && text.bottom <= face.bottom + 1; }'), (label, state, 'countdown overlaps progress arc')
        assert dial.locator('[data-stopwatch-crown]').count() == 1
        for control in page.locator('#next-button, #start-button, #manage-timer-button, [data-active-speaker] button, [data-queue-actions] button').all():
            control.scroll_into_view_if_needed()
            box = control.bounding_box()
            assert box['height'] >= 43.99 and box['x'] >= 0 and box['x'] + box['width'] <= width + 1, (label, state, box)
            assert box['y'] >= 0 and box['y'] + box['height'] <= height + 1, (label, state, box)
        assert page.locator('[data-active-speaker]').evaluate('el => { const name = el.querySelector("h2").getBoundingClientRect(); const action = el.querySelector("button").getBoundingClientRect(); return name.right <= action.left + 1; }'), (label, 'name overlaps report action')
        if motion == 'reduce' and not long_names and width in (320, 1366):
            assert_contrast(page, f'{label}-{state}', '.timer-panel')
        if motion == 'reduce' and width in (390, 568, 1366):
            page.screenshot(path=str(Path(tempfile.gettempdir()) / f'scrum-{label}-{state}.png'))

    try:
        page.goto(BASE + '/timer')
        saved(page)
        expect(page.locator('#timer-display')).to_have_text('02:00')
        check_layout('ready')
        page.locator('#start-button').click()
        expect(page.locator('#start-button')).to_have_text('Pause')
        check_layout('running')
        page.locator('#timer-display').evaluate('el => { window.__timerDigits = el; }')
        indicator = page.locator('[data-stopwatch-indicator]')
        previous_rotation = indicator.get_attribute('style')
        for seconds, urgency, value in [(95, 'warning', '00:25'), (16, 'critical', '00:09'), (13, 'expired', '+00:04')]:
            page.evaluate('seconds => { window.__timerNow += seconds * 1000; document.dispatchEvent(new Event("visibilitychange")); }', seconds)
            expect(page.locator('.timer-panel')).to_have_attribute('data-urgency', urgency)
            expect(page.locator('#timer-display')).to_have_text(value)
            assert page.locator('#timer-display').evaluate('el => el === window.__timerDigits'), 'Digits must not remount on each tick'
            assert indicator.get_attribute('style') != previous_rotation, 'Stopwatch indicator must follow the countdown'
            previous_rotation = indicator.get_attribute('style')
            check_layout(urgency)
        page.locator('#start-button').click()
        saver = page.get_by_role('dialog', name='Économiseur d’écran', exact=True)
        expect(saver).to_be_visible()
        saver.get_by_role('button', name='Revenir au minuteur', exact=True).click()
        expect(saver).not_to_be_visible()
        expect(page.locator('#start-button')).to_have_text('Reprendre')
        check_layout('paused')
        bootstrap.assert_no_unexpected_api()
        assert not db.unexpected and not errors, (db.unexpected, errors)
        print(f'PASS {label}: dial, stable digits, 44px controls, ready/running/warning/critical/overtime/paused')
    finally:
        context.close()


if __name__ == '__main__':
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for width, height in ([] if os.environ.get('TIMER_DESIGN_ONLY') == '1' else [(320, 568), (1366, 768)]):
            for motion in ('reduce', 'no-preference'):
                run_speaker_navigation(browser, width, height, motion)
            for failure in ('empty', 'unavailable', 'midnight', 'midnight-saved', 'midnight-empty'):
                run_archive_reconciliation(browser, width, height, failure)
            run_note_handoff(browser, width, height)
            run_warning_change(browser, width, height)
            run_timer_safety(browser, width, height)
            if os.environ.get('TIMER_SAFETY_ONLY') != '1':
                for case in ['reset', 'attendance', 'checkpoint']:
                    run_case(browser, width, height, case)
        if os.environ.get('TIMER_SAFETY_ONLY') != '1':
            sizes = [(320, 568), (390, 844), (768, 1024), (1024, 576), (1366, 768), (1920, 1080), (568, 320), (844, 390)]
            for width, height, long_names in [(width, height, False) for width, height in sizes] + [(320, 568, True), (1366, 768, True)]:
                for motion in ('reduce', 'no-preference'):
                    run_timer_design(browser, width, height, motion, long_names)
        browser.close()