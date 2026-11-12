"""Reset/re-entry/checkpoint invalidation; all API traffic isolated from Neon."""
import os
import tempfile
from datetime import date, timedelta
from pathlib import Path

from playwright.sync_api import expect, sync_playwright
from browser_bootstrap import install_browser_bootstrap
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
        if route.request.method == 'GET' and posts and failure == 'midnight':
            assert route.request.headers.get('x-team-refresh') == '1'
            refreshes.append(route.request)
        route.fallback()

    def history(route):
        if route.request.method == 'POST':
            posts.append(route.request.post_data_json)
            assert len(posts) == 1, 'Reconciliation must not resubmit the archive'
            route.fulfill(status=409, json={'error': 'Already completed elsewhere'})
        elif not posts:
            route.fulfill(json={'rounds': [], 'day': db.day})
        else:
            assert route.request.headers.get('x-team-refresh') == '1'
            reads.append(route.request)
            if failure == 'midnight' and len(reads) > 2:
                route.fulfill(json={'rounds': [winner], 'day': db.day})
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
        if failure == 'midnight':
            db.day = (date.fromisoformat(db.day) + timedelta(days=1)).isoformat()
            db.team['session'] = []
            for person in db.team['roster']:
                person['mood'] = None
                person['moodUpdatedAt'] = None
        pending[0].fulfill(json={'rounds': [winner], 'day': db.day})
        saved(page)
        page.wait_for_function('(key) => sessionStorage.getItem(key) === null', arg=key)
        expect(page.locator('#timer-page[data-mode="results"]')).to_have_count(0)
        if failure == 'midnight':
            expect(page.locator('.daily-score-list')).to_have_count(0)
            assert refreshes and len(reads) == 3
        else:
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

    def hints(route):
        if held:
            pending.append(route)
        else:
            route.fulfill(json={'day': db.day, 'hints': [
                {'participantId': 'carol', 'hint': 'Updated during handoff', 'revision': 1}
            ] if refreshed else []})

    context.route('**/api/daily-hints', hints)
    page = context.new_page()
    try:
        page.goto(BASE + '/timer')
        saved(page)
        expect(page.locator('#start-button')).to_be_visible()
        page.locator('#start-button').click()
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
        assert not db.unexpected, db.unexpected
        print(f'PASS note refresh during in-flight handoff {width}x{height}')
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


if __name__ == '__main__':
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for width, height in [(320, 568), (1366, 768)]:
            for motion in ('reduce', 'no-preference'):
                run_speaker_navigation(browser, width, height, motion)
            for failure in ('empty', 'unavailable', 'midnight'):
                run_archive_reconciliation(browser, width, height, failure)
            run_note_handoff(browser, width, height)
            run_timer_safety(browser, width, height)
            if os.environ.get('TIMER_SAFETY_ONLY') != '1':
                for case in ['reset', 'attendance', 'checkpoint']:
                    run_case(browser, width, height, case)
        browser.close()