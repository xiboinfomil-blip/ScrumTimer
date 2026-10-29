"""DEV-only, fail-closed remote smoke: two contexts, shared in-memory transport.

No request to an application API is allowed through to Neon/Redis. Run directly
with Python; BROWSER_TEST_URL may only select localhost development port 3001.
"""
from copy import deepcopy
import os
from pathlib import Path
import re
import tempfile
import time
from urllib.parse import parse_qs, urlsplit

from playwright.sync_api import expect, sync_playwright
from browser_bootstrap import (
    TEAM_ID, install_browser_bootstrap, mauritius_day, team_fixture, team_options,
)


BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3001').rstrip('/')
assert BASE in ('http://localhost:3001', 'http://127.0.0.1:3001'), 'DEV port 3001 only'
SIZES = [(320, 568), (390, 844), (768, 1024), (1024, 576), (1366, 768), (1920, 1080)]
PAIR_ID, OWNER, CONTROL = 'i' * 43, 'o' * 43, 'c' * 43
REMOTE_URL = f'{BASE}/remote#{PAIR_ID}.{CONTROL}'
MAX_COMMAND_MS = 2500
COMMAND_ACTIONS = ('start', 'pause', 'next', 'restart', 'penalty', 'black-screen')


def dismiss_install(phone):
    """Dismiss only the expected automatic install dialog, never action dialogs."""
    install = phone.get_by_role('dialog', name='Installer la télécommande', exact=True)
    install.get_by_role('button', name='Continuer dans le navigateur', exact=True).click()
    expect(install).not_to_be_visible()


def open_phone(phone, url):
    """Dismiss the real automatic install dialog once per newly loaded document."""
    # A fragment-only goto is otherwise same-document: the pairing effect runs
    # only on mount, so it would not test an explicitly scanned invalid link.
    phone.goto('about:blank')
    phone.goto(url)
    dismiss_install(phone)


def checkpoint(host):
    return host.evaluate("key => JSON.parse(sessionStorage.getItem(key)).timer",
                         f'standup.timer.tab.v1:{TEAM_ID}')


def current_person(timer):
    return next(person for person in timer['people'] if person['id'] == timer['activeId'])


def post_command(phone, action, version, request_id='92345678-1234-4234-8234-123456789abc'):
    return phone.evaluate("""async command => {
        const response = await fetch('/api/timer-remote', {method:'POST',
            headers:{'Content-Type':'application/json', Authorization:'Bearer ' + command.token},
            body:JSON.stringify({operation:'command', id:command.id, command:{
                requestId:command.requestId, action:command.action, version:command.version}})});
        return response.status;
    }""", {'id': PAIR_ID, 'token': CONTROL, 'action': action,
           'version': version, 'requestId': request_id})


def expected_score(person):
    """Independent fixed-time formula; archive must include retries AND manual -50s."""
    elapsed = round(person['speakingSeconds'], 3)
    if elapsed < 1 or person['budgetSeconds'] <= 0:
        return None
    if elapsed <= 5:
        points = 0
    elif elapsed <= 105:
        points = max(125, min(1000, (elapsed - 5) * 10))
    elif elapsed <= 120:
        closing = elapsed - 105
        points = 1000 - 5 * min(closing, 5) - 10 * min(max(closing - 5, 0), 5) - 15 * min(max(closing - 10, 0), 5)
    else:
        points = max(125, 850 - 50 * int((elapsed - 120) // 10))
    points = int(points + 0.5)
    retries = min(200, max(0, person['attempts'] - 1) * 100)
    return max(0, (max(125, points - retries) if points else 0) - person.get('manualPenalty', 0))


def now_ms():
    return int(time.time() * 1000)


def measured_command(host, phone, action, label, measurements):
    """Warm DEV UI observations over mocked transport, NOT real-network timings.

    Start before Playwright's click (including actionability); phone confirmation
    requires the authoritative running/paused UI, not POST acceptance/status.
    Both observations share one 2500 ms budget, rather than two full timeouts.
    """
    running = action == 'start'
    button = phone.get_by_role('button', name=(
        'Démarrer / reprendre' if running else 'Mettre en pause'), exact=True)
    confirmed = phone.get_by_role('button', name=(
        'Mettre en pause' if running else 'Démarrer / reprendre'), exact=True)
    expect(button).to_be_enabled()
    started = time.perf_counter()
    host_ms = phone_ms = None

    def budget():
        return max(1, MAX_COMMAND_MS - (time.perf_counter() - started) * 1000)

    try:
        button.click(timeout=budget())
        expect(host.locator('#start-button')).to_contain_text(
            'Pause' if running else re.compile('Démarrer|Reprendre'), timeout=budget())
        host_ms = (time.perf_counter() - started) * 1000
        expect(confirmed).to_be_enabled(timeout=budget())
        expect(phone.get_by_text(
            'Le passage est en cours' if running else 'Prêt à votre rythme',
            exact=True)).to_be_visible(timeout=budget())
        phone_ms = (time.perf_counter() - started) * 1000
        assert host_ms <= MAX_COMMAND_MS and phone_ms <= MAX_COMMAND_MS, (
            label, action, host_ms, phone_ms, MAX_COMMAND_MS)
        measurements.append((label, action, host_ms, phone_ms))
    finally:
        elapsed_ms = (time.perf_counter() - started) * 1000
        observed = lambda value: 'NOT CONFIRMED' if value is None else f'{value:.1f}ms'
        print(f'LATENCY {label} {action}: click-to-host={observed(host_ms)} '
              f'click-to-phone-confirmed={observed(phone_ms)} elapsed={elapsed_ms:.1f}ms '
              f'limit={MAX_COMMAND_MS}ms (warm localhost DEV, mocked APIs; '
              'sequential assertion observations, not real-network latency)', flush=True)


class MockAPIs:
    """One dictionary-backed server shared by separately registered contexts."""

    def __init__(self):
        self.entries = {}
        self.drop_sync = False
        self.commands = []
        self.acks = []
        self.deletes = []
        self.calls = []
        self.creates = []
        self.reads = []
        self.archived = []
        self.revision = 1
        self.team = team_fixture(['Alice <safe>', 'Bob', 'Charlie'])
        for person in self.team['roster']:
            person.update(mood=2, moodUpdatedAt=None)
        self.daily = {'day': mauritius_day(), 'meter': None}

    @staticmethod
    def status(entry, now):
        if entry['hostSeenAt'] is None or entry['snapshot'] is None:
            return 'waiting'
        return 'online' if now <= entry['leaseUntil'] and now - entry['hostSeenAt'] <= 6000 else 'stale'

    @staticmethod
    def pending(entry, now):
        command = entry['pending']
        return command if command and 0 <= now - command['createdAt'] <= 5000 else None

    @staticmethod
    def allowed(snapshot, command):
        if (not snapshot or snapshot['blocked'] or not snapshot['activeId']
                or snapshot['completed'] >= snapshot['total']
                or snapshot['version'] != command['version']):
            return False
        action = command['action']
        if snapshot.get('blackScreen', False):
            return action == 'black-screen'
        if action == 'start':
            return not snapshot['running']
        if action == 'pause':
            return snapshot['running']
        if action == 'penalty':
            return snapshot.get('manualPenalty', 0) <= 999950
        return action in ('next', 'restart', 'black-screen')

    def remote(self, route):
        request = route.request
        method = request.method
        body = request.post_data_json if method in ('POST', 'DELETE') else {}
        operation = body.get('operation') if method == 'POST' else method
        self.calls.append(operation)
        now = now_ms()

        def reply(data, status=200):
            route.fulfill(status=status, json=deepcopy(data), headers={'Cache-Control': 'no-store'})

        if operation == 'create':
            assert request.headers.get('x-team-id') == TEAM_ID
            previous = self.entries.get(PAIR_ID)
            if previous and previous['leaseUntil'] > now and previous['expiresAt'] > now:
                reply({'error': 'Host lease already held'}, 409)
                return
            owner = chr(ord('o') + len(self.creates)) * 43
            self.entries[PAIR_ID] = {
                'snapshot': None, 'hostSeenAt': None, 'leaseUntil': 0,
                'expiresAt': now + 14400000, 'pending': None,
                'lastCommandId': None, 'lastCommandVersion': None,
                'owner': owner,
            }
            self.entries[PAIR_ID]['leaseUntil'] = now + 10000
            pair = {'id': PAIR_ID, 'owner': owner, 'control': CONTROL,
                    'expiresAt': now + 14400000, 'serverNow': now,
                    'transport': 'shared', 'reusable': True}
            self.creates.append(deepcopy(pair))
            reply(pair, 201)
            return
        assert operation in ('GET', 'DELETE', 'sync', 'command'), operation
        pair_id = parse_qs(urlsplit(request.url).query).get('id', [None])[0] if method == 'GET' else body.get('id')
        entry = self.entries.get(pair_id)
        # Permanent control capabilities remain valid without an active host.
        # Authenticate BEFORE the missing-entry branch (never accept arbitrary scans).
        if operation in ('GET', 'command') and (pair_id != PAIR_ID or
                request.headers.get('authorization') != f'Bearer {CONTROL}'):
            reply({'error': 'Télécommande indisponible.'}, 401)
            return
        if not entry or entry['expiresAt'] <= now:
            if operation == 'GET':
                self.reads.append({'status': 'waiting', 'snapshot': None, 'http': 200})
                reply({'snapshot': None, 'status': 'waiting', 'serverNow': now, 'transport': 'shared'})
            else:
                reply({'error': 'Télécommande indisponible.'}, 409 if operation == 'command' else 401)
            return
        token = entry['owner'] if operation in ('sync', 'DELETE') else CONTROL
        if request.headers.get('authorization') != f'Bearer {token}':
            reply({'error': 'Télécommande indisponible.'}, 401)
            return
        if operation == 'DELETE':
            del self.entries[pair_id]
            self.deletes.append(pair_id)
            reply({'revoked': True, 'transport': 'shared'})
            return
        if operation == 'sync':
            if self.drop_sync:
                reply({'error': 'Simulated host transport outage'}, 503)
                return
            snapshot = deepcopy(body['snapshot'])
            assert isinstance(snapshot.get('blackScreen', False), bool), snapshot
            manual_penalty = snapshot.get('manualPenalty', 0)
            assert type(manual_penalty) is int and 0 <= manual_penalty <= 1000000, snapshot
            snapshot['deadline'] = now + snapshot['remaining'] * 1000 if snapshot['running'] else 0
            entry.update(snapshot=snapshot, hostSeenAt=now,
                         leaseUntil=min(entry['expiresAt'], now + 10000))
            entry['pending'] = self.pending(entry, now)
            if body.get('ack'):
                self.acks.append(body['ack'])
                if entry['pending'] and entry['pending']['id'] == body['ack']:
                    entry['pending'] = None
        elif operation == 'command':
            command = body['command']
            assert set(command) == {'requestId', 'action', 'version'}, command
            assert command['action'] in COMMAND_ACTIONS, command
            assert re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}', command['requestId'])
            if (self.status(entry, now) != 'online' or not self.allowed(entry['snapshot'], command)
                    or self.pending(entry, now) or entry['lastCommandId'] == command['requestId']
                    or entry['lastCommandVersion'] == command['version']):
                reply({'error': 'Télécommande indisponible.'}, 409)
                return
            entry['pending'] = {'id': command['requestId'], 'action': command['action'],
                                'version': command['version'], 'createdAt': now}
            entry.update(lastCommandId=command['requestId'], lastCommandVersion=command['version'])
            self.commands.append(deepcopy(entry['pending']))
            reply({'accepted': True, 'command': entry['pending'], 'serverNow': now, 'transport': 'shared'})
            return
        waiting = operation == 'GET' and entry['leaseUntil'] <= now
        state = {'snapshot': None if waiting else entry['snapshot'],
                 'status': 'waiting' if waiting else self.status(entry, now)}
        if operation == 'GET':
            self.reads.append({**deepcopy(state), 'http': 200})
        reply({**state,
               'serverNow': now, 'transport': 'shared',
               **({'command': self.pending(entry, now), 'consumedVersion': entry['lastCommandVersion']}
                  if operation == 'sync' else {})})

    def register(self, context):
        context.route('**/api/timer-remote*', self.remote)
        context.route('**/api/teams', lambda route: route.fulfill(json=team_options(member_count=3)))

        def team_api(route):
            assert route.request.headers.get('x-team-id') == TEAM_ID
            if route.request.method == 'PUT':
                self.team = deepcopy(route.request.post_data_json['team'])
                self.revision += 1
                route.fulfill(json={'revision': self.revision})
            else:
                assert route.request.method == 'GET'
                route.fulfill(json={'team': self.team, 'revision': self.revision})

        def daily_api(route):
            assert route.request.headers.get('x-team-id') == TEAM_ID
            if route.request.method == 'POST' and self.daily['meter'] is None:
                self.daily['meter'] = route.request.post_data_json
            else:
                assert route.request.method == 'GET'
            route.fulfill(json=self.daily)

        def readonly(route, data):
            assert route.request.method == 'GET', f'Unexpected write: {route.request.url}'
            route.fulfill(json=data)

        def history_api(route):
            if route.request.method == 'POST':
                self.archived.append(deepcopy(route.request.post_data_json))
            else:
                assert route.request.method == 'GET'
            route.fulfill(json={'rounds': self.archived, 'day': mauritius_day()})

        context.route('**/api/team', team_api)
        context.route('**/api/daily-meter', daily_api)
        context.route('**/api/history', history_api)
        context.route('**/api/daily-hints', lambda route: readonly(route, {'day': mauritius_day(), 'hints': []}))
        context.route('**/api/meeting-settings', lambda route: readonly(route, {
            'prompts': ['Qu’avez-vous fait hier ?', 'Sur quoi travaillez-vous ?', 'Que ferez-vous aujourd’hui ?'], 'revision': 0}))
        context.route('**/mood-meters/catalog.json', lambda route: route.fulfill(json={'remote': True}))
        context.route('**/api/mood-meters/catalog', lambda route: readonly(route, []))


def geometry(page, label, failures, *, host=False):
    # Wait for responsive layout and finite entrance/tap animations, not ambient loops.
    if not host:
        expect(page.get_by_label('Temps restant', exact=True)).to_be_visible()
        expect(page.get_by_role('region', name='Passage en cours').locator('svg circle')).to_have_count(0)
        expect(page.get_by_role('region', name='Commandes à distance')).to_be_visible()
    page.wait_for_function("""() => document.getAnimations().every(a =>
        a.playState !== 'running' || a.effect.getTiming().iterations === Infinity)""")
    report = page.evaluate("""host => {
        const root = host ? document.querySelector('#timer-page > header') : document.querySelector('main');
        const box = root.getBoundingClientRect();
        const controls = [...root.querySelectorAll('button, a, input, select')]
            .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
            .map(el => { const b = el.getBoundingClientRect(); return {
                name: el.getAttribute('aria-label') || el.textContent.trim(),
                x:b.x, right:b.right, width:b.width, height:b.height}; });
        const contrastFailures = [];
        if (!host) {
            // Canvas resolves computed Tailwind oklch colors to actual sRGB bytes.
            // Do not parse rgb() strings or infer contrast from utility names.
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 1;
            const ctx = canvas.getContext('2d', {colorSpace: 'srgb', willReadFrequently: true});
            const rgba = color => {
                ctx.clearRect(0, 0, 1, 1);
                ctx.fillStyle = color;
                ctx.fillRect(0, 0, 1, 1);
                return [...ctx.getImageData(0, 0, 1, 1).data];
            };
            const over = (foreground, background) => {
                const alpha = foreground[3] / 255;
                return foreground.slice(0, 3).map((channel, i) =>
                    channel * alpha + background[i] * (1 - alpha));
            };
            const background = el => {
                const layers = [];
                for (let node = el; node; node = node.parentElement)
                    layers.unshift(rgba(getComputedStyle(node).backgroundColor));
                // Source-over ancestor backgrounds, with white as the page fallback.
                return layers.reduce((back, layer) => over(layer, back), [255, 255, 255]);
            };
            const luminance = rgb => rgb.map(channel => {
                const value = channel / 255;
                return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
            }).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
            const ratio = (a, b) => {
                const first = luminance(a), second = luminance(b);
                return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
            };
            const enabled = el => el && !el.matches(':disabled, [aria-disabled="true"]')
                && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
            const next = root.querySelector('button[aria-label="Passage suivant"]');
            if (enabled(next)) {
                const style = getComputedStyle(next);
                const back = background(next);
                const text = over(rgba(style.color), back);
                const contrast = ratio(text, back);
                if (text.some(channel => channel !== 255) || contrast < 4.5)
                    contrastFailures.push({name: 'Passage suivant', check: 'white text / background >= 4.5',
                        color: style.color, background: style.backgroundColor, contrast});
            }
            // Only the three secondary controls, not labels, icons or disabled scenes.
            for (const button of root.querySelectorAll('section[aria-label="Autres commandes"] button')) {
                if (!enabled(button)) continue;
                const style = getComputedStyle(button);
                const inside = background(button), outside = background(button.parentElement);
                for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
                    const borderColor = style[`border${side}Color`];
                    const border = over(rgba(borderColor), inside);
                    const contrast = Math.min(ratio(border, inside), ratio(border, outside));
                    if (parseFloat(style[`border${side}Width`]) === 0
                            || ['none', 'hidden'].includes(style[`border${side}Style`]) || contrast < 3)
                        contrastFailures.push({name: button.getAttribute('aria-label') || button.textContent.trim(),
                            check: 'border / control and parent backgrounds >= 3', side, borderColor, contrast});
                }
            }
        }
        return {width: innerWidth, document: document.documentElement.scrollWidth,
            scroll: root.scrollWidth, client: root.clientWidth, left:box.left, right:box.right,
            controls, contrastFailures};
    }""", host)
    for failure in report['contrastFailures']:
        failures.append((label, 'enabled remote control contrast', failure))
    if (report['document'] > report['width'] + 1 or report['scroll'] > report['client'] + 1
            or report['left'] < -1 or report['right'] > report['width'] + 1):
        failures.append((label, 'horizontal overflow', report))
    for control in report['controls']:
        if (control['width'] < 43.99 or control['height'] < 43.99
                or control['x'] < -1 or control['right'] > report['width'] + 1):
            failures.append((label, 'touch target / horizontal clipping', control))


def main():
    failures = []
    measurements = []
    screenshots = Path(tempfile.mkdtemp(prefix='scrum-timer-remote-'))
    print(f'Screenshots: {screenshots}', flush=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for motion, phone_size in ((motion, size) for motion in ('reduce', 'no-preference')
                       for size in ((320, 568), (390, 844))):
            api = MockAPIs()
            host_context = browser.new_context(viewport={'width': 1366, 'height': 768}, reduced_motion=motion, service_workers='block')
            phone_context = browser.new_context(viewport={'width': phone_size[0], 'height': phone_size[1]}, reduced_motion=motion, service_workers='block')
            host_guard = install_browser_bootstrap(host_context)
            # Only the expected install modal is dismissed explicitly by open_phone.
            phone_guard = install_browser_bootstrap(phone_context, intro=False, fullscreen=False)
            api.register(host_context)
            api.register(phone_context)
            errors = []
            host, phone = host_context.new_page(), phone_context.new_page()
            phone_calls = []
            phone.on('request', lambda request: phone_calls.append(request.method)
                     if urlsplit(request.url).path == '/api/timer-remote' else None)
            for page in (host, phone):
                page.on('pageerror', lambda error: errors.append(str(error)))
            try:
                host.goto(BASE + '/mood')
                host.get_by_role('button', name='Continuer vers le minuteur', exact=False).click()
                expect(host.locator('#speaker-name')).to_be_visible()
                first = host.locator('#speaker-name').inner_text()
                host.get_by_role('button', name='Télécommande mobile', exact=True).click()
                pairing = host.get_by_role('dialog', name='Votre téléphone, aux commandes', exact=True)
                expect(pairing.locator('[data-testid="remote-qr"] svg')).to_be_visible()
                qr_path = pairing.locator('[data-testid="remote-qr"] svg').inner_html()
                expect(pairing.locator('[data-testid="remote-qr"] svg title')).to_have_text('Scanner pour ouvrir la télécommande')
                # react-qr-code's SVG title is an accessible label, not the URL.
                assert len(PAIR_ID) == len(CONTROL) == 43
                open_phone(phone, REMOTE_URL)
                expect(phone.get_by_text('Connectée', exact=True)).to_be_visible()
                expect(phone.get_by_role('heading', level=2)).to_have_text(first)
                start = phone.get_by_role('button', name='Démarrer / reprendre', exact=True)
                expect(start).to_be_disabled()  # Pairing dialog blocks remote commands.
                pairing.get_by_role('button', name='Revenir au minuteur', exact=True).click()
                expect(pairing).not_to_be_visible()
                expect(start).to_be_enabled()
                expect(phone.get_by_role('navigation')).to_have_count(0)
                expect(phone.get_by_role('list', name='Progression du point quotidien')).to_have_count(0)
                expect(phone.get_by_role('dialog')).to_have_count(0)
                expect(phone.get_by_role('button', name='Fermer l’introduction', exact=True)).to_have_count(0)
                expect(phone.get_by_role('button', name='Entrer en plein écran', exact=True)).to_have_count(0)

                label = f'{motion} {phone_size[0]}x{phone_size[1]}'
                measured_command(host, phone, 'start', label + ' initial', measurements)
                pause = phone.get_by_role('button', name='Mettre en pause', exact=True)
                expect(pause).to_be_enabled()
                # Replay one accepted command concurrently: no extra acceptance,
                # toggle, or speaker handoff. This checks the MOCK contract only.
                accepted = deepcopy(api.commands[-1])
                before_burst = len(api.commands)
                statuses = phone.evaluate("""async ({id, token, command}) =>
                    Promise.all(Array.from({length:3}, async () => {
                        const response = await fetch('/api/timer-remote', {method:'POST',
                            headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`},
                            body:JSON.stringify({operation:'command', id, command})});
                        return response.status;
                    }))""", {'id': PAIR_ID, 'token': CONTROL, 'command': {
                        'requestId': accepted['id'], 'action': accepted['action'],
                        'version': accepted['version']}})
                assert statuses == [409, 409, 409], statuses
                assert len(api.commands) == before_burst, api.commands
                expect(host.locator('#start-button')).to_contain_text('Pause')
                expect(host.locator('#speaker-name')).to_have_text(first)
                expect(pause).to_be_enabled()
                print(f'PASS duplicate burst {label}: 3 concurrent replays -> {statuses}; '
                      '0 extra accepted commands (mocked transport only)', flush=True)
                # Ensure a measured score above the grace period, without changing
                # clocks independently across the paired transport contexts.
                host.wait_for_timeout(6000)
                measured_command(host, phone, 'pause', label + ' initial', measurements)
                expect(start).to_be_enabled()
                baseline = checkpoint(host)
                first_person = deepcopy(current_person(baseline))
                assert first_person['speakingSeconds'] >= 6, first_person
                penalty = phone.get_by_role('button', name='Pénalité de 50 points', exact=True)
                restart = phone.get_by_role('button', name='Redémarrer', exact=True)
                restart_dialog = phone.get_by_role('dialog', name='Redémarrer ce passage ?', exact=True)
                black = phone.get_by_role('button', name='Écran noir', exact=True)
                restore = phone.get_by_role('button', name='Rétablir l’écran', exact=True)
                host_overlay = host.get_by_role('button', name='Rétablir l’écran', exact=True)

                # No/cancel is local only and retains the exact paused checkpoint.
                before_cancel = len(api.commands)
                restart.click()
                expect(restart_dialog).to_be_visible()
                expect(restart_dialog).to_contain_text(first)
                expect(restart_dialog).to_contain_text('Le temps déjà parlé et les pénalités sont conservés')
                restart_dialog.get_by_role('button', name='Non', exact=True).click()
                expect(restart_dialog).not_to_be_visible()
                assert checkpoint(host) == baseline
                assert len(api.commands) == before_cancel

                # Confirmation is tied to its snapshot version, not a stale Yes.
                restart.click()
                expect(restart_dialog).to_be_visible()
                host.locator('#start-button').click()
                expect(restart_dialog).not_to_be_visible()
                expect(pause).to_be_enabled()
                host.locator('#start-button').click()
                expect(start).to_be_enabled()
                assert len(api.commands) == before_cancel

                before_penalty = checkpoint(host)
                before_penalty_commands = len(api.commands)
                penalty.click()
                penalty_dialog = phone.get_by_role('dialog', name='Ajouter une pénalité ?', exact=True)
                expect(penalty_dialog).to_be_visible()
                expect(penalty_dialog).to_contain_text(first)
                penalty_dialog.get_by_role('button', name='Annuler', exact=True).click()
                expect(penalty_dialog).not_to_be_visible()
                assert checkpoint(host) == before_penalty
                assert len(api.commands) == before_penalty_commands
                penalty.click()
                expect(penalty_dialog).to_be_visible()
                expect(penalty_dialog).to_contain_text(first)
                penalty_dialog.get_by_role('button', name='Ajouter −50 points', exact=True).click()
                expect(penalty_dialog).not_to_be_visible()
                expect(phone.get_by_text('Pénalités manuelles : −50 points', exact=True)).to_be_visible()
                expect(penalty).to_be_enabled()
                penalized = checkpoint(host)
                expected = deepcopy(before_penalty)
                current_person(expected)['manualPenalty'] = 50
                assert penalized == expected, (penalized, expected)

                # Paused restart resets ONLY the countdown/turn flags, retaining
                # order, current speaker, spoken time, budget, attempts and penalty.
                restart.click()
                restart_dialog.get_by_role('button', name='Oui, redémarrer', exact=True).click()
                expect(restart_dialog).not_to_be_visible()
                expect(start).to_be_enabled()
                expect(host.locator('#timer-display')).to_have_text(
                    f"{api.team['duration'] // 60:02d}:{api.team['duration'] % 60:02d}")
                restarted = checkpoint(host)
                assert restarted['people'] == penalized['people']
                assert restarted['activeId'] == penalized['activeId']
                assert restarted['remaining'] == restarted['turnTotal'] == api.team['duration']
                assert not restarted['running'] and not restarted['turnStarted']
                assert restarted['deadline'] == 0
                assert not restarted['ended'] and not restarted['warned']
                start.click()
                expect(pause).to_be_enabled()
                assert current_person(checkpoint(host))['attempts'] == current_person(penalized)['attempts'] + 1

                # Black screen covers the actual host viewport and pauses it.
                black.click()
                expect(host_overlay).to_be_visible()
                expect(restore).to_be_enabled()
                expect(restore).to_have_attribute('aria-pressed', 'true')
                expect(start).to_be_disabled()
                expect(restart).to_be_disabled()
                expect(penalty).to_be_disabled()
                expect(phone.get_by_role('button', name='Passage suivant', exact=True)).to_be_disabled()
                expect(phone.get_by_text('Écran masqué · minuteur en pause. Rétablissez l’écran avant de reprendre.', exact=True)).to_be_visible()
                overlay_geometry = host_overlay.evaluate("""el => {
                    const b = el.getBoundingClientRect();
                    return {x:b.x,y:b.y,width:b.width,height:b.height,
                        viewportWidth:innerWidth,viewportHeight:innerHeight,
                        background:getComputedStyle(el).backgroundColor};
                }""")
                assert overlay_geometry == {'x': 0, 'y': 0, 'width': overlay_geometry['viewportWidth'],
                    'height': overlay_geometry['viewportHeight'], 'viewportWidth': 1366,
                    'viewportHeight': 768, 'background': 'rgb(0, 0, 0)'}, overlay_geometry
                hidden = checkpoint(host)
                assert not hidden['running']
                assert current_person(hidden)['manualPenalty'] == 50
                blocked_version = api.entries[PAIR_ID]['snapshot']['version']
                before_blocked = len(api.commands)
                for action in ('start', 'pause', 'next', 'restart', 'penalty'):
                    assert post_command(phone, action, blocked_version) == 409, action
                assert len(api.commands) == before_blocked
                restore.click()
                expect(host_overlay).not_to_be_visible()
                expect(start).to_be_enabled()
                host.wait_for_timeout(750)
                assert checkpoint(host) == hidden, 'Restoring must never resume or charge paused time'

                # A running restart also pauses, preserves cumulative metrics and
                # never increments attempts until an explicit later start.
                start.click()
                expect(pause).to_be_enabled()
                before_running_restart = checkpoint(host)
                restart.click()
                restart_dialog.get_by_role('button', name='Oui, redémarrer', exact=True).click()
                expect(start).to_be_enabled()
                running_restarted = checkpoint(host)
                assert not running_restarted['running']
                assert running_restarted['remaining'] == api.team['duration']
                assert current_person(running_restarted)['attempts'] == current_person(before_running_restart)['attempts']
                assert current_person(running_restarted)['speakingSeconds'] >= current_person(before_running_restart)['speakingSeconds']
                assert current_person(running_restarted)['manualPenalty'] == 50
                assert running_restarted['activeId'] == baseline['activeId']
                # Paused activation + local host restore is another non-resuming path.
                black.click()
                expect(host_overlay).to_be_visible()
                expect(restore).to_be_enabled()
                host_overlay.click()
                expect(host_overlay).not_to_be_visible()
                expect(start).to_be_enabled()
                assert checkpoint(host) == running_restarted

                # Expired delivery is acknowledged/retired without executing; an
                # old action/version cannot cross the restart/restore boundary.
                stale_version = api.entries[PAIR_ID]['snapshot']['version']
                for action in ('restart', 'penalty', 'black-screen'):
                    assert post_command(phone, action, accepted['version']) == 409
                stale_id = '82345678-1234-4234-8234-123456789abc'
                api.entries[PAIR_ID].update(pending={'id': stale_id, 'action': 'penalty',
                    'version': stale_version, 'createdAt': now_ms() - 5001},
                    lastCommandId=stale_id, lastCommandVersion=stale_version)
                phone.wait_for_function("""async ({id, token, version}) => {
                    const response = await fetch('/api/timer-remote?id=' + id,
                        {headers:{Authorization:'Bearer ' + token}});
                    const body = await response.json();
                    return body.snapshot && body.snapshot.version !== version;
                }""", arg={'id': PAIR_ID, 'token': CONTROL, 'version': stale_version})
                assert checkpoint(host) == running_restarted
                assert post_command(phone, 'penalty', stale_version) == 409
                # The injected expiry was observed by a separate fetch above;
                # allow the companion's own 500ms poll to observe that version.
                phone.wait_for_timeout(650)
                finished_first = deepcopy(current_person(running_restarted))
                next_button = phone.get_by_role('button', name='Passage suivant', exact=True)
                next_button.click()
                expect(phone.get_by_text('Terminer ce passage ?', exact=True)).to_be_visible()
                geometry(phone, (motion, 'confirmation'), failures)
                phone.get_by_role('button', name='Annuler', exact=True).click()
                expect(next_button).to_be_visible()
                expect(host.locator('#speaker-name')).to_have_text(first)
                assert [c['action'] for c in api.commands] == [
                    'start', 'pause', 'penalty', 'restart', 'start', 'black-screen',
                    'black-screen', 'start', 'restart', 'black-screen'], api.commands
                next_button.click()
                phone.get_by_role('button', name='Confirmer', exact=True).click()
                expect(host.locator('#speaker-name')).not_to_have_text(first)
                second = host.locator('#speaker-name').inner_text()
                expect(phone.get_by_role('heading', level=2)).to_have_text(second)
                expect(pause).to_be_enabled()
                expect(host.locator('#start-button')).to_contain_text('Pause')
                assert current_person(checkpoint(host))['manualPenalty'] == 0, 'Penalty must not follow the next speaker'

                for width, height in (SIZES if phone_size[0] == 390 else [phone_size]):
                    phone.set_viewport_size({'width': width, 'height': height})
                    geometry(phone, (motion, width, height), failures)
                    if width in (390, 1366):
                        image = screenshots / f'remote-{motion}-{width}.png'
                        phone.screenshot(path=str(image), full_page=True)
                        print(f'SCREENSHOT {image}', flush=True)
                host.set_viewport_size({'width': 320, 'height': 568})
                geometry(host, (motion, 'host-header', 320), failures, host=True)

                api.drop_sync = True
                expect(phone.get_by_text('Hors ligne', exact=True)).to_be_visible()
                expect(phone.get_by_role('button', name='Mettre en pause', exact=True)).to_be_disabled()
                expect(next_button).to_be_disabled()
                expect(restart).to_be_disabled()
                expect(penalty).to_be_disabled()
                expect(black).to_be_disabled()
                expect(phone.get_by_label('Temps restant', exact=True)).to_have_text('—:—')
                api.drop_sync = False
                expect(phone.get_by_text('Connectée', exact=True)).to_be_visible()
                expect(pause).to_be_enabled()

                phone.set_viewport_size({'width': phone_size[0], 'height': phone_size[1]})
                host.get_by_role('button', name='Télécommande mobile', exact=True).click()
                pairing.get_by_role('button', name='Désactiver', exact=True).click()
                expect(phone.get_by_text('En attente de connexion', exact=True)).to_be_visible()
                expect(phone.get_by_role('status')).to_contain_text('Votre équipe est associée')
                expect(phone.get_by_role('button', name='Démarrer / reprendre', exact=True)).to_be_disabled()
                expect(next_button).to_be_disabled()
                expect(restart).to_be_disabled()
                expect(penalty).to_be_disabled()
                expect(black).to_be_disabled()
                assert api.deletes == [PAIR_ID], api.deletes
                assert not api.entries
                assert api.reads[-1] == {'status': 'waiting', 'snapshot': None, 'http': 200}
                geometry(phone, (motion, phone_size, 'disabled-waiting'), failures)
                # Keep the same phone document open: polling must recover unaided.
                phone_document = phone.evaluate('performance.timeOrigin')
                pairing.get_by_role('button', name='Activer le QR de l’équipe', exact=True).click()
                expect(pairing.locator('[data-testid="remote-qr"] svg')).to_be_visible()
                assert pairing.locator('[data-testid="remote-qr"] svg').inner_html() == qr_path
                assert len(api.creates) == 2
                old, new = api.creates
                assert old['id'] == new['id'] == PAIR_ID
                assert old['control'] == new['control'] == CONTROL
                assert old['owner'] != new['owner']
                rejected = host.evaluate("""async pair => {
                    const response = await fetch('/api/timer-remote', {method:'DELETE',
                        headers:{'Content-Type':'application/json', Authorization:`Bearer ${pair.owner}`},
                        body:JSON.stringify({id:pair.id})});
                    return response.status;
                }""", old)
                assert rejected == 401, 'Old host owner must not revoke the new lease'
                pairing.get_by_role('button', name='Revenir au minuteur', exact=True).click()
                expect(phone.get_by_text('Connectée', exact=True)).to_be_visible()
                expect(pause).to_be_enabled()
                assert phone.evaluate('performance.timeOrigin') == phone_document
                measured_command(host, phone, 'pause', label + ' re-enabled', measurements)
                expect(start).to_be_enabled()

                saved = phone.evaluate("localStorage.getItem('standup.companion.team.v1')")
                assert saved == f'{PAIR_ID}.{CONTROL}'
                open_phone(phone, BASE + '/remote')
                expect(phone.get_by_text('Connectée', exact=True)).to_be_visible()
                assert not urlsplit(phone.url).fragment
                expect(start).to_be_enabled()
                measured_command(host, phone, 'start', label + ' remembered', measurements)
                expect(pause).to_be_enabled()

                open_phone(phone, BASE + '/remote#invalid.link')
                expect(phone.get_by_role('status')).to_contain_text('Ce lien est incomplet')
                expect(phone.get_by_role('button', name='Démarrer / reprendre', exact=True)).to_be_disabled()
                before = len(phone_calls)
                phone.wait_for_timeout(1200)  # Include at least one normal polling period.
                assert len(phone_calls) == before, 'Malformed fragment must not call remote API'
                assert phone.evaluate("localStorage.getItem('standup.companion.team.v1')") == saved
                open_phone(phone, BASE + '/remote')
                expect(phone.get_by_text('Connectée', exact=True)).to_be_visible()
                expect(pause).to_be_enabled()
                phone.get_by_role('button', name='Oublier cette équipe sur ce téléphone', exact=True).click()
                dismiss_install(phone)
                expect(phone.get_by_role('status')).to_contain_text('Ce lien est incomplet')
                assert phone.evaluate("localStorage.getItem('standup.companion.team.v1')") is None
                assert urlsplit(phone.url).path == '/remote' and not urlsplit(phone.url).fragment, phone.url
                after_forget = len(phone_calls)
                phone.wait_for_timeout(1200)
                assert len(phone_calls) == after_forget, 'Forgotten pairing must stop polling'
                expect(phone.get_by_role('button', name='Oublier cette équipe sur ce téléphone', exact=True)).to_have_count(0)
                open_phone(phone, BASE + '/remote')
                expect(phone.get_by_role('status')).to_contain_text('Ce lien est incomplet')
                assert [c['action'] for c in api.commands] == [
                    'start', 'pause', 'penalty', 'restart', 'start', 'black-screen',
                    'black-screen', 'start', 'restart', 'black-screen', 'next',
                    'pause', 'start'], api.commands
                deadline = time.monotonic() + 5
                while not all(c['id'] in api.acks for c in api.commands) and time.monotonic() < deadline:
                    host.wait_for_timeout(100)
                assert all(c['id'] in api.acks for c in api.commands), (api.commands, api.acks)
                assert len({c['version'] for c in api.commands}) == len(api.commands) == 13, api.commands
                # Complete with native host controls after forgetting the phone.
                # Archived score is derived from preserved speaking time, retries
                # and the -50 deduction, without adding score UI to the timer.
                host.locator('#next-button').click()
                expect(host.locator('#speaker-name')).not_to_have_text(second)
                host.locator('#next-button').click()
                expect(host.get_by_role('button', name='Voir le bilan du jour')).to_be_visible()
                assert len(api.archived) == 1, api.archived
                archive = api.archived[0].get('round', api.archived[0])
                archived_first = next(person for person in archive['people'] if person['id'] == finished_first['id'])
                assert archived_first['speakingSeconds'] == finished_first['speakingSeconds']
                assert archived_first['budgetSeconds'] == finished_first['budgetSeconds']
                assert archived_first['score'] == expected_score(finished_first), (archived_first, finished_first)
                without_manual = {**finished_first, 'manualPenalty': 0}
                assert archived_first['score'] == max(0, expected_score(without_manual) - 50)
                assert len(archive['people']) == 3
                assert not errors, errors
                host_guard.assert_no_unexpected_api()
                phone_guard.assert_no_unexpected_api()
                print(f'PASS {motion} {phone_size}: six commands, state-bound restart Yes/No, retained metrics/retries/manual score, black-screen guards and remote/local restore without resume, stale/expired recovery, permanent QR waiting/re-enable/fresh owner, remembered pairing/invalid explicit/forget', flush=True)
            except Exception:
                for label, page in (('host', host), ('phone', phone)):
                    image = screenshots / f'failure-{motion}-{label}.png'
                    page.screenshot(path=str(image), full_page=True)
                    print(f'FAILURE SCREENSHOT {image}', flush=True)
                raise
            finally:
                phone_context.close()
                host_context.close()
        browser.close()
    for failure in failures:
        print(f'GEOMETRY BUG: {failure}', flush=True)
    assert not failures, f'{len(failures)} geometry failures; see reports above'
    assert len(measurements) == 16, measurements
    for action in ('start', 'pause'):
        samples = [sample for sample in measurements if sample[1] == action]
        for index, target in ((2, 'host'), (3, 'phone-confirmed')):
            values = [sample[index] for sample in samples]
            print(f'LATENCY RANGE {action} click-to-{target}: '
                  f'{min(values):.1f}..{max(values):.1f}ms; n={len(values)}; '
                  f'limit={MAX_COMMAND_MS}ms (warm localhost DEV, mocked APIs only)', flush=True)
    print('PASS: timer remote DEV smoke, 4 phone lifecycle cases + 12 viewport/motion geometry combinations; mocked APIs only, no Neon writes', flush=True)


if __name__ == '__main__':
    main()