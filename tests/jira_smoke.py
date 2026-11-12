"""Isolated Jira UI journeys against an existing local server; every API is mocked."""
import os
import re
import tempfile
from argparse import ArgumentParser
from copy import deepcopy
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright

from browser_bootstrap import install_browser_bootstrap, mauritius_day, team_fixture
from contrast_helpers import assert_contrast
from team_directory_smoke import DirectoryMock, creation_panel, geometry

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3001').rstrip('/')
CLOUD = '12345678-1234-1234-1234-123456789abc'
SPRINT = 'd' * 64
SELECTION = {'cloudId': CLOUD, 'boardId': 1, 'sprintId': 2}
SIZES = [(320, 568), (390, 844), (1024, 576), (1366, 768)]
WORKFLOW = [('En cours', 'indeterminate'), ('Validation métier', 'indeterminate'),
            ('En recette', 'indeterminate'), ('Terminé', 'done'), ('Ouvert', 'new'),
            ('En cours', 'indeterminate'), ('En attente externe', 'indeterminate')]


class JiraMock(DirectoryMock):
    def __init__(self):
        super().__init__()
        self.selection = deepcopy(SELECTION)
        self.syncs, self.ticket_reads = [], []
        self.ticket_statuses = []
        self.ticket_error = False
        self.detail_reads = []
        self.long_title = False
        self.connected = True
        self.sites = [{'id': CLOUD, 'name': 'Infomil Jira'},
                  {'id': '98765432-4321-4321-4321-cba987654321', 'name': 'Autre site Jira'}]
        self.site_error = False
        self.board_reads = []
        self.daily = {'day': mauritius_day(), 'meter': None}
        self.revision = 1

    def api(self, route):
        request = route.request
        parsed = urlparse(request.url)
        path, method = parsed.path, request.method
        query = parse_qs(parsed.query)
        if path == '/api/jira':
            if method == 'POST':
                body = request.post_data_json
                assert body == {'action': 'sync', 'revision': self.revision,
                                'sprint': {**SELECTION, 'sprintId': 3}}
                assert request.headers.get('x-team-id') == SPRINT
                self.syncs.append(deepcopy(body))
                self.revision += 1
                self.selection = body['sprint']
                route.fulfill(json={'count': 2})
                return
            action = query.get('action', ['status'])[0]
            if action == 'status':
                payload = {'configured': True, 'connected': self.connected, 'name': 'Camille Jira'}
            elif action == 'sites':
                if self.site_error:
                    route.fulfill(status=503, json={'error': 'Sites Jira indisponibles.'})
                    return
                payload = {'options': self.sites}
            elif action == 'boards':
                assert query['cloudId'] == [CLOUD]
                self.board_reads.append(query['cloudId'][0])
                payload = {'options': [{'id': '1', 'name': 'Scrum produit'}]}
            elif action == 'sprints':
                assert query['cloudId'] == [CLOUD]
                assert query['boardId'] == ['1']
                payload = {'options': [{'id': str(number), 'name': f'Sprint {number}'}
                                       for number in (2, 3)]}
            elif action == 'team':
                assert request.headers.get('x-team-id') == SPRINT
                payload = {'sprint': {**self.selection, 'name': f"Sprint {self.selection['sprintId']}"}}
            elif action == 'ticket':
                assert request.headers.get('x-team-id') == SPRINT
                key = query['key'][0]
                self.detail_reads.append(key)
                assert re.fullmatch(r'(DEV|BOB|FREE)-\d+', key)
                unassigned = key.startswith('FREE')
                person = None if unassigned else 'jira:a' if key.startswith('DEV') else 'jira:b'
                payload = {'ticket': {'id': key, 'key': key,
                    'summary': 'W' * 255 if self.long_title else f'{person or "Non attribué"} ticket {key.split("-")[1]} <texte sûr>',
                    'description': '' if unassigned else 'Fiabiliser la synchronisation des données entre les appareils.\n\nCritères d’acceptation\n• Conserver les modifications pendant une reconnexion.\n• Afficher un état cohérent sur tous les écrans.\n• Couvrir les erreurs et la reprise avec des tests.\n\n<img src=x onerror=alert(1)> reste du texte, jamais du HTML.',
                    'estimate': None if unassigned or key.endswith('-2') else {'label': 'Story Points', 'value': 8},
                    'estimateUnavailable': key.endswith('-2'),
                    'status': 'En cours', 'statusCategory': 'indeterminate', 'issueType': 'Story', 'priority': 'Haute',
                    'assigneeId': person[5:] if person else None, 'assigneeName': person,
                    'reporter': 'Camille', 'labels': ['synchronisation', 'api'], 'components': ['Application'],
                    'updated': '2026-11-12T08:30:00Z', 'dueDate': None, 'parent': 'DEV-100',
                    'url': f'https://example.atlassian.net/browse/{key}'}}
            elif action == 'tickets':
                assert request.headers.get('x-team-id') == SPRINT
                assert query.get('scope') == ['board'] and 'participantId' not in query
                status = query.get('status', [''])[0]
                assert status == 'all', query
                self.ticket_statuses.append(status)
                self.ticket_reads.append(request.headers.get('x-jira-refresh', 'initial'))
                if self.ticket_error:
                    route.fulfill(status=401, json={'error': 'Session Jira expirée.'})
                    return
                payload = {'name': 'Scrum produit', 'tickets': [
                    {'id': f'{prefix}:{index}', 'key': f'{prefix}-{index}',
                     'summary': f'{person or "Non attribué"} ticket {index} <texte sûr>',
                     'status': WORKFLOW[index - 1][0], 'statusCategory': WORKFLOW[index - 1][1], 'issueType': 'Story', 'priority': 'Haute',
                     'assigneeId': person[5:] if person else None, 'assigneeName': person,
                     'url': f'https://example.atlassian.net/browse/{prefix}-{index}'}
                    for person, prefix in [('jira:a', 'DEV'), ('jira:b', 'BOB'), (None, 'FREE')]
                    for index in range(1, 8 if person else 2)]}
            else:
                raise AssertionError(action)
            route.fulfill(json=payload)
            return
        if path == '/api/teams' and method == 'POST':
            body = request.post_data_json
            assert body == {'name': 'Équipe sprint', 'category': None,
                            'kind': 'sprint', 'sprint': SELECTION}, body
            self.creations.append(deepcopy(body))
            self.active = SPRINT
            self.teams.append({'id': SPRINT, 'name': body['name'], 'category': None,
                               'kind': 'sprint', 'sprintName': 'Sprint 2',
                               'memberCount': 2})
            self.states[SPRINT] = team_fixture(roster=[
                {'id': f'jira:{account}', 'name': name, 'present': True,
                 'mood': None, 'moodUpdatedAt': None}
                for account, name in [('a', 'Alice <texte>'), ('b', 'Bob')]])
            route.fulfill(json=self.listing())
            return
        if path == '/api/teams' and method == 'PATCH':
            assert request.post_data_json == {'teamId': SPRINT}
            route.fulfill(json=self.listing())
            return
        if path == '/api/team' and method == 'GET' and request.headers.get('x-team-id') == SPRINT:
            route.fulfill(json={'team': deepcopy(self.states[SPRINT]), 'revision': self.revision})
            return
        if path == '/api/team' and method == 'PUT':
            assert request.headers.get('x-team-id') == SPRINT
            body = request.post_data_json
            self.states[SPRINT] = deepcopy(body['team'])
            self.revision += 1
            route.fulfill(json={'revision': self.revision})
            return
        if path == '/api/daily-meter':
            if method == 'POST' and self.daily['meter'] is None:
                self.daily['meter'] = request.post_data_json
            route.fulfill(json=self.daily)
            return
        if path == '/api/mood-meters/catalog':
            route.fulfill(json=[])
            return
        super().api(route)


def run_case(browser, width, height, motion, screenshots):
    context = browser.new_context(viewport={'width': width, 'height': height},
                                  reduced_motion=motion, service_workers='block')
    bootstrap = install_browser_bootstrap(context)
    db = JiraMock()
    context.route('**/api/**', db.api)
    context.route('**/mood-meters/catalog.json', lambda route: route.fulfill(json={'remote': True}))
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    try:
        page.goto(BASE + '/teams?jira=error')
        expect(page.get_by_text('Connexion Jira refusée ou expirée. Réessayez la connexion.')).to_be_visible()
        panel, field = creation_panel(page, width)
        panel.get_by_role('button', name='Sprint Jira', exact=True).click()
        field.fill('Équipe sprint')
        create = panel.get_by_role('button', name='Créer l’équipe', exact=True)
        expect(create).to_be_disabled()
        expect(panel.get_by_role('combobox', name='Site Jira', exact=True)).to_have_count(0)
        panel.get_by_role('combobox', name='Tableau Scrum', exact=True).select_option('1')
        panel.get_by_role('combobox', name='Sprint actif', exact=True).select_option('2')
        expect(create).to_be_enabled()
        panel.get_by_role('combobox', name='Tableau Scrum', exact=True).select_option('')
        expect(panel.get_by_role('combobox', name='Tableau Scrum')).to_have_value('')
        expect(panel.get_by_role('combobox', name='Sprint actif')).to_have_value('')
        expect(create).to_be_disabled()
        panel.get_by_role('combobox', name='Tableau Scrum').select_option('1')
        panel.get_by_role('combobox', name='Sprint actif').select_option('2')
        assert db.board_reads == [CLOUD], db.board_reads
        geometry(page)
        if width in (390, 1366) and motion == 'reduce':
            page.screenshot(path=str(screenshots / f'creation-{width}.png'), full_page=True)
        create.click()
        expect(page).to_have_url(re.compile('/manage-team\\?team=' + SPRINT))
        expect(page.get_by_role('heading', name='Équipe sprint', exact=True)).to_be_visible()
        expect(page.locator('#checkin-name')).to_have_count(0)
        expect(page.get_by_role('button', name=re.compile('Renommer|Retirer .*équipe'))).to_have_count(0)
        expect(page.get_by_role('checkbox')).to_have_count(0)
        expect(page.get_by_role('button', name='Créer le lien participants')).to_have_count(0)
        page.get_by_role('combobox', name='Sprint actif').select_option('3')
        page.get_by_role('button', name='Synchroniser les participants', exact=True).click()
        confirmation = page.get_by_role('dialog', name='Synchroniser le sprint Jira ?', exact=True)
        confirmation.get_by_role('button', name='Annuler').click()
        assert not db.syncs
        page.get_by_role('button', name='Synchroniser les participants', exact=True).click()
        confirmation.get_by_role('button', name='Synchroniser', exact=True).click()
        expect(page.get_by_text('Participants du sprint synchronisés.', exact=True)).to_be_visible()
        assert len(db.syncs) == 1
        for person in db.states[SPRINT]['roster']:
            person['mood'] = 2
        page.goto(BASE + '/mood?team=' + SPRINT)
        if width <= 800:
            page.get_by_role('button', name='Humeurs de l’équipe', exact=True).click()
        page.get_by_role('button', name='Continuer vers le minuteur', exact=False).click()
        expect(page.locator('#start-button')).to_be_enabled()
        first = page.locator('#speaker-name').inner_text()
        page.locator('#start-button').click()
        if width < 1100 or height <= 650:
            page.get_by_role('button', name='Tickets & pense-bête', exact=True).click()
        sidebar = page.locator('[data-speaker-sidebar]')
        first_id = 'jira:a' if first == 'Alice <texte>' else 'jira:b'
        first_prefix = 'DEV' if first_id == 'jira:a' else 'BOB'
        expect(sidebar.get_by_role('button', name=re.compile(first_prefix + '-1 :'))).to_be_visible()
        expect(sidebar).to_contain_text(first_id + ' ticket 1 <texte sûr>')
        expect(sidebar.locator('script, iframe, img')).to_have_count(0)
        sidebar.get_by_role('button', name='Tickets suivants', exact=True).click()
        expect(sidebar).to_contain_text(first_id + ' ticket 6')
        sidebar.get_by_role('button', name=re.compile(first_prefix + '-6 :')).click()
        expect(page.get_by_role('dialog').get_by_role('link', name='Ouvrir dans Jira')).to_have_attribute('href', f'https://example.atlassian.net/browse/{first_prefix}-6')
        page.get_by_role('button', name='Fermer le ticket', exact=True).click()
        sidebar.get_by_role('button', name='Questions', exact=True).click()
        expect(sidebar.get_by_role('heading', name='Le fil du point')).to_be_visible()
        sidebar.get_by_role('button', name='Tickets Jira', exact=True).click()
        expect(sidebar.get_by_role('button', name=re.compile(first_prefix + '-6 :'))).to_be_visible()
        assert db.ticket_reads == ['initial'], db.ticket_reads
        assert db.ticket_statuses == ['all'], db.ticket_statuses
        statuses = sidebar.get_by_role('combobox', name='Sous-statut des tickets Jira', exact=True)
        statuses.select_option('Terminé')
        expect(sidebar.get_by_role('button', name=re.compile(first_prefix + '-4 :'))).to_be_visible()
        expect(sidebar.get_by_role('list')).to_contain_text('Terminé')
        statuses.select_option('Ouvert')
        expect(sidebar.get_by_role('button', name=re.compile(first_prefix + '-5 :'))).to_be_visible()
        expect(sidebar.get_by_role('list')).to_contain_text('Ouvert')
        statuses.select_option('Validation métier')
        expect(sidebar.get_by_role('list')).to_contain_text('Validation métier')
        assert db.ticket_statuses == ['all'], db.ticket_statuses
        statuses.select_option('')
        search = sidebar.get_by_role('searchbox', name='Rechercher un ticket Jira')
        search.fill(first_prefix + '-7')
        expect(sidebar.get_by_role('button', name=re.compile(first_prefix + '-7 :'))).to_be_visible()
        expect(sidebar.get_by_role('button', name=re.compile(first_prefix + '-1 :'))).to_have_count(0)
        search.fill('')
        sidebar.get_by_role('combobox', name='Filtrer les tickets Jira', exact=True).select_option('all')
        expect(sidebar.get_by_role('status').filter(has_text='15 tickets')).to_be_visible()
        search.fill('FREE-1')
        expect(sidebar).to_contain_text('Non attribué')
        expect(sidebar.get_by_role('button', name=re.compile('FREE-1 :'))).to_be_visible()
        sidebar.get_by_role('combobox', name='Filtrer les tickets Jira', exact=True).select_option('speaker')
        expect(sidebar.get_by_role('button', name=re.compile('FREE-1 :'))).to_have_count(0)
        search.fill('')
        assert db.ticket_reads == ['initial'], db.ticket_reads
        db.ticket_error = True
        sidebar.get_by_role('button', name='Actualiser les tickets Jira').click()
        expect(sidebar.get_by_role('alert')).to_contain_text('Session Jira expirée.')
        expect(sidebar.locator('form[action="/api/jira/login"]')).to_have_attribute('method', 'post')
        db.ticket_error = False
        sidebar.get_by_role('button', name='Réessayer', exact=True).click()
        expect(sidebar.get_by_role('button', name=re.compile(first_prefix + '-1 :'))).to_be_visible()
        assert db.ticket_reads == ['initial', '1', '1'], db.ticket_reads
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        if width in (390, 1366) and motion == 'reduce':
            assert_contrast(page, f'Jira speaker tickets {width}')
            page.screenshot(path=str(screenshots / f'tickets-{width}.png'), full_page=True)
        sidebar.get_by_role('combobox', name='Filtrer les tickets Jira', exact=True).select_option('all')
        if width in (390, 1366) and motion == 'reduce':
            page.screenshot(path=str(screenshots / f'board-tickets-{width}.png'), full_page=True)
        page.clock.install()
        page.clock.fast_forward(61_000)
        if width < 1100 or height <= 650:
            sidebar.get_by_role('button', name='Revenir au minuteur').click()
        expect(page.locator('#start-button')).to_contain_text('Pause')
        page.locator('#next-button').click()
        expect(page.locator('#speaker-name')).not_to_have_text(first)
        if width < 1100 or height <= 650:
            page.get_by_role('button', name='Tickets & pense-bête', exact=True).click()
        expect(sidebar).to_contain_text(('jira:b' if first_id == 'jira:a' else 'jira:a') + ' ticket 1')
        expect(sidebar.get_by_role('combobox', name='Filtrer les tickets Jira', exact=True)).to_have_value('speaker')
        assert db.ticket_reads == ['initial'] * 3 + ['1', '1'], db.ticket_reads
        assert db.ticket_statuses == ['indeterminate', 'done', 'new', 'indeterminate', 'indeterminate'], db.ticket_statuses
        page.goto(BASE + '/manage-team?team=' + SPRINT)
        expect(page.get_by_role('button', name='Synchroniser les participants', exact=True)).to_be_disabled()
        bootstrap.assert_no_unexpected_api()
        assert not errors, errors
        print(f'PASS Jira {width}x{height} {motion}: creation/refresh/read-only roster/tickets/reconnect/handoff/meeting lock', flush=True)
    finally:
        bootstrap.assert_no_unexpected_api()
        context.close()


def login_case(browser, width, height):
    context = browser.new_context(viewport={'width': width, 'height': height}, service_workers='block')
    bootstrap = install_browser_bootstrap(context)
    db = JiraMock()
    db.connected = False
    db.teams.append({'id': SPRINT, 'name': 'Sprint verrouillé', 'kind': 'sprint',
                     'jiraLocked': True, 'memberCount': 0, 'category': None})
    context.route('**/api/**', db.api)
    page = context.new_page()
    try:
        page.goto(BASE + '/teams?team=' + SPRINT)
        expect(page.get_by_role('button', name='Ouvrir l’équipe Sprint verrouillé')).to_be_enabled()
        expect(page.get_by_role('button', name='Se connecter à Jira', exact=True)).to_have_count(0)
        for action in ('Ouvrir', 'Gérer'):
            page.get_by_role('button', name=f'{action} l’équipe Sprint verrouillé', exact=True).click()
            dialog = page.get_by_role('dialog', name='Connexion Jira requise')
            expect(dialog).to_be_visible()
            expect(dialog.get_by_role('button', name='Se connecter à Jira', exact=True)).to_be_enabled()
            expect(dialog.locator('form')).to_have_attribute('action', '/api/jira/login')
            assert not db.patches
            dialog.get_by_role('button', name='Annuler', exact=True).click()
            expect(dialog).not_to_be_visible()
        panel, field = creation_panel(page, width)
        expect(panel.get_by_role('button', name='Se connecter à Jira', exact=True)).to_have_count(0)
        panel.get_by_role('button', name='Sprint Jira', exact=True).click()
        expect(panel.get_by_role('button', name='Se connecter à Jira', exact=True)).to_be_enabled()
        expect(panel.locator('form form')).to_have_count(0)
        expect(panel.get_by_role('button', name='Créer l’équipe', exact=True)).to_be_disabled()
        geometry(page)
        page.screenshot(path=str(Path(tempfile.gettempdir()) / f'scrum-jira-login-{width}.png'), full_page=True)
        panel.get_by_role('button', name='Ordinaire', exact=True).click()
        expect(page.get_by_role('button', name='Se connecter à Jira', exact=True)).to_have_count(0)
        bootstrap.assert_no_unexpected_api()
        print(f'PASS Jira contextual login {width}x{height}: creation/open/manage/cancel/locked URL', flush=True)
    finally:
        context.close()


def site_case(browser, unavailable):
    context = browser.new_context(viewport={'width': 390, 'height': 844}, service_workers='block')
    bootstrap = install_browser_bootstrap(context)
    db = JiraMock()
    db.site_error = unavailable
    if not unavailable:
        db.sites = []
    context.route('**/api/**', db.api)
    page = context.new_page()
    try:
        page.goto(BASE + '/teams')
        expect(page.get_by_role('button', name='Ouvrir l’équipe Équipe Atlas', exact=True)).to_be_enabled()
        panel, field = creation_panel(page, 390)
        panel.get_by_role('button', name='Sprint Jira', exact=True).click()
        field.fill('Équipe sprint')
        expect(panel.get_by_role('combobox', name='Site Jira', exact=True)).to_have_count(0)
        expect(panel.get_by_role('combobox', name='Tableau Scrum')).to_be_disabled()
        expect(panel.get_by_role('button', name='Créer l’équipe', exact=True)).to_be_disabled()
        if unavailable:
            alert = panel.get_by_role('alert')
            expect(alert).to_contain_text('Sites Jira indisponibles.')
            assert db.board_reads == []
            db.site_error = False
            alert.get_by_role('button', name='Réessayer', exact=True).click()
            expect(panel.get_by_role('combobox', name='Tableau Scrum')).to_be_enabled()
            panel.get_by_role('combobox', name='Tableau Scrum').select_option('1')
            panel.get_by_role('combobox', name='Sprint actif').select_option('2')
            expect(panel.get_by_role('button', name='Créer l’équipe', exact=True)).to_be_enabled()
            assert db.board_reads == [CLOUD]
        else:
            expect(panel.get_by_role('status').filter(has_text='Aucun site Jira accessible.')).to_be_visible()
            assert db.board_reads == []
        assert not db.creations
        bootstrap.assert_no_unexpected_api()
        print(f'PASS automatic first Jira site: {"retry" if unavailable else "empty"}', flush=True)
    finally:
        context.close()


def ticket_layout_case(browser, width, height, motion, screenshots):
    context = browser.new_context(viewport={'width': width, 'height': height}, reduced_motion=motion, service_workers='block')
    bootstrap = install_browser_bootstrap(context)
    db = JiraMock()
    db.active = SPRINT
    db.teams.append({'id': SPRINT, 'name': 'Équipe sprint', 'kind': 'sprint', 'sprintName': 'Sprint 2', 'memberCount': 2})
    db.states[SPRINT] = team_fixture(roster=[{'id': f'jira:{account}', 'name': name, 'present': True, 'mood': 2, 'moodUpdatedAt': None} for account, name in [('a', 'Alice <texte>'), ('b', 'Bob')]])
    context.route('**/api/**', db.api)
    context.route('**/api/meeting-settings', lambda route: route.fulfill(json={'prompts': ['Hier ?', 'Aujourd’hui ?', 'Des blocages ?'], 'revision': 0}))
    context.route('**/api/daily-hints', lambda route: route.fulfill(json={'day': mauritius_day(), 'hints': []}))
    context.route('**/api/timer-remote', lambda route: route.fulfill(status=503, json={'error': 'Télécommande indisponible dans ce test.'}))
    context.route('**/mood-meters/catalog.json', lambda route: route.fulfill(json={'remote': True}))
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    pending = []
    hold_details = True

    def details(route):
        if hold_details:
            pending.append(route)
        else:
            route.fallback()

    context.route('**/api/jira?action=ticket&*', details)
    try:
        page.goto(BASE + '/mood?team=' + SPRINT)
        if width <= 800:
            page.get_by_role('button', name='Humeurs de l’équipe', exact=True).click()
        page.get_by_role('button', name='Continuer vers le minuteur', exact=False).click()
        page.locator('#start-button').click()
        first = page.locator('#speaker-name').inner_text()
        first_prefix = 'DEV' if first == 'Alice <texte>' else 'BOB'
        compact = width < 1100 or height <= 650
        if compact:
            page.get_by_role('button', name='Tickets & pense-bête', exact=True).click()
        sidebar = page.locator('[data-speaker-sidebar]')
        first_ticket = sidebar.get_by_role('button', name=re.compile(first_prefix + '-1 :'))
        expect(first_ticket).to_be_visible()
        first_ticket.click()
        dialog = page.get_by_role('dialog', name=re.compile('ticket 1'))
        expect(dialog).to_be_visible()
        expect(dialog.get_by_role('status').filter(has_text='Chargement du ticket')).to_be_visible()
        page.wait_for_timeout(100)
        assert len(pending) == 1
        pending.pop().fulfill(status=503, json={'error': 'Ticket momentanément indisponible.'})
        expect(dialog.get_by_role('alert')).to_contain_text('Ticket momentanément indisponible.')
        hold_details = False
        dialog.get_by_role('button', name='Réessayer', exact=True).click()
        expect(dialog.get_by_role('heading', name='Description', exact=True)).to_be_visible()
        expect(dialog).to_contain_text('Story Points')
        expect(dialog).to_contain_text('Critères d’acceptation')
        expect(dialog).to_contain_text('<img src=x onerror=alert(1)>')
        expect(dialog.locator('script, iframe, img')).to_have_count(0)
        expect(dialog.get_by_role('link', name='Ouvrir dans Jira', exact=True)).to_have_attribute('href', f'https://example.atlassian.net/browse/{first_prefix}-1')
        expect(dialog.get_by_role('button', name='Fermer le ticket', exact=True)).to_be_focused()
        active = page.locator('#speaker-name').inner_text()
        page.keyboard.press('n')
        expect(page.locator('#speaker-name')).to_have_text(active)
        box = dialog.bounding_box()
        assert box['x'] >= 0 and box['x'] + box['width'] <= width + 1 and box['y'] >= 0 and box['y'] + box['height'] <= height + 1, box
        assert dialog.evaluate('(root) => root.scrollWidth <= root.clientWidth')
        if motion == 'reduce':
            page.screenshot(path=str(screenshots / f'jira-ticket-detail-{width}.png'))
        page.keyboard.press('Escape')
        expect(dialog).not_to_be_visible()
        expect(first_ticket).to_be_focused()
        assert db.detail_reads == [first_prefix + '-1']
        detail_search = sidebar.get_by_role('searchbox', name='Rechercher un ticket Jira')
        detail_search.fill(first_prefix + '-2')
        sidebar.get_by_role('button', name=re.compile(first_prefix + '-2 :')).click()
        partial = page.get_by_role('dialog', name=re.compile('ticket 2'))
        expect(partial).to_contain_text('Critères d’acceptation')
        expect(partial.get_by_role('status')).to_contain_text('Estimation indisponible')
        expect(partial.locator('form[action="/api/jira/login"]')).to_have_count(0)
        partial.get_by_role('button', name='Fermer le ticket', exact=True).click()
        expect(partial).not_to_be_visible()
        detail_search.fill('')
        sidebar.get_by_role('button', name='Tickets suivants', exact=True).click()
        expect(sidebar.get_by_role('button', name=re.compile(first_prefix + '-6 :'))).to_be_visible()
        status = sidebar.get_by_role('combobox', name='Sous-statut des tickets Jira', exact=True)
        expect(status.locator('optgroup')).to_have_count(3)
        for value, label in [('Terminé', 'Terminé'), ('Ouvert', 'Ouvert'), ('Validation métier', 'Validation métier'), ('En recette', 'En recette'), ('En attente externe', 'En attente externe')]:
            status.select_option(value)
            expect(sidebar.get_by_role('list')).to_contain_text(label)
            expect(sidebar.get_by_role('listitem')).to_have_count(1)
        assert db.ticket_reads == ['initial'], db.ticket_reads
        status.select_option('')
        scope = sidebar.get_by_role('combobox', name='Filtrer les tickets Jira', exact=True)
        scope.select_option('all')
        search = sidebar.get_by_role('searchbox', name='Rechercher un ticket Jira')
        search.fill('FREE-1')
        sidebar.get_by_role('button', name=re.compile('FREE-1 :')).click()
        unassigned = page.get_by_role('dialog', name=re.compile('Non attribué ticket'))
        expect(unassigned).to_contain_text('Aucune description renseignée.')
        expect(unassigned).to_contain_text('Story points')
        unassigned.get_by_role('button', name='Fermer le ticket', exact=True).click()
        expect(unassigned).not_to_be_visible()
        db.long_title = True
        search.fill(first_prefix + '-7')
        sidebar.get_by_role('button', name=re.compile(first_prefix + '-7 :')).click()
        long_dialog = page.get_by_role('dialog', name='W' * 255, exact=True)
        expect(long_dialog).to_be_visible()
        body = long_dialog.locator('.MuiDialogContent-root')
        assert body.evaluate('element => element.clientHeight >= 100 && element.scrollWidth <= element.clientWidth')
        long_dialog.get_by_role('heading', name='Description', exact=True).scroll_into_view_if_needed()
        link_box = long_dialog.get_by_role('link', name='Ouvrir dans Jira', exact=True).bounding_box()
        assert link_box['y'] >= 0 and link_box['y'] + link_box['height'] <= height, link_box
        if motion == 'reduce':
            page.screenshot(path=str(screenshots / f'jira-ticket-long-{width}.png'))
        long_dialog.get_by_role('button', name='Fermer le ticket', exact=True).click()
        expect(long_dialog).not_to_be_visible()
        db.long_title = False
        scope.select_option('speaker')
        expect(sidebar.get_by_role('button', name=re.compile('FREE-1 :'))).to_have_count(0)
        search.fill('')
        db.ticket_error = True
        sidebar.get_by_role('button', name='Actualiser les tickets Jira').click()
        expect(sidebar.get_by_role('alert')).to_contain_text('Session Jira expirée.')
        db.ticket_error = False
        sidebar.get_by_role('button', name='Réessayer', exact=True).click()
        expect(sidebar.get_by_role('button', name=re.compile(first_prefix + '-1 :'))).to_be_visible()
        sidebar.get_by_role('button', name='Questions', exact=True).click()
        expect(sidebar.get_by_role('heading', name='Le fil du point')).to_be_visible()
        sidebar.get_by_role('button', name='Tickets Jira', exact=True).click()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        if motion == 'reduce':
            assert_contrast(page, f'Jira compact layout {width}')
            page.screenshot(path=str(screenshots / f'jira-redesign-{width}.png'))
        if compact:
            sidebar.get_by_role('button', name='Revenir au minuteur').click()
        page.locator('#next-button').click()
        expect(page.locator('#speaker-name')).not_to_have_text(first)
        if compact:
            page.get_by_role('button', name='Tickets & pense-bête', exact=True).click()
        expect(scope).to_have_value('speaker')
        expect(sidebar.get_by_role('button', name=re.compile(('BOB' if first_prefix == 'DEV' else 'DEV') + '-1 :'))).to_be_visible()
        bootstrap.assert_no_unexpected_api()
        assert not errors, errors
        print(f'PASS compact Jira {width}x{height} {motion}: detail modal/loading/retry/safe text/keyboard/focus/empty fields, filters/pagination/handoff')
    finally:
        context.close()


def main():
    if urlparse(BASE).hostname not in ('localhost', '127.0.0.1'):
        raise ValueError('Local mocked preview only')
    parser = ArgumentParser()
    parser.add_argument('--tickets-only', action='store_true', help='Validate the timer sidebar independently of team creation.')
    args = parser.parse_args()
    screenshots = Path(tempfile.mkdtemp(prefix='scrum-jira-'))
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            if args.tickets_only:
                for motion in ('reduce', 'no-preference'):
                    for width, height in SIZES + [(568, 320)]:
                        ticket_layout_case(browser, width, height, motion, screenshots)
                print(f'PASS compact Jira journeys. Screenshots: {screenshots}', flush=True)
                return
            for unavailable in (False, True):
                site_case(browser, unavailable)
            for width, height in (SIZES[1], SIZES[3]):
                login_case(browser, width, height)
            for motion in ('reduce', 'no-preference'):
                for width, height in SIZES:
                    run_case(browser, width, height, motion, screenshots)
        finally:
            browser.close()
    print(f'PASS 12/12 Jira journeys. Screenshots: {screenshots}', flush=True)


if __name__ == '__main__':
    main()