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


def now_ms():
    return int(time.time() * 1000)


class MockAPIs:
    """One dictionary-backed server shared by separately registered contexts."""

    def __init__(self):
        self.entries = {}
        self.drop_sync = False
        self.commands = []
        self.acks = []
        self.deletes = []
        self.calls = []
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
        return bool(snapshot and not snapshot['blocked'] and snapshot['activeId']
                    and snapshot['completed'] < snapshot['total']
                    and snapshot['version'] == command['version']
                    and (command['action'] == 'next'
                         or command['action'] == 'start' and not snapshot['running']
                         or command['action'] == 'pause' and snapshot['running']))

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
            assert PAIR_ID not in self.entries, 'Unexpected duplicate create'
            self.entries[PAIR_ID] = {
                'snapshot': None, 'hostSeenAt': None, 'leaseUntil': 0,
                'expiresAt': now + 14400000, 'pending': None,
                'lastCommandId': None, 'lastCommandVersion': None,
            }
            reply({'id': PAIR_ID, 'owner': OWNER, 'control': CONTROL,
                   'expiresAt': now + 14400000, 'serverNow': now, 'transport': 'shared'}, 201)
            return
        assert operation in ('GET', 'DELETE', 'sync', 'command'), operation
        pair_id = parse_qs(urlsplit(request.url).query).get('id', [None])[0] if method == 'GET' else body.get('id')
        entry = self.entries.get(pair_id)
        if not entry or entry['expiresAt'] <= now:
            reply({'error': 'Télécommande indisponible.'}, 404)
            return
        token = OWNER if operation in ('sync', 'DELETE') else CONTROL
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
        reply({'snapshot': entry['snapshot'], 'status': self.status(entry, now),
               'serverNow': now, 'transport': 'shared',
               **({'command': self.pending(entry, now)} if operation == 'sync' else {})})

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

        context.route('**/api/team', team_api)
        context.route('**/api/daily-meter', daily_api)
        context.route('**/api/history', lambda route: readonly(route, {'rounds': []}))
        context.route('**/api/daily-hints', lambda route: readonly(route, {'day': mauritius_day(), 'hints': []}))
        context.route('**/api/meeting-settings', lambda route: readonly(route, {
            'prompts': ['Qu’avez-vous fait hier ?', 'Sur quoi travaillez-vous ?', 'Que ferez-vous aujourd’hui ?'], 'revision': 0}))
        context.route('**/mood-meters/catalog.json', lambda route: route.fulfill(json={'remote': True}))
        context.route('**/api/mood-meters/catalog', lambda route: readonly(route, []))


def geometry(page, label, failures, *, host=False):
    # Wait for responsive layout and finite entrance/tap animations, not ambient loops.
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
        return {width: innerWidth, document: document.documentElement.scrollWidth,
            scroll: root.scrollWidth, client: root.clientWidth, left:box.left, right:box.right, controls};
    }""", host)
    if (report['document'] > report['width'] + 1 or report['scroll'] > report['client'] + 1
            or report['left'] < -1 or report['right'] > report['width'] + 1):
        failures.append((label, 'horizontal overflow', report))
    for control in report['controls']:
        if (control['width'] < 43.99 or control['height'] < 43.99
                or control['x'] < -1 or control['right'] > report['width'] + 1):
            failures.append((label, 'touch target / horizontal clipping', control))


def main():
    failures = []
    screenshots = Path(tempfile.mkdtemp(prefix='scrum-timer-remote-'))
    print(f'Screenshots: {screenshots}', flush=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for motion in ('reduce', 'no-preference'):
            api = MockAPIs()
            host_context = browser.new_context(viewport={'width': 1366, 'height': 768}, reduced_motion=motion, service_workers='block')
            phone_context = browser.new_context(viewport={'width': 390, 'height': 844}, reduced_motion=motion, service_workers='block')
            host_guard = install_browser_bootstrap(host_context)
            # No automatic dismissal on phone: overlays must genuinely be absent.
            phone_guard = install_browser_bootstrap(phone_context, intro=False, fullscreen=False)
            api.register(host_context)
            api.register(phone_context)
            errors = []
            host, phone = host_context.new_page(), phone_context.new_page()
            for page in (host, phone):
                page.on('pageerror', lambda error: errors.append(str(error)))
            try:
                host.goto(BASE + '/mood')
                host.get_by_role('button', name='Continuer vers le minuteur', exact=False).click()
                expect(host.locator('#speaker-name')).to_be_visible()
                first = host.locator('#speaker-name').inner_text()
                host.get_by_role('button', name='Télécommande mobile', exact=True).click()
                pairing = host.get_by_role('dialog', name='Votre téléphone, aux commandes', exact=True)
                pairing.get_by_role('button', name='Créer mon QR code', exact=True).click()
                expect(pairing.locator('[data-testid="remote-qr"] svg')).to_be_visible()
                expect(pairing.locator('[data-testid="remote-qr"] svg title')).to_have_text('Scanner pour ouvrir la télécommande')
                # react-qr-code's SVG title is an accessible label, not the URL.
                assert len(PAIR_ID) == len(CONTROL) == 43
                phone.goto(REMOTE_URL)
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

                start.click()
                expect(host.locator('#start-button')).to_contain_text('Pause')
                pause = phone.get_by_role('button', name='Mettre en pause', exact=True)
                expect(pause).to_be_enabled()
                pause.click()
                expect(host.locator('#start-button')).to_contain_text(re.compile('Démarrer|Reprendre'))
                expect(start).to_be_enabled()
                next_button = phone.get_by_role('button', name='Passage suivant', exact=True)
                next_button.click()
                expect(phone.get_by_text('Terminer ce passage ?', exact=True)).to_be_visible()
                geometry(phone, (motion, 'confirmation'), failures)
                phone.get_by_role('button', name='Annuler', exact=True).click()
                expect(next_button).to_be_visible()
                expect(host.locator('#speaker-name')).to_have_text(first)
                assert [c['action'] for c in api.commands] == ['start', 'pause'], api.commands
                next_button.click()
                phone.get_by_role('button', name='Confirmer', exact=True).click()
                expect(host.locator('#speaker-name')).not_to_have_text(first)
                second = host.locator('#speaker-name').inner_text()
                expect(phone.get_by_role('heading', level=2)).to_have_text(second)
                expect(pause).to_be_enabled()
                expect(host.locator('#start-button')).to_contain_text('Pause')

                for width, height in SIZES:
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
                expect(phone.get_by_label('Temps restant', exact=True)).to_have_text('—:—')
                api.drop_sync = False
                expect(phone.get_by_text('Connectée', exact=True)).to_be_visible()
                expect(pause).to_be_enabled()

                host.get_by_role('button', name='Télécommande mobile', exact=True).click()
                pairing.get_by_role('button', name='Désactiver', exact=True).click()
                expect(phone.get_by_text('Lien indisponible', exact=True)).to_be_visible()
                expect(phone.get_by_role('status')).to_contain_text('expiré ou a été désactivé')
                expect(phone.get_by_role('button', name='Démarrer / reprendre', exact=True)).to_be_disabled()
                expect(next_button).to_be_disabled()
                assert api.deletes == [PAIR_ID], api.deletes
                assert not api.entries
                pairing.get_by_role('button', name='Revenir au minuteur', exact=True).click()

                before = len(api.calls)
                phone.goto(BASE + '/remote#invalid.link')
                expect(phone.get_by_role('status')).to_contain_text('Ce lien est incomplet')
                expect(phone.get_by_role('button', name='Démarrer / reprendre', exact=True)).to_be_disabled()
                assert len(api.calls) == before, 'Malformed fragment must not call remote API'
                assert [c['action'] for c in api.commands] == ['start', 'pause', 'next'], api.commands
                assert all(c['id'] in api.acks for c in api.commands), (api.commands, api.acks)
                assert len({c['version'] for c in api.commands}) == 3, api.commands
                assert not errors, errors
                host_guard.assert_no_unexpected_api()
                phone_guard.assert_no_unexpected_api()
                print(f'PASS {motion}: pairing, separate-context start/pause/next/cancel, stale/recovery, revoke, invalid link; six viewports', flush=True)
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
    print('PASS: timer remote DEV smoke, 12 viewport/motion combinations; mocked APIs only, no Neon writes', flush=True)


if __name__ == '__main__':
    main()