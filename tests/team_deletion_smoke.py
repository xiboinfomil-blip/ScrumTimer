"""Team deletion UI at desktop/mobile sizes; fail-closed APIs, no live DB writes.

Uses an already running app (BROWSER_TEST_URL, default http://localhost:3000).
The mock covers client selection/safety, not relational cascade correctness;
the latter belongs to team-deletion.test.ts.
"""
import os
from copy import deepcopy
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright
from browser_bootstrap import install_browser_bootstrap


BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3000').rstrip('/')
A, B, C, D = (letter * 64 for letter in 'abcd')
NAMES = {A: 'Équipe Alpha', B: 'Équipe Bêta', C: 'Équipe Gamma', D: 'Après suppression'}
DIALOG = 'Supprimer définitivement cette équipe ?'
CONFIRM = 'Recopiez le nom exact de l’équipe'


def owned_data(name, duration=120):
    return {
        'name': name,
        'revision': 7,
        'team': {
            'roster': [
                {'id': 'shared-person', 'name': name + ' membre', 'present': True,
                 'mood': 3, 'moodUpdatedAt': '2026-10-15T08:00:00Z'},
                {'id': 'absent', 'name': name + ' absent', 'present': False,
                 'mood': None, 'moodUpdatedAt': None},
            ],
            'duration': duration, 'warning': 15, 'sound': False,
            'session': [], 'usedMoodMeters': ['deck-aaaaaaaaaaaaaaaaaaaa'],
            'currentMoodSlide': None,
        },
        'rounds': [],
    }


class MockTeams:
    def __init__(self):
        self.db = {key: owned_data(NAMES[key], duration)
                   for key, duration in ((A, 180), (B, 90), (C, 240))}
        self.requests = []
        self.failure = None
        self.held = []

    def listing(self, selected=None):
        return {
            'teams': [{'id': key, 'name': row['name'],
                       'memberCount': len(row['team']['roster'])}
                      for key, row in self.db.items()],
            'activeTeamId': selected if selected in self.db else next(iter(self.db), None),
        }

    def count(self, method, path='/api/teams'):
        return sum(verb == method and target == path for verb, target, _ in self.requests)

    def api(self, route):
        request = route.request
        path = urlparse(request.url).path
        method = request.method
        key = request.headers.get('x-team-id')
        self.requests.append((method, path, key))
        # Never fall back/continue to a real API, even for unexpected requests.
        if path == '/api/jira' and method == 'GET':
            route.fulfill(json={'configured': False, 'connected': False})
        elif path == '/api/teams' and method == 'GET':
            route.fulfill(json=self.listing())
        elif path == '/api/teams' and method == 'PATCH':
            body = request.post_data_json
            assert set(body) == {'teamId'} and body['teamId'] in self.db, body
            route.fulfill(json=self.listing(body['teamId']))
        elif path == '/api/teams' and method == 'POST':
            assert not self.db, 'Only explicit creation after empty is expected'
            assert request.post_data_json == {'name': NAMES[D], 'category': None}
            row = owned_data(NAMES[D])
            row['team']['roster'] = []
            row['team']['usedMoodMeters'] = []
            self.db[D] = row
            route.fulfill(json=self.listing(D))
        elif path == '/api/teams' and method == 'DELETE':
            body = request.post_data_json
            assert set(body) == {'teamId', 'name'}, body
            target = body['teamId']
            assert target in self.db and body['name'] == self.db[target]['name'], body
            if self.failure == 'server':
                route.fulfill(status=503, json={'error': 'Suppression mock indisponible.'})
                return
            del self.db[target]
            if self.failure == 'timeout':
                # The server committed, but the response never arrives. The
                # provider's actual 15s AbortController must block stale writes.
                self.held.append(route)
                return
            route.fulfill(json=self.listing())
        elif path in ('/api/team', '/api/history') and method == 'GET' and key in self.db:
            row = self.db[key]
            payload = ({'team': deepcopy(row['team']), 'revision': row['revision']}
                       if path == '/api/team' else {'rounds': deepcopy(row['rounds'])})
            route.fulfill(json=payload)
        else:
            route.fallback()


def saved(page):
    expect(page.locator('.site-header [role="status"]')).to_have_attribute(
        'title', 'Équipe enregistrée dans Neon.')


def selected(page, key):
    if urlparse(page.url).path == '/manage-team':
        expect(page.locator('#manage-team-heading')).to_have_text(NAMES[key])
    else:
        expect(card(page, key).get_by_text('Actuelle', exact=True)).to_be_visible()
    assert parse_qs(urlparse(page.url).query).get('team') == [key], page.url


def assert_hydrated_after_delete(mock, key):
    delete_index = max(index for index, request in enumerate(mock.requests) if request[0] == 'DELETE')
    required = {('GET', '/api/team', key), ('GET', '/api/history', key)}
    assert required.issubset(set(mock.requests[delete_index + 1:])), mock.requests[delete_index + 1:]


def card(page, key):
    return page.get_by_role('list', name='Équipes disponibles', exact=True).locator('li').filter(
        has=page.get_by_role('heading', name=NAMES[key], exact=True))


def fits(page):
    page.evaluate('async () => { for (let i=0; i<4; i++) await new Promise(requestAnimationFrame); }')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), page.url


def teams_page(page):
    expect(page.locator('#teams-heading:visible')).to_have_count(1)
    assert urlparse(page.url).path == '/teams', page.url
    expect(page.get_by_role('button', name='Supprimer l’équipe ', exact=False)).to_have_count(0)


def manage(page, key):
    teams_page(page)
    page.get_by_role('button', name='Gérer l’équipe ' + NAMES[key], exact=True).click()
    expect(page.locator('#manage-team-heading')).to_have_text(NAMES[key])
    assert urlparse(page.url).path == '/manage-team', page.url
    saved(page)
    selected(page, key)
    page.get_by_text('Options de l’équipe', exact=True).click()
    expect(page.get_by_role('button', name='Supprimer l’équipe ' + NAMES[key],
                            exact=True)).to_be_visible()
    expect(page.get_by_role('button', name='Supprimer l’équipe ', exact=False)).to_have_count(1)


def open_delete(page, key):
    assert urlparse(page.url).path == '/manage-team', page.url
    selected(page, key)
    page.get_by_role('button', name='Supprimer l’équipe ' + NAMES[key], exact=True).click()
    dialog = page.get_by_role('dialog', name=DIALOG, exact=True)
    expect(dialog).to_be_visible()
    expect(dialog.get_by_role('textbox', name=CONFIRM, exact=True)).to_be_focused()
    fits(page)
    box = dialog.bounding_box()
    size = page.viewport_size
    assert box and box['x'] >= -1 and box['x'] + box['width'] <= size['width'] + 1, box
    return dialog


def confirm_delete(page, key):
    dialog = open_delete(page, key)
    dialog.get_by_role('textbox', name=CONFIRM, exact=True).fill(NAMES[key])
    button = dialog.get_by_role('button', name='Supprimer définitivement', exact=True)
    expect(button).to_be_enabled()
    button.click()
    return dialog


def lifecycle(page, mock):
    initial = deepcopy(mock.db)
    manage(page, B)
    dialog = open_delete(page, B)
    field = dialog.get_by_role('textbox', name=CONFIRM, exact=True)
    remove = dialog.get_by_role('button', name='Supprimer définitivement', exact=True)
    for mismatch in ('', 'équipe bêta', 'Équipe Beta', 'Équipe Bêta ', ' Équipe Bêta', NAMES[A]):
        field.fill(mismatch)
        expect(remove).to_be_disabled()
        assert mock.count('DELETE') == 0
    field.fill(NAMES[B])
    expect(remove).to_be_enabled()
    dialog.get_by_role('button', name='Annuler', exact=True).click()
    expect(dialog).not_to_be_visible()
    assert mock.count('DELETE') == 0 and mock.db == initial

    # Only the managed (active) team can be deleted. The next team must be
    # hydrated, while every surviving team's backend data remains untouched.
    confirm_delete(page, B)
    teams_page(page)
    expect(card(page, B)).to_have_count(0)
    saved(page)
    selected(page, A)
    expect(card(page, A).get_by_text('Actuelle', exact=True)).to_be_visible()
    assert mock.db == {A: initial[A], C: initial[C]}
    assert mock.count('DELETE') == 1
    assert_hydrated_after_delete(mock, A)
    manage(page, C)
    expect(page.get_by_text(NAMES[C] + ' membre', exact=True)).to_be_visible()
    assert mock.db[C] == initial[C], 'Other rosters, moods and preferences survive deletion'

    # Active deletion must leave the old selection, hydrate the next team and
    # stay on /teams with its new URL context (no stale guarded-route redirect).
    confirm_delete(page, C)
    teams_page(page)
    expect(card(page, C)).to_have_count(0)
    saved(page)
    selected(page, A)
    assert urlparse(page.url).path == '/teams'
    expect(card(page, A).get_by_text('Actuelle', exact=True)).to_be_visible()
    assert mock.db == {A: initial[A]}
    assert_hydrated_after_delete(mock, A)
    manage(page, A)
    expect(page.get_by_text(NAMES[A] + ' membre', exact=True)).to_be_visible()

    confirm_delete(page, A)
    teams_page(page)
    expect(page.get_by_text('Votre première équipe commence ici.', exact=True)).to_be_visible()
    saved(page)
    assert mock.db == {} and mock.count('DELETE') == 3
    assert urlparse(page.url).path == '/teams' and not urlparse(page.url).query
    expect(page.get_by_role('list', name='Équipes disponibles', exact=True)).to_have_count(0)
    reads = mock.count('GET', '/api/team')
    for _ in range(2):
        page.reload()
        teams_page(page)
        expect(page.get_by_text('Votre première équipe commence ici.', exact=True)).to_be_visible()
        saved(page)
        assert not urlparse(page.url).query and mock.db == {}
        assert mock.count('GET', '/api/team') == reads
        assert mock.count('POST') == 0, 'GET/reload must never recreate a default team'
    fits(page)
    page.get_by_role('button', name='Nommer mon équipe', exact=True).click()
    page.get_by_role('textbox', name='Nom de l’équipe', exact=True).fill(NAMES[D])
    page.get_by_role('button', name='Créer l’équipe', exact=True).click()
    expect(page.locator('#manage-team-heading')).to_have_text(NAMES[D])
    expect(page.get_by_text('Votre équipe prend forme ici.', exact=True)).to_be_visible()
    saved(page)
    selected(page, D)
    page.get_by_text('Options de l’équipe', exact=True).click()
    expect(page.get_by_role('button', name='Supprimer l’équipe ' + NAMES[D],
                            exact=True)).to_be_visible()
    assert mock.count('POST') == 1 and list(mock.db) == [D]
    page.reload()
    expect(page.locator('#manage-team-heading')).to_have_text(NAMES[D])
    saved(page)
    selected(page, D)


def failure_case(page, mock, failure):
    before = deepcopy(mock.db)
    manage(page, A)
    mock.failure = failure
    if failure == 'timeout':
        page.clock.install()
    dialog = confirm_delete(page, A)
    if failure == 'timeout':
        expect(dialog.get_by_role('button', name='Suppression…', exact=True)).to_be_disabled()
        expect(dialog.get_by_role('button', name='Annuler', exact=True)).to_be_disabled()
        expect(dialog.get_by_role('textbox', name=CONFIRM, exact=True)).to_be_disabled()
        # Allow route dispatch before advancing the real provider timeout.
        page.wait_for_timeout(50)
        assert len(mock.held) == 1
        page.clock.fast_forward(16000)
    expect(dialog).not_to_be_visible()
    expect(page.get_by_role('button', name='Réessayer Neon', exact=True)).to_be_visible()
    expect(page.locator('.site-header [role="status"]')).to_have_attribute(
        'title', 'Échec de l’enregistrement de l’équipe dans Neon. Réessayez.')
    selected(page, A if failure == 'server' else B)
    assert urlparse(page.url).path == '/manage-team', page.url
    if failure in ('server', 'timeout'):
        # A safe authoritative GET resolves either the rejected or uncertain
        # mutation without replaying DELETE.
        expected = A if failure == 'server' else B
        expect(page.locator('#manage-team-heading')).to_have_text(NAMES[expected])
        assert mock.count('DELETE') == 1
        assert mock.db == (before if failure == 'server' else {B: before[B], C: before[C]})
        return
    # ready=false removes the private route, including its dialog and controls;
    # missing management UI is the safety gate, not a disabled delete button.
    expect(page.locator('#manage-team-heading')).to_have_count(0)
    expect(page.get_by_role('button', name='Supprimer l’équipe ', exact=False)).to_have_count(0)
    expect(page.get_by_text('Connexion à Neon nécessaire pour ouvrir votre équipe.',
                            exact=True)).to_be_visible()
    assert mock.count('DELETE') == 1
    assert mock.db == (before if failure == 'server' else {B: before[B], C: before[C]})
    request_count = len(mock.requests)
    for name in ('Humeurs —', 'Minuteur —'):
        expect(page.get_by_role('button', name=name, exact=False)).to_be_disabled()
    # /teams remains public during the error. Navigate there and verify stale
    # cards cannot select/manage/create teams.
    page.get_by_role('link', name='Accueil du point quotidien Infomil Mauritius', exact=True).click()
    teams_page(page)
    for key in before:
        for prefix in ('Ouvrir l’équipe ', 'Gérer l’équipe '):
            expect(page.get_by_role('button', name=prefix + NAMES[key],
                                    exact=True)).to_be_disabled()
    expect(page.get_by_role('button', name='Ajouter une nouvelle équipe', exact=True)).to_be_disabled()
    page.wait_for_timeout(100)
    assert len(mock.requests) == request_count, 'No automatic retry or stale writes before explicit Retry'

    mock.failure = None
    before_reload = mock.count('GET')
    page.get_by_role('button', name='Réessayer Neon', exact=True).click()
    saved(page)
    selected(page, A if failure == 'server' else B)
    assert mock.count('GET') > before_reload, 'Retry must reload the authoritative team list'
    assert mock.count('DELETE') == 1, 'Retry must not replay an uncertain DELETE'
    teams_page(page)
    page.get_by_role('button', name='Ajouter une nouvelle équipe', exact=True).click()
    expect(page.get_by_role('button', name='Créer une équipe', exact=True)).to_be_enabled()
    expect(page.get_by_role('button', name='Ouvrir l’équipe ' + NAMES[B], exact=True)).to_be_enabled()
    expect(page.get_by_role('button', name='Gérer l’équipe ' + NAMES[B], exact=True)).to_be_enabled()
    if failure == 'timeout':
        expect(card(page, A)).to_have_count(0)
    assert mock.db == (before if failure == 'server' else {B: before[B], C: before[C]})
    manage(page, B)
    expect(page.get_by_role('button', name='Supprimer l’équipe ' + NAMES[B], exact=True)).to_be_enabled()
    assert mock.count('DELETE') == 1, 'Recovery and management must not replay DELETE'
    fits(page)


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            for width, height in ((1366, 768), (320, 568)):
                for scenario in ('lifecycle', 'server', 'timeout'):
                    context = browser.new_context(
                        viewport={'width': width, 'height': height},
                        reduced_motion='reduce', service_workers='block')
                    bootstrap = install_browser_bootstrap(context)
                    mock = MockTeams()
                    context.route('**/api/**', mock.api)
                    page = context.new_page()
                    errors = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    try:
                        page.goto(f'{BASE}/teams?team={A}')
                        teams_page(page)
                        saved(page)
                        selected(page, A)
                        if scenario == 'lifecycle':
                            lifecycle(page, mock)
                        else:
                            failure_case(page, mock, scenario)
                        assert not errors, errors
                        # PUT/history writes are deliberately unsupported by the mock.
                        assert all(method == 'GET' or path == '/api/teams'
                                   for method, path, _ in mock.requests), mock.requests
                        bootstrap.assert_no_unexpected_api()
                        print(f'PASS team deletion {scenario} {width}x{height}')
                    finally:
                        for held in mock.held:
                            try:
                                held.abort()
                            except Exception:
                                pass  # Request may already have been aborted by the timeout.
                        context.close()
                        mock.held.clear()
        finally:
            browser.close()


if __name__ == '__main__':
    main()