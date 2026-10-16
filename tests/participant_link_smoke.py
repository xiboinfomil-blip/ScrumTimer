"""Participant sharing UI and unauthenticated bridge smoke; no live DB writes.

Run against an existing production server (BROWSER_TEST_URL, default port 3000).
All browser /api requests are intercepted, with unexpected requests blocked.
Only explicit unauthenticated bridge rejection probes bypass the mocks. Source
guard checks establish rejection precedes DB access; this is not DB tracing.
Screenshots are written outside the repository, in the system temp directory.
"""
import os
import re
import tempfile
from copy import deepcopy
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright


BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3000').rstrip('/')
TEAM = 'a' * 64
NAME = '\u00c9quipe Alpha'
LINK = 'https://participants.example/t/fake-signed'
UNAVAILABLE = 'Configurez PARTICIPANT_PORTAL_URL pour partager le portail.'
ROOT = Path(__file__).resolve().parents[1]


class MockAPI:
    def __init__(self):
        self.requests = []
        self.unexpected = []
        self.unavailable = False
        self.team = {
            'roster': [
                {'id': f'p{i}', 'name': f'Membre {i:03d}', 'present': True,
                 'mood': None, 'moodUpdatedAt': None}
                for i in range(100)
            ],
            'duration': 120, 'warning': 30, 'sound': False,
            'session': [], 'usedMoodMeters': [], 'currentMoodSlide': None,
        }

    def route(self, route):
        request = route.request
        path = urlparse(request.url).path
        method = request.method
        self.requests.append((method, path, request.headers.get('x-team-id')))
        if path == '/api/teams' and method == 'GET':
            route.fulfill(json={'teams': [{'id': TEAM, 'name': NAME, 'memberCount': 100}],
                                'activeTeamId': TEAM})
        elif path in ('/api/team', '/api/history') and method == 'GET':
            assert request.headers.get('x-team-id') == TEAM
            route.fulfill(json=({'team': deepcopy(self.team), 'revision': 7}
                                if path == '/api/team' else {'rounds': []}))
        elif path == '/api/participant-link' and method == 'POST':
            assert request.headers.get('x-team-id') == TEAM
            assert not request.post_data, 'Sharing must not send roster data'
            route.fulfill(status=503 if self.unavailable else 200,
                          json={'error': UNAVAILABLE} if self.unavailable else {'url': LINK})
        else:
            # Fail closed: settings or any future API cannot escape to Neon.
            self.unexpected.append((method, path))
            route.fulfill(status=503, json={'error': 'Unexpected API blocked by test.'})


def settle(page):
    page.evaluate('async () => { for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame); }')


def roster_fits(page):
    """Every paginated row must fit, not merely have overflow hidden."""
    seen = set()
    for _ in range(101):
        settle(page)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        listing = page.locator('main .checkin-list:visible')
        expect(listing).to_have_count(1)
        listing.scroll_into_view_if_needed()
        settle(page)
        geometry = listing.evaluate('''list => {
            const box = list.getBoundingClientRect();
            const section = list.closest('section').getBoundingClientRect();
            return {height: list.clientHeight, scroll: list.scrollHeight,
                rows: [...list.children].map(row => {
                    const r = row.getBoundingClientRect();
                    return {name: row.querySelector('strong').textContent,
                        fits: r.height >= 55 && r.top >= box.top - 1 &&
                            r.bottom <= box.bottom + 1 && r.left >= box.left - 1 &&
                            r.right <= box.right + 1 && r.top >= section.top - 1 &&
                            r.bottom <= section.bottom + 1 && r.top >= -1 &&
                            r.bottom <= innerHeight + 1};
                })};
        }''')
        assert geometry['height'] >= 56 and geometry['scroll'] <= geometry['height'] + 2, geometry
        assert geometry['rows'] and all(row['fits'] for row in geometry['rows']), geometry
        seen.update(row['name'] for row in geometry['rows'])
        next_page = page.get_by_role('button', name='Page suivante', exact=True)
        if next_page.is_disabled():
            break
        next_page.click()
    assert seen == {f'Membre {i:03d}' for i in range(100)}, len(seen)


def screenshot(page, width, state):
    path = Path(tempfile.gettempdir()) / f'scrum-participant-link-{width}-{state}.png'
    page.screenshot(path=str(path))
    print(f'SCREENSHOT {path}')


def ui_case(browser, width, height):
    context = browser.new_context(viewport={'width': width, 'height': height},
                                  reduced_motion='reduce', service_workers='block')
    mock = MockAPI()
    context.route('**/api/**', mock.route)
    # Deterministic clipboard denial, without touching the system clipboard.
    context.add_init_script('''
        Object.defineProperty(navigator, 'clipboard', { configurable: true,
            value: {writeText: async value => {
                globalThis.__copyAttempt = value;
                throw new DOMException('Denied by smoke test', 'NotAllowedError');
            }} });
    ''')
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    try:
        page.goto(f'{BASE}/manage-team?team={TEAM}')
        expect(page.locator('#manage-team-heading')).to_have_text(NAME)
        expect(page.locator('.site-header [role="status"]')).to_have_attribute(
            'title', 'Équipe enregistrée dans Neon.')
        button = page.get_by_role('button', name='Lien participants', exact=True)
        expect(button).to_be_visible()
        assert button.bounding_box()['height'] >= 44
        roster_fits(page)
        screenshot(page, width, 'roster')
        button.click()
        dialog = page.get_by_role('dialog', name=f'Portail participants · {NAME}', exact=True)
        expect(dialog).to_be_visible()
        field = dialog.get_by_role('textbox', name='Lien de l’équipe', exact=True)
        expect(field).to_have_value(LINK)
        expect(field).to_have_attribute('readonly', '')
        expect(dialog.get_by_text('Toute personne ayant ce lien peut modifier les notes de cette équipe.',
                                  exact=False)).to_be_visible()
        expect(dialog.get_by_text('Ne publiez pas ce lien.', exact=False)).to_be_visible()
        settle(page)
        box = dialog.bounding_box()
        assert box and box['x'] >= 0 and box['x'] + box['width'] <= width + 1, box
        field.click()
        assert field.evaluate('e => e.selectionStart === 0 && e.selectionEnd === e.value.length')
        dialog.get_by_role('button', name='Copier le lien', exact=True).click()
        expect(dialog.get_by_role('alert')).to_have_text(
            'Copie indisponible. Sélectionnez et copiez le lien manuellement.')
        assert page.evaluate('globalThis.__copyAttempt') == LINK
        expect(field).to_have_value(LINK)
        expect(dialog.get_by_text('Lien copié.', exact=True)).to_have_count(0)
        screenshot(page, width, 'copy-fallback')
        dialog.get_by_role('button', name='Fermer', exact=True).click()
        expect(dialog).not_to_be_visible()

        mock.unavailable = True
        button.click()
        expect(dialog).to_be_visible()
        expect(dialog.get_by_role('alert')).to_have_text(UNAVAILABLE)
        expect(dialog.get_by_role('textbox')).to_have_count(0)
        expect(dialog.get_by_role('button', name='Copier le lien', exact=True)).to_have_count(0)
        expect(dialog.get_by_text(LINK, exact=False)).to_have_count(0)
        screenshot(page, width, 'unavailable')
        dialog.get_by_role('button', name='Fermer', exact=True).click()
        expect(dialog).not_to_be_visible()

        stale_links = '.site-header a[href^="/daily-notes"], .site-header a[href^="/statistics"], aside a[href^="/daily-notes"], aside a[href^="/statistics"]'
        expect(page.locator(stale_links)).to_have_count(0)
        expect(page.locator('.site-header, aside').get_by_role(
            'link', name=re.compile(r'Notes|Statistiques', re.I))).to_have_count(0)
        for path in ('/daily-notes', '/statistics'):
            response = page.goto(f'{BASE}{path}?team={TEAM}')
            assert response is not None and response.status == 404, (path, response)
            expect(page.locator(stale_links)).to_have_count(0)
        assert not [r for r in mock.requests if r[0] == 'PUT'], mock.requests
        assert not errors, errors
        assert not mock.unexpected, mock.unexpected
        assert [r for r in mock.requests if r[0] != 'GET'] == [
            ('POST', '/api/participant-link', TEAM), ('POST', '/api/participant-link', TEAM)]
        print(f'PASS {width}x{height}: 100 unclipped roster rows, dialog, readonly URL, '
              'team warning, denied-copy fallback, 503 clears old URL, removed master '
              'routes return HTTP 404 and no stale navigation links; all UI APIs mocked')
    finally:
        context.close()


def rejection_checks(playwright):
    # Check current source order before sending any real PUT. No credentials or
    # environment files are read. The body deliberately cannot be a valid note.
    portal = (ROOT / 'src/app/api/participant-portal/route.ts').read_text(encoding='utf-8')
    auth = portal.split('function authorizedTeam(request: Request)', 1)[1].split(
        'export async function GET', 1)[0]
    assert auth.index('validPortalSecret(secret)') < auth.index('equalPortalSecret(')
    assert auth.index('equalPortalSecret(') < auth.index('readParticipantLinkToken(')
    assert 'database(' not in auth
    for verb in ('GET', 'PUT'):
        handler = portal.split(f'export async function {verb}', 1)[1].split(
            'export async function', 1)[0]
        assert handler.index('authorizedTeam(request)') < handler.index('database()')
    link = (ROOT / 'src/app/api/participant-link/route.ts').read_text(encoding='utf-8')
    assert link.index('if (!sameOrigin(request))') < link.index('await selectedTeam(request)')
    print('PASS source guards: unauthenticated rejection precedes database access')

    api = playwright.request.new_context(base_url=BASE)
    try:
        for method in ('GET', 'PUT'):
            response = api.fetch('/api/participant-portal', method=method,
                                 headers={'Content-Type': 'application/json'},
                                 **({'data': '{}'} if method == 'PUT' else {}))
            assert response.status in (403, 503), (method, response.status)
            assert response.json() == {'error': ('Lien d’équipe invalide.' if response.status == 403
                                                else 'Portail participants indisponible.')}
            assert response.headers.get('cache-control') == 'no-store'
            assert 'set-cookie' not in response.headers
            assert not re.search(r'(postgres(?:ql)?://|Bearer |fake-signed|"(?:team|roster|history|notes|secret|url)"\s*:)',
                                 response.text(), re.I)
            print(f'PASS real unauthenticated {method} /api/participant-portal: {response.status}, '
                  'generic rejection only, no credentials/data exposed')
        response = api.post('/api/participant-link', headers={'Origin': 'https://untrusted.example'})
        assert response.status == 403, response.status
        assert response.body() == b''
        assert response.headers.get('cache-control') == 'no-store'
        assert response.headers.get('referrer-policy') == 'no-referrer'
        print('PASS real cross-origin POST /api/participant-link: 403, empty body')
    finally:
        api.dispose()


def main():
    failures = []
    with sync_playwright() as playwright:
        try:
            rejection_checks(playwright)
        except Exception as error:
            failures.append(f'Bridge rejection checks: {type(error).__name__}: {error}')
            print(f'FAIL {failures[-1]}', flush=True)
        browser = playwright.chromium.launch()
        try:
            for width, height in ((1366, 768), (320, 568)):
                try:
                    ui_case(browser, width, height)
                except Exception as error:
                    failures.append(f'{width}x{height}: {type(error).__name__}: {error}')
                    print(f'FAIL {failures[-1]}', flush=True)
        finally:
            browser.close()
    assert not failures, '\n'.join(failures)


if __name__ == '__main__':
    main()