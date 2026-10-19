"""Meeting features on the development preview; ALL APIs are mocked, fail closed.

Run: python tests/meeting_features_smoke.py
Optional BROWSER_TEST_URL overrides the default http://localhost:3001.
No application source, browser persistence, or live database is modified.
"""
import os
import re
import time
import traceback
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright
from fullscreen_helpers import emulate_fullscreen

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3001').rstrip('/')
TEAM_ID = 'a' * 64
NAMES = ['Alice <safe>', 'Bob & safe']
SNAPSHOT_KEYS = {'speaker', 'nextSpeaker', 'teamName', 'running', 'remaining',
                 'deadline', 'completed', 'total'}
FAILURES = []
OBSERVATIONS = []


class MockMeeting:
    def __init__(self):
        now = datetime.now(timezone.utc)
        self.day = (now + timedelta(hours=4)).date().isoformat()
        self.team = {
            'roster': [dict(id=pid, name=name, present=True, mood=mood,
                            moodUpdatedAt=now.isoformat(), moodSlide=None)
                       for pid, name, mood in [('alice', NAMES[0], 1), ('bob', NAMES[1], 4)]],
            'session': [], 'duration': 120, 'warning': 20, 'sound': False,
            'usedMoodMeters': [], 'currentMoodSlide': None,
        }
        self.revision = 1
        self.meter = None
        self.rounds = []
        self.settings = {'prompts': ['Question partagée A ?', 'Question partagée B ?'], 'revision': 3}
        self.settings_failure = None
        self.live = None
        self.live_mode = 'ok'
        self.feedback = {}
        self.calls = []
        self.unexpected = []
        self.errors = []
        self.contexts = []

    def api(self, route):
        req = route.request
        path = urlparse(req.url).path
        method = req.method
        body = req.post_data_json if method in ('PUT', 'POST', 'DELETE') else None
        self.calls.append((method, path, deepcopy(body)))
        try:
            if path not in ('/api/teams', '/api/mood-meters/catalog'):
                assert req.headers.get('x-team-id') == TEAM_ID, (method, path, 'missing team context')
            if path == '/api/teams' and method == 'GET':
                payload = {'teams': [{'id': TEAM_ID, 'name': 'Équipe test', 'memberCount': 2}], 'activeTeamId': TEAM_ID}
            elif path == '/api/team' and method in ('GET', 'PUT'):
                if method == 'PUT':
                    assert body['revision'] == self.revision
                    self.team = deepcopy(body['team'])
                    self.revision += 1
                payload = {'team': deepcopy(self.team), 'revision': self.revision} if method == 'GET' else {'revision': self.revision}
            elif path == '/api/history' and method in ('GET', 'POST'):
                if method == 'POST':
                    assert not any(r['id'] == body['id'] for r in self.rounds), 'duplicate round write'
                    self.rounds.append(deepcopy(body))
                payload = {'rounds': deepcopy(self.rounds), 'day': self.day}
            elif path == '/api/daily-meter' and method in ('GET', 'POST'):
                if method == 'POST':
                    self.meter = deepcopy(body)
                payload = {'day': self.day, 'meter': self.meter}
            elif path == '/api/mood-meters/catalog' and method == 'GET':
                payload = []
            elif path == '/api/daily-hints' and method == 'GET':
                payload = {'day': self.day, 'hints': []}
            elif path == '/api/meeting-settings' and method in ('GET', 'PUT'):
                if self.settings_failure:
                    status = self.settings_failure
                    route.fulfill(status=status, json={'error': f'Questions mock {status}'})
                    return
                if method == 'PUT':
                    assert set(body) == {'prompts', 'revision'}
                    assert body['revision'] == self.settings['revision']
                    self.settings = {'prompts': body['prompts'], 'revision': self.settings['revision'] + 1}
                payload = deepcopy(self.settings)
            elif path == '/api/live-session' and method in ('GET', 'POST', 'DELETE'):
                if method == 'POST':
                    assert set(body) == {'owner', 'snapshot'}
                    snapshot = body['snapshot']
                    assert set(snapshot) == SNAPSHOT_KEYS, 'private fields in live snapshot'
                    assert snapshot['speaker'] in ['', *NAMES]
                    assert snapshot['nextSpeaker'] in ['', *NAMES]
                    assert snapshot['teamName'] == 'Équipe test'
                    assert isinstance(snapshot['running'], bool)
                    assert 'mood' not in str(body).lower()
                    self.live = deepcopy(snapshot)
                    payload = {'owner': 'mock-owner', 'transport': 'shared'}
                elif method == 'DELETE':
                    assert body == {'owner': 'mock-owner'}
                    self.live = None
                    payload = {'ok': True}
                else:
                    if self.live_mode == 'error':
                        route.fulfill(status=503, json={'error': 'Direct mock indisponible'})
                        return
                    if self.live_mode == 'hold':
                        # Keep this request pending to exercise the stale guard.
                        return
                    payload = {'snapshot': deepcopy(self.live), 'serverNow': time.time() * 1000, 'transport': 'shared'}
            elif path == '/api/round-feedback' and method in ('GET', 'PUT'):
                round_id = body['roundId'] if method == 'PUT' else parse_qs(urlparse(req.url).query)['roundId'][0]
                archived = next(r for r in self.rounds if r['id'] == round_id)
                if method == 'PUT':
                    assert set(body) == {'roundId', 'participantId', 'value'}
                    assert body['participantId'] in [p['id'] for p in archived['people']]
                    assert body['value'] in ('utile', 'mitige', 'pas-utile')
                    self.feedback[body['participantId']] = body['value']
                payload = {'roundId': round_id,
                           'responses': [{'participantId': pid, 'value': value} for pid, value in self.feedback.items()],
                           'counts': {value: list(self.feedback.values()).count(value) for value in ('utile', 'mitige', 'pas-utile')}}
            else:
                raise AssertionError(f'Unmocked API blocked: {method} {path}')
            route.fulfill(json=payload)
        except Exception as error:
            self.unexpected.append(str(error))
            route.fulfill(status=599, json={'error': 'Mock contract failed'})

    def page(self, browser, width, height, fullscreen='supported'):
        context = browser.new_context(viewport={'width': width, 'height': height},
                                      reduced_motion='reduce', service_workers='block',
                                      has_touch=fullscreen == 'unsupported')
        emulate_fullscreen(context)
        self.contexts.append(context)
        context.route('**/api/**', self.api)
        context.route('**/mood-meters/catalog.json', lambda r: r.fulfill(json={'remote': True}))
        context.add_init_script("""for (const name of ['localStorage', 'sessionStorage', 'indexedDB']) {
            Object.defineProperty(window, name, {get() {throw new Error('Browser storage forbidden');}});
        }
        // Next.js development tooling reads document.cookie; leave that native.
        // Every application API is still intercepted above, including writes.
        """)
        page = context.new_page()
        page.on('pageerror', lambda error: self.errors.append(str(error)))
        return page

    def timer(self, page):
        # Use real hydration/history/day readiness and the mood->session guard.
        page.goto(BASE + '/mood?team=' + TEAM_ID)
        if page.viewport_size['width'] <= 800:
            page.get_by_role('button', name='Humeurs de l’équipe', exact=True).click()
        expect(page.get_by_role('button', name='Continuer vers le minuteur', exact=False)).to_be_enabled(timeout=30000)
        page.get_by_role('button', name='Continuer vers le minuteur', exact=False).click()
        expect(page.locator('#timer-page')).to_be_visible()
        expect(page.locator('#start-button')).to_be_enabled()

    def count(self, method, path):
        return sum(m == method and p == path for m, p, _ in self.calls)

    def close(self):
        for context in self.contexts:
            context.close()
        assert not self.unexpected, self.unexpected
        assert not self.errors, self.errors


def prompts_panel(page, width):
    if width <= 800:
        page.get_by_role('button', name='Questions', exact=True).click()
    return page.get_by_role('region', name='Le fil du point')


def geometry(page, width, height, phase):
    page.evaluate('() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))))')
    ring = page.locator('#timer-ring').evaluate('el => {const r = el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height};}')
    problems = []
    if not ring or min(ring['width'], ring['height']) < 90:
        problems.append(f'ring <90px: {ring}')
    for selector in ['#start-button', '#next-button', '#manage-timer-button' if phase == 'focused' else '#reset-button']:
        box = page.locator(selector).bounding_box()
        if not box or box['height'] < 43.9 or min(box['x'], box['y']) < -1 or box['x'] + box['width'] > width + 1 or box['y'] + box['height'] > height + 1:
            problems.append(f'control clipped/small {selector}: {box}')
    if page.evaluate('document.documentElement.scrollWidth > innerWidth'):
        problems.append('horizontal overflow')
    OBSERVATIONS.append(f'{width}x{height} {phase} ring={ring["width"] if ring else None}')
    return problems


def setup_case(browser, mock, width, height):
    page = mock.page(browser, width, height)
    mock.timer(page)
    assert mock.count('POST', '/api/live-session') == 0, 'broadcast must be opt-in'
    problems = geometry(page, width, height, 'setup')
    assert not problems, '; '.join(problems)


def prompts_case(browser, mock, width, height):
    page = mock.page(browser, width, height)
    mock.timer(page)
    panel = prompts_panel(page, width)
    expect(panel).to_contain_text('Question partagée A ?')
    panel.get_by_role('button', name='Modifier les questions de l’équipe').click()
    dialog = page.get_by_role('dialog', name='Questions de l’équipe')
    dialog.get_by_role('textbox', name='Question 1', exact=True).fill('  Priorité <safe> & équipe ?  ')
    dialog.get_by_role('button', name='Ajouter une question', exact=True).click()
    dialog.get_by_role('textbox', name='Question 3', exact=True).fill('Besoin d’aide ?')
    dialog.get_by_role('button', name='Enregistrer', exact=True).click()
    expect(dialog).not_to_be_visible()
    expect(panel).to_contain_text('Priorité <safe> & équipe ?')
    assert mock.settings['prompts'] == ['Priorité <safe> & équipe ?', 'Question partagée B ?', 'Besoin d’aide ?']
    assert mock.count('PUT', '/api/meeting-settings') == 1
    page.reload()
    # Running sessions are transient: recreate via the guarded mood workflow.
    mock.timer(page)
    panel = prompts_panel(page, width)
    expect(panel).to_contain_text('Priorité <safe> & équipe ?')
    assert panel.locator('script').count() == 0
    panel.get_by_role('button', name='Modifier les questions de l’équipe').click()
    mock.settings_failure = 409
    dialog.get_by_role('button', name='Enregistrer', exact=True).click()
    expect(dialog.get_by_role('alert')).to_contain_text('Questions mock 409')
    expect(dialog.get_by_role('button', name='Enregistrer', exact=True)).to_be_disabled()
    expect(dialog.get_by_role('textbox', name='Question 1', exact=True)).to_be_disabled()
    mock.settings_failure = None
    mock.settings = {'prompts': ['Question gagnante distante ?'], 'revision': 9}
    dialog.get_by_role('button', name='Recharger les questions partagées').click()
    expect(panel).to_contain_text('Question gagnante distante ?')
    panel.get_by_role('button', name='Modifier les questions de l’équipe').click()
    mock.settings_failure = 503
    dialog.get_by_role('button', name='Enregistrer', exact=True).click()
    expect(dialog.get_by_role('alert')).to_contain_text('Questions mock 503')
    expect(dialog).to_be_visible()
    expect(dialog.get_by_role('button', name='Enregistrer', exact=True)).to_be_enabled()
    mock.settings_failure = None
    dialog.get_by_role('button', name='Enregistrer', exact=True).click()
    expect(dialog).not_to_be_visible()
    mock.settings_failure = 503
    page.goto(BASE + '/participants?team=' + TEAM_ID)
    mock.timer(page)
    panel = prompts_panel(page, width)
    expect(panel.get_by_role('alert')).to_contain_text('Questions par défaut affichées')
    expect(panel.get_by_role('button', name='Modifier les questions de l’équipe')).to_be_disabled()
    mock.settings_failure = None
    panel.get_by_role('button', name='Réessayer', exact=True).click()
    expect(panel).to_contain_text('Question gagnante distante ?')


def sharing_dialog(page, enabled=False):
    page.get_by_role('button', name='En direct' if enabled else 'Diffusion', exact=True).click()
    dialog = page.get_by_role('dialog', name='Diffusion et présentation', exact=True)
    expect(dialog).to_be_visible()
    return dialog


def presentation_case(browser, mock, width, height):
    # A coarse-pointer context isolates fallback/exit behavior from the desktop
    # fullscreen invitation, which correctly reappears after exiting fullscreen.
    page = mock.page(browser, width, height, fullscreen='unsupported')
    mock.timer(page)
    page.evaluate("Object.defineProperty(Element.prototype, 'requestFullscreen', {value: undefined, configurable: true, writable: true})")
    dialog = sharing_dialog(page)
    dialog.get_by_role('button', name='Présentation', exact=True).click()
    expect(dialog).not_to_be_visible()
    expect(page.get_by_role('button', name='Quitter', exact=True)).to_be_visible()
    assert page.locator('#timer-page').evaluate('el => getComputedStyle(el).position') == 'fixed'
    page.keyboard.press('Escape')
    expect(page.get_by_role('button', name='Diffusion', exact=True)).to_be_visible()
    assert page.locator('#timer-page').evaluate('el => getComputedStyle(el).position') != 'fixed'
    dialog = sharing_dialog(page)
    expect(dialog.get_by_text('Plein écran indisponible :', exact=False)).to_be_visible()
    dialog.get_by_role('button', name='Fermer', exact=True).click()
    expect(dialog).not_to_be_visible()
    # Exercise a successful fullscreen API lifecycle deterministically in headless.
    page.evaluate("""() => {
        let full = null;
        Object.defineProperty(document, 'fullscreenElement', {configurable: true, get: () => full});
        Element.prototype.requestFullscreen = async function() { full = this; document.dispatchEvent(new Event('fullscreenchange')); };
        document.exitFullscreen = async () => { full = null; document.dispatchEvent(new Event('fullscreenchange')); };
    }""")
    dialog = sharing_dialog(page)
    dialog.get_by_role('button', name='Présentation', exact=True).click()
    expect(dialog).not_to_be_visible()
    expect(page.get_by_role('button', name='Quitter', exact=True)).to_be_visible()
    assert page.evaluate('document.fullscreenElement === document.documentElement')
    page.get_by_role('button', name='Quitter', exact=True).click()
    expect(page.get_by_role('button', name='Diffusion', exact=True)).to_be_visible()
    # Leaving presentation retains the app's fullscreen workspace.
    assert page.evaluate('document.fullscreenElement === document.documentElement')
    dialog = sharing_dialog(page)
    dialog.get_by_role('button', name='Présentation', exact=True).click()
    expect(dialog).not_to_be_visible()
    expect(page.get_by_role('button', name='Quitter', exact=True)).to_be_visible()
    page.evaluate("document.exitFullscreen()")
    page.keyboard.press('Escape')
    expect(page.get_by_role('button', name='Diffusion', exact=True)).to_be_visible()
    assert page.evaluate('document.fullscreenElement === null')
    assert page.locator('#timer-page').evaluate('el => getComputedStyle(el).position') != 'fixed'
    dialog = sharing_dialog(page)
    expect(dialog.get_by_role('button', name='Présentation', exact=True)).to_be_visible()
    dialog.get_by_role('button', name='Fermer', exact=True).click()
    expect(dialog).not_to_be_visible()


def live_case(browser, mock, width, height):
    page = mock.page(browser, width, height)
    mock.timer(page)
    spectator = mock.page(browser, width, height)
    spectator.goto(BASE + '/spectator?team=' + TEAM_ID)
    view = spectator.get_by_role('region', name='Vue spectateur')
    expect(view).to_contain_text('En attente de la diffusion')
    assert mock.count('POST', '/api/live-session') == 0
    expect(spectator.get_by_role('list', name='Progression du point quotidien')).to_have_count(0)
    expect(spectator.locator('nav')).to_have_count(0)
    assert view.get_by_role('button').all_text_contents() == ['Présentation']
    expect(spectator.locator('#start-button, #next-button, #manage-timer-button, input, select')).to_have_count(0)
    dialog = sharing_dialog(page)
    dialog.get_by_role('button', name='Diffuser en direct', exact=True).click()
    expect(dialog.get_by_text('En direct · synchronisé', exact=True)).to_be_visible()
    dialog.get_by_role('button', name='Fermer', exact=True).click()
    expect(dialog).not_to_be_visible()
    expect(page.get_by_role('button', name='En direct', exact=True)).to_be_visible()
    expect(view.get_by_role('heading', level=2)).to_have_text(page.locator('#speaker-name').inner_text(), timeout=12000)
    page.locator('#start-button').click()
    expect(view.get_by_text('À la parole', exact=True)).to_be_visible(timeout=12000)
    first = page.locator('#speaker-name').inner_text()
    expect(view.get_by_role('heading', level=2)).to_have_text(first)
    layout_problems = geometry(page, width, height, 'focused')
    page.locator('#start-button').click()
    expect(view.get_by_text('En pause / prêt', exact=True)).to_be_visible(timeout=12000)
    expect(view.get_by_role('heading', level=2)).to_have_text(first)
    paused = view.get_by_role('timer').inner_text()
    # Wait for another actual polling response rather than arbitrary sleeps.
    with spectator.expect_response(lambda r: '/api/live-session' in r.url and r.request.method == 'GET'):
        expect(page.locator('#start-button')).to_contain_text('Reprendre')
    expect(view.get_by_role('timer')).to_have_text(paused)
    page.locator('#next-button').click()
    second = page.locator('#speaker-name').inner_text()
    assert second != first
    expect(view.get_by_role('heading', level=2)).to_have_text(second, timeout=12000)
    expect(view.get_by_text('À la parole', exact=True)).to_be_visible()
    expect(view.get_by_text('1 / 2 passages terminés', exact=True)).to_be_visible()
    assert view.locator('script').count() == 0
    assert not re.search(r'humeur|mood', view.inner_text(), re.I)
    # Hold polls and advance only the spectator's notion of receipt age. This
    # isolates the >6s stale guard from the separate 5s fetch timeout/error path.
    mock.live_mode = 'hold'
    spectator.evaluate('window.originalNow = Date.now; Date.now = () => window.originalNow() + 6500')
    expect(view.get_by_text('Direct indisponible', exact=True)).to_be_visible(timeout=1500)
    expect(view.get_by_role('timer')).to_have_count(0)
    expect(view.get_by_text('À la parole', exact=True)).to_have_count(0)
    spectator.evaluate('Date.now = window.originalNow')
    mock.live_mode = 'error'
    spectator.reload()
    expect(view.get_by_role('alert')).to_contain_text('Direct mock indisponible', timeout=12000)
    expect(view.get_by_role('timer')).to_have_count(0)
    mock.live_mode = 'ok'
    expect(view.get_by_role('heading', level=2)).to_have_text(second, timeout=12000)
    dialog = sharing_dialog(page, enabled=True)
    dialog.get_by_role('button', name='Arrêter le direct', exact=True).click()
    dialog.get_by_role('button', name='Fermer', exact=True).click()
    expect(dialog).not_to_be_visible()
    expect(page.get_by_role('button', name='Diffusion', exact=True)).to_be_visible()
    expect(view.get_by_text('En attente de la diffusion', exact=False)).to_be_visible(timeout=12000)
    assert mock.count('DELETE', '/api/live-session') >= 1
    OBSERVATIONS.append(f'{width}x{height} live opt-in/privacy/start/pause/next/stale/error/reconnect/stop PASS')
    assert not layout_problems, '; '.join(layout_problems)


def feedback_case(browser, mock, width, height):
    page = mock.page(browser, width, height)
    mock.timer(page)
    page.locator('#start-button').click()
    page.locator('#next-button').click()
    page.locator('#next-button').click()
    view = page.get_by_role('button', name='Voir le bilan du jour', exact=True)
    expect(view).to_be_visible(timeout=15000)
    assert len(mock.rounds) == 1
    assert {p['id'] for p in mock.rounds[0]['people']} == {'alice', 'bob'}
    expect(page.get_by_role('button', name='Utilité du point · facultatif', exact=True)).to_have_count(0)
    expect(page.get_by_role('button', name='Avis', exact=True)).to_have_count(0)
    view.click()
    expect(page.get_by_role('heading', name='Bilan enregistré · Classement')).to_be_visible()
    expect(page.get_by_role('button', name='Réinitialiser aujourd’hui', exact=True)).to_be_visible()
    page.reload()
    expect(view).to_be_visible(timeout=15000)
    expect(page.get_by_role('button', name='Utilité du point · facultatif', exact=True)).to_have_count(0)
    expect(page.get_by_role('button', name='Avis', exact=True)).to_have_count(0)
    assert mock.count('GET', '/api/round-feedback') == 0
    assert mock.count('PUT', '/api/round-feedback') == 0
    assert len(mock.rounds) == 1


def main():
    expect.set_options(timeout=10000)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        for width, height in [(320, 568), (1366, 768)]:
            for name, case in [('setup', setup_case), ('prompts', prompts_case),
                               ('presentation', presentation_case), ('live', live_case),
                               ('feedback', feedback_case)]:
                mock = MockMeeting()
                label = f'{name} {width}x{height}'
                try:
                    case(browser, mock, width, height)
                except Exception as error:
                    FAILURES.append(f'{label}: {error}')
                    print(f'FAIL {label}: {error}', flush=True)
                    traceback.print_exc()
                finally:
                    try:
                        mock.close()
                    except Exception as error:
                        FAILURES.append(f'{label} mock/runtime: {error}')
                        print(f'FAIL {label} mock/runtime: {error}', flush=True)
                if not any(f.startswith(label + ':') or f.startswith(label + ' mock/runtime:') for f in FAILURES):
                    print(f'PASS {label}', flush=True)
        browser.close()
    for observation in OBSERVATIONS:
        print('OBSERVATION ' + observation)
    print(f'{"FAIL" if FAILURES else "PASS"}: {10 - len(set(f.split(":", 1)[0].replace(" mock/runtime", "") for f in FAILURES))}/10 feature/viewport cases; all APIs mocked; no live DB writes')
    return 1 if FAILURES else 0


if __name__ == '__main__':
    raise SystemExit(main())