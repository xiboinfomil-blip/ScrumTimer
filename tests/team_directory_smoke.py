"""Team directory regression: browser-only stateful mocks, never live API writes.

Run with Python against the existing localhost:3001 development server. Screenshots
go to a fresh OS temporary directory, not the repository. Unknown APIs fail closed.
"""
import os
import re
import tempfile
from copy import deepcopy
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright

from browser_bootstrap import install_browser_bootstrap, mauritius_day, team_fixture


BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3001').rstrip('/')
SIZES = [(320, 568), (360, 640), (390, 844), (540, 720), (650, 568), (768, 1024),
         (820, 900), (1024, 576), (1100, 620), (1280, 720), (1366, 768), (1920, 1080)]
STRESS_SIZES = [(320, 568), (390, 844), (820, 900), (1280, 720)]
ACTIVE, OTHER, UNCLASSIFIED = ('a' * 64, 'b' * 64, 'c' * 64)
CATEGORIES = ['Tech', 'Produit', 'Support', 'Marketing']


class DirectoryMock:
    def __init__(self):
        self.teams = [
            {'id': ACTIVE, 'name': 'Équipe Atlas', 'memberCount': 1, 'category': 'Tech', 'favorite': False},
            {'id': OTHER, 'name': 'Équipe Boréal', 'memberCount': 1, 'category': 'Produit', 'favorite': True},
            {'id': UNCLASSIFIED, 'name': 'Équipe Cobalt', 'memberCount': 0, 'category': None, 'favorite': False},
        ]
        self.active = ACTIVE
        self.patches, self.creations, self.scoped_reads = [], [], []
        self.fail_next = False
        self.states = {ACTIVE: team_fixture(['Alice témoin']), OTHER: team_fixture(['Bob témoin']),
                       UNCLASSIFIED: team_fixture()}

    def listing(self):
        return {'teams': deepcopy(self.teams), 'activeTeamId': self.active}

    def api(self, route):
        request = route.request
        path, method = urlparse(request.url).path, request.method
        if path == '/api/jira' and method == 'GET':
            assert parse_qs(urlparse(request.url).query).get('action', ['status']) == ['status']
            route.fulfill(json={'configured': False, 'connected': False})
            return
        if path == '/api/teams' and method in ('GET', 'PATCH', 'POST'):
            if method == 'PATCH':
                body = request.post_data_json
                self.patches.append(deepcopy(body))
                assert set(body) in ({'teamId', 'favorite'}, {'teamId', 'category'}), body
                target = next(team for team in self.teams if team['id'] == body['teamId'])
                if self.fail_next:
                    self.fail_next = False
                    route.fulfill(status=503, json={'error': 'Échec simulé du classement.'})
                    return
                if 'favorite' in body:
                    assert type(body['favorite']) is bool, body
                    target['favorite'] = body['favorite']
                else:
                    assert body['category'] is None or body['category'] in CATEGORIES, body
                    target['category'] = body['category']
                # Metadata never changes the authoritative active team.
            elif method == 'POST':
                body = request.post_data_json
                assert set(body) == {'name', 'category'}, body
                assert body['category'] in CATEGORIES, body
                self.creations.append(deepcopy(body))
                self.active = f'{len(self.teams) + 100:064x}'
                self.teams.append({'id': self.active, 'name': body['name'], 'category': body['category'],
                                   'favorite': False, 'memberCount': 0})
                self.states[self.active] = team_fixture()
            route.fulfill(json=self.listing())
            return
        if method == 'GET' and path in ('/api/team', '/api/history', '/api/daily-hints', '/api/meeting-settings'):
            team_id = request.headers.get('x-team-id')
            assert team_id in self.states, (path, team_id)
            self.scoped_reads.append((path, team_id))
            payloads = {
                '/api/team': {'team': deepcopy(self.states[team_id]), 'revision': 1},
                '/api/history': {'rounds': [], 'day': mauritius_day()},
                '/api/daily-hints': {'day': mauritius_day(), 'hints': []},
                '/api/meeting-settings': {'prompts': ['Hier ?', 'Aujourd’hui ?', 'Des blocages ?'], 'revision': 0},
            }
            route.fulfill(json=payloads[path])
            return
        # This reaches the bootstrap's 501 guard, never the actual server API.
        route.fallback()


def listing(page):
    return page.get_by_role('list', name='Équipes disponibles', exact=True)


def card(page, name):
    return listing(page).get_by_role('listitem').filter(has=page.get_by_role('heading', name=name, exact=True))


def category(page, name):
    return page.get_by_role('combobox', name=f'Catégorie de {name}', exact=True)


def favorite(page, name, selected):
    action = 'Retirer des favoris' if selected else 'Ajouter aux favoris'
    return page.get_by_role('button', name=f'{action} : {name}', exact=True)


def active_unchanged(page, db, reads, url):
    expect(card(page, 'Équipe Atlas').get_by_text('Actuelle', exact=True)).to_be_visible()
    expect(page.get_by_role('button', name='Choisir une équipe : Équipe Atlas', exact=True)).to_be_enabled()
    assert page.url == url, (url, page.url)
    assert parse_qs(urlparse(page.url).query)['team'] == [ACTIVE]
    assert db.active == ACTIVE
    assert db.scoped_reads == reads, 'Directory metadata unexpectedly rehydrated/reset the active team'
    assert db.states[ACTIVE]['roster'][0]['name'] == 'Alice témoin'


def geometry(page):
    # Let finite list/press transitions settle, without freezing motion or requiring
    # controls to fit in the viewport: the directory is intentionally scrollable.
    root = page.locator('[aria-labelledby="teams-heading"]:visible')
    dialog = page.get_by_role('dialog', name='Ajouter une nouvelle équipe', exact=True)
    if dialog.is_visible():
        root = dialog
    expect(root).to_have_count(1)  # App Router may briefly retain a hidden previous tree.
    root.evaluate('''async root => {
        await Promise.all(root.getAnimations({subtree: true})
            .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
            .map(animation => animation.finished.catch(() => {})));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }''')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Horizontal page overflow'
    failures = root.evaluate('''root => {
        // Native labels wrap their select/input by design; they are not controls.
        const selector = 'button, input:not([type="hidden"]), select, textarea, a[href]';
        const visibleBounds = el => {
            const rect = el.getBoundingClientRect();
            let left = rect.left, right = rect.right, top = rect.top, bottom = rect.bottom;
            for (let parent = el.parentElement; parent; parent = parent.parentElement) {
                const style = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
                if (/auto|scroll|hidden|clip/.test(style.overflowX)) {
                    left = Math.max(left, bounds.left); right = Math.min(right, bounds.right);
                }
                if (/auto|scroll|hidden|clip/.test(style.overflowY)) {
                    top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom);
                }
            }
            return {left, right, top, bottom, width: right - left, height: bottom - top};
        };
        const visible = el => {
            const style = getComputedStyle(el), r = visibleBounds(el);
            return r.width > 0 && r.height > 0 && style.visibility !== 'hidden'
                && style.visibility !== 'collapse' && el.checkVisibility();
        };
        const describe = el => el.getAttribute('aria-label') || el.id || el.textContent.trim();
        const controls = [...root.querySelectorAll(selector)].filter(visible);
        const failures = {small: [], intersections: [], outsideCards: []};
        for (const [index, el] of controls.entries()) {
            const r = el.getBoundingClientRect();
            if (r.width < 43.99 || r.height < 43.99)
                failures.small.push({name: describe(el), width: r.width, height: r.height});
            for (const other of controls.slice(index + 1)) {
                if (el.contains(other) || other.contains(el)) continue;
                const visibleRect = visibleBounds(el), s = visibleBounds(other);
                const width = Math.min(visibleRect.right, s.right) - Math.max(visibleRect.left, s.left);
                const height = Math.min(visibleRect.bottom, s.bottom) - Math.max(visibleRect.top, s.top);
                if (width > .01 && height > .01)
                    failures.intersections.push({first: describe(el), second: describe(other), width, height});
            }
            const card = el.closest('li, [role="listitem"]');
            if (!card || !card.closest('[aria-label="Équipes disponibles"]')) continue;
            const bounds = card.getBoundingClientRect();
            if (r.left < bounds.left - .01 || r.right > bounds.right + .01
                || r.top < bounds.top - .01 || r.bottom > bounds.bottom + .01)
                failures.outsideCards.push({name: describe(el), card: card.textContent.trim(),
                    control: r.toJSON(), bounds: bounds.toJSON()});
        }
        return failures;
    }''')
    assert not any(failures.values()), f'Directory geometry: {failures}'


def screenshot(page, screenshots, name):
    destination = screenshots / f'{name}.png'
    page.screenshot(path=str(destination), full_page=True, animations='disabled')
    print(f'SCREENSHOT {destination}', flush=True)


def creation_panel(page, width):
    button = page.get_by_role('button', name='Ajouter une nouvelle équipe', exact=True)
    button.scroll_into_view_if_needed()
    expect(button).to_be_in_viewport()
    button.click()
    panel = page.get_by_role('dialog', name='Ajouter une nouvelle équipe', exact=True)
    field = panel.get_by_role('textbox', name='Nom de l’équipe', exact=True)
    field.scroll_into_view_if_needed()
    expect(field).to_be_in_viewport()
    expect(field).to_be_focused()
    return panel, field


def run_case(browser, width, height, motion, screenshots):
    context = browser.new_context(viewport={'width': width, 'height': height},
                                  reduced_motion=motion, service_workers='block')
    bootstrap = install_browser_bootstrap(context)
    db = DirectoryMock()
    context.route('**/api/**', db.api)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    try:
        page.goto(f'{BASE}/teams?team={ACTIVE}')
        expect(listing(page).get_by_role('listitem')).to_have_count(3)
        expect(favorite(page, 'Équipe Atlas', False)).to_be_enabled()
        geometry(page)
        expect(page.get_by_role('textbox', name='Nom de l’équipe', exact=True)).to_have_count(0)
        panel, field = creation_panel(page, width)
        field.fill('Brouillon annulé')
        geometry(page)
        panel.get_by_role('button', name='Annuler', exact=True).click()
        expect(panel).not_to_be_visible()
        opener = page.get_by_role('button', name='Ajouter une nouvelle équipe', exact=True)
        expect(opener).to_be_focused()
        panel, field = creation_panel(page, width)
        field.fill('')
        panel.get_by_role('button', name='Créer l’équipe', exact=True).click()
        expect(panel.get_by_role('alert')).to_contain_text('Choisissez un nom')
        expect(field).to_be_focused()
        page.keyboard.press('Escape')
        expect(panel).not_to_be_visible()
        expect(opener).to_be_focused()
        assert not db.creations
        if motion == 'reduce':
            screenshot(page, screenshots, f'team-directory-{width}x{height}')

        search = page.get_by_role('searchbox', name='Rechercher une équipe', exact=True)
        search.fill('tech')  # Category text, not a team name.
        expect(listing(page).get_by_role('listitem')).to_have_count(1)
        expect(card(page, 'Équipe Atlas')).to_be_visible()
        search.fill('boreal')  # Accent-insensitive name search.
        expect(card(page, 'Équipe Boréal')).to_be_visible()
        expect(listing(page).get_by_role('listitem')).to_have_count(1)
        search.fill('')
        select = page.get_by_role('combobox', name='Filtrer par catégorie', exact=True)
        assert select.locator('option').all_text_contents() == ['Toutes les catégories', *CATEGORIES, 'Sans catégorie']
        for value, name in [('Tech', 'Équipe Atlas'), ('Produit', 'Équipe Boréal'), ('none', 'Équipe Cobalt')]:
            select.select_option(value)
            expect(listing(page).get_by_role('listitem')).to_have_count(1)
            expect(card(page, name)).to_be_visible()
        select.select_option('')

        reads, original_url = deepcopy(db.scoped_reads), page.url
        category(page, 'Équipe Boréal').select_option('Support')
        expect(category(page, 'Équipe Boréal')).to_have_value('Support')
        expect(category(page, 'Équipe Boréal')).to_be_enabled()
        assert db.patches[-1] == {'teamId': OTHER, 'category': 'Support'}
        active_unchanged(page, db, reads, original_url)
        # Absolute null assignment is not an omitted value or implicit selection.
        category(page, 'Équipe Cobalt').select_option('Tech')
        expect(category(page, 'Équipe Cobalt')).to_be_enabled()
        category(page, 'Équipe Cobalt').select_option('')
        expect(category(page, 'Équipe Cobalt')).to_be_enabled()
        assert db.patches[-1] == {'teamId': UNCLASSIFIED, 'category': None}

        favorite(page, 'Équipe Atlas', False).click()
        expect(favorite(page, 'Équipe Atlas', True)).to_have_attribute('aria-pressed', 'true')
        expect(favorite(page, 'Équipe Atlas', True)).to_be_enabled()
        assert db.patches[-1] == {'teamId': ACTIVE, 'favorite': True}
        views = page.get_by_role('group', name='Afficher les équipes', exact=True)
        views.get_by_role('button', name='Favorites', exact=True).click()
        expect(listing(page).get_by_role('listitem')).to_have_count(2)
        favorite(page, 'Équipe Boréal', True).click()
        expect(listing(page).get_by_role('listitem')).to_have_count(1)
        assert db.patches[-1] == {'teamId': OTHER, 'favorite': False}
        favorite(page, 'Équipe Atlas', True).click()
        expect(page.get_by_text('Aucune équipe favorite dans cette sélection.', exact=True)).to_be_visible()
        page.get_by_role('button', name='Afficher toutes les équipes', exact=True).click()
        favorite(page, 'Équipe Atlas', False).click()
        expect(favorite(page, 'Équipe Atlas', True)).to_be_enabled()
        active_unchanged(page, db, reads, original_url)

        # Failed assignments must leave both the visible and durable mock unchanged.
        db.fail_next = True
        category(page, 'Équipe Boréal').select_option('Marketing')
        expect(page.get_by_text('Classement non confirmé. Réessayez ou rechargez pour vérifier le choix enregistré.', exact=True)).to_be_visible()
        expect(category(page, 'Équipe Boréal')).to_have_value('Support')
        expect(category(page, 'Équipe Boréal')).to_be_enabled()
        assert db.teams[1]['category'] == 'Support'
        active_unchanged(page, db, reads, original_url)
        category(page, 'Équipe Boréal').select_option('Marketing')
        expect(category(page, 'Équipe Boréal')).to_have_value('Marketing')
        expect(category(page, 'Équipe Boréal')).to_be_enabled()
        db.fail_next = True
        favorite(page, 'Équipe Atlas', True).click()
        expect(favorite(page, 'Équipe Atlas', True)).to_be_enabled()
        assert db.teams[0]['favorite'] is True
        favorite(page, 'Équipe Atlas', True).click()
        expect(favorite(page, 'Équipe Atlas', False)).to_be_enabled()
        favorite(page, 'Équipe Atlas', False).click()
        expect(favorite(page, 'Équipe Atlas', True)).to_be_enabled()

        page.reload()
        expect(category(page, 'Équipe Boréal')).to_have_value('Marketing')
        expect(favorite(page, 'Équipe Atlas', True)).to_be_enabled()
        expect(card(page, 'Équipe Atlas').get_by_text('Actuelle', exact=True)).to_be_visible()
        assert parse_qs(urlparse(page.url).query)['team'] == [ACTIVE]
        # Real client navigation proves that the original roster still hydrates.
        page.get_by_role('link', name='Participants', exact=True).click()
        expect(page.get_by_text('Alice témoin', exact=True)).to_be_visible()
        expect(page).to_have_url(re.compile(r'/participants\?team=' + ACTIVE + '$'))
        page.goto(f'{BASE}/teams?team={ACTIVE}')
        expect(favorite(page, 'Équipe Atlas', True)).to_be_enabled()

        # >6 entries: pagination resets after filtering and keeps focus accessible.
        for index in range(4):
            team_id = f'{index + 10:064x}'
            db.teams.append({'id': team_id, 'name': f'Équipe supplémentaire {index}',
                             'memberCount': 0, 'category': 'Tech', 'favorite': False})
            db.states[team_id] = team_fixture()
        page.reload()
        expect(listing(page).get_by_role('listitem')).to_have_count(6)
        next_page = page.get_by_role('button', name='Page suivante des équipes', exact=True)
        next_page.click()
        expect(listing(page).get_by_role('listitem')).to_have_count(1)
        expect(page.locator('#team-list-heading')).to_be_focused()
        expect(next_page).to_be_disabled()
        page.get_by_role('button', name='Page précédente des équipes', exact=True).click()
        expect(listing(page).get_by_role('listitem')).to_have_count(6)
        search.fill('atlas')
        expect(listing(page).get_by_role('listitem')).to_have_count(1)
        expect(page.get_by_role('navigation', name='Pagination des équipes', exact=True)).to_have_count(0)
        search.fill('')
        geometry(page)

        for selected_category in ('Tech', 'Marketing'):
            panel, field = creation_panel(page, width)
            expect(panel.get_by_role('button', name='Tech', exact=True)).to_have_attribute('aria-pressed', 'true')
            if selected_category != 'Tech':
                panel.get_by_role('button', name=selected_category, exact=True).click()
            expect(panel.get_by_role('button', name=selected_category, exact=True)).to_have_attribute('aria-pressed', 'true')
            name = f'Nouvelle équipe {selected_category}'
            field.fill(name)
            geometry(page)
            submit = panel.get_by_role('button', name='Créer l’équipe', exact=True)
            submit.scroll_into_view_if_needed()
            expect(submit).to_be_in_viewport()
            submit.click()
            expect(page).to_have_url(re.compile(r'/manage-team\?team=[a-f0-9]{64}$'))
            expect(page.get_by_role('heading', name=name, exact=True)).to_be_visible()
            expect(page.get_by_role('region', name='Gérer les membres', exact=True)).to_be_visible()
            assert db.creations[-1] == {'name': name, 'category': selected_category}
            assert parse_qs(urlparse(page.url).query)['team'] == [db.active]
            assert db.teams[-1]['category'] == selected_category
            page.goto(f'{BASE}/teams?team={db.active}')
            expect(page.get_by_role('button', name=f'Choisir une équipe : {name}', exact=True)).to_be_enabled()
        assert len(db.creations) == 2
        bootstrap.assert_no_unexpected_api()
        assert not errors, errors
        print(f'PASS {width}x{height} {motion}: filters/favorites/categories/no-selection/reload/errors/recovery/pagination/creation', flush=True)
    finally:
        bootstrap.assert_no_unexpected_api()
        context.close()


def run_stress_case(browser, width, height, screenshots):
    """Independent 60-character/40-team and truly empty directory fixtures."""
    context = browser.new_context(viewport={'width': width, 'height': height},
                                  reduced_motion='reduce', service_workers='block')
    bootstrap = install_browser_bootstrap(context)
    db = DirectoryMock()
    db.teams, db.states = [], {}
    for index in range(40):
        team_id = ACTIVE if index == 0 else f'{index + 1000:064x}'
        prefix = f'Équipe {index:02d} '
        # Both normal word wrapping and a long unbroken token at the supported limit.
        suffix = ('collaboration ' * 6) if index % 2 == 0 else ('W' * 60)
        name = (prefix + suffix)[:60]
        assert len(name) == 60
        db.teams.append({'id': team_id, 'name': name, 'memberCount': 0,
                         'category': CATEGORIES[index % len(CATEGORIES)], 'favorite': False})
        db.states[team_id] = team_fixture()
    context.route('**/api/**', db.api)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    try:
        page.goto(f'{BASE}/teams?team={ACTIVE}')
        expect(listing(page).get_by_role('listitem')).to_have_count(6)
        expect(favorite(page, db.teams[0]['name'], False)).to_be_enabled()
        pagination = page.get_by_role('navigation', name='Pagination des équipes', exact=True)
        previous = pagination.get_by_role('button', name='Page précédente des équipes', exact=True)
        following = pagination.get_by_role('button', name='Page suivante des équipes', exact=True)
        seen = []
        for number in range(7):
            expected = db.teams[number * 6:(number + 1) * 6]
            expect(listing(page).get_by_role('listitem')).to_have_count(len(expected))
            headings = listing(page).get_by_role('heading')
            expect(headings).to_have_text([team['name'] for team in expected])
            expect(pagination.get_by_role('status')).to_have_text(f'{number + 1}sur 7')
            expect(previous).to_be_disabled() if number == 0 else expect(previous).to_be_enabled()
            geometry(page)
            seen.extend(headings.all_text_contents())
            if number in (0, 6):
                screenshot(page, screenshots, f'team-directory-long-{width}x{height}-page-{number + 1}')
            if number < 6:
                following.click()
                expect(page.locator('#team-list-heading')).to_be_focused()
        assert len(seen) == len(set(seen)) == 40
        expect(following).to_be_disabled()
        for number in range(5, -1, -1):
            previous.click()
            expect(page.locator('#team-list-heading')).to_be_focused()
            expect(listing(page).get_by_role('heading')).to_have_text(
                [team['name'] for team in db.teams[number * 6:(number + 1) * 6]])
            geometry(page)
        assert not db.patches and not db.creations

        # Reset only the in-memory mock; no delete, seed, or other live API writes.
        db.teams, db.states, db.active = [], {}, None
        page.goto(f'{BASE}/teams')
        expect(page.get_by_text('Votre première équipe commence ici.', exact=True)).to_be_visible()
        expect(listing(page)).to_have_count(0)
        expect(pagination).to_have_count(0)
        geometry(page)
        page.get_by_role('button', name='Nommer mon équipe', exact=True).click()
        panel = page.get_by_role('dialog', name='Ajouter une nouvelle équipe', exact=True)
        field = panel.get_by_role('textbox', name='Nom de l’équipe', exact=True)
        expect(field).to_be_focused()
        expect(field).to_have_attribute('maxlength', '60')
        name = 'Première équipe ' + 'W' * (60 - len('Première équipe '))
        field.fill(name)
        expect(field).to_have_value(name)
        geometry(page)
        screenshot(page, screenshots, f'team-directory-empty-create-{width}x{height}')
        panel.get_by_role('button', name='Créer l’équipe', exact=True).click()
        expect(page).to_have_url(re.compile(r'/manage-team\?team=[a-f0-9]{64}$'))
        expect(page.get_by_role('heading', name=name, exact=True)).to_be_visible()
        expect(page.get_by_role('region', name='Gérer les membres', exact=True)).to_be_visible()
        assert db.creations == [{'name': name, 'category': 'Tech'}]
        assert len(db.teams) == 1 and db.teams[0]['id'] == db.active
        page.goto(f'{BASE}/teams?team={db.active}')
        expect(listing(page).get_by_role('listitem')).to_have_count(1)
        expect(card(page, name).get_by_text('Actuelle', exact=True)).to_be_visible()
        geometry(page)
        bootstrap.assert_no_unexpected_api()
        assert not errors, errors
        print(f'PASS stress {width}x{height}: 60-character names/40 teams/7 pages of 6/focus/empty creation', flush=True)
    finally:
        bootstrap.assert_no_unexpected_api()
        context.close()


def main():
    if urlparse(BASE).hostname not in ('localhost', '127.0.0.1'):
        raise ValueError('This suite only runs against a local server')
    screenshots = Path(tempfile.mkdtemp(prefix='scrum-team-directory-'))
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            for motion in ('reduce', 'no-preference'):
                for width, height in SIZES:
                    run_case(browser, width, height, motion, screenshots)
            for width, height in STRESS_SIZES:
                run_stress_case(browser, width, height, screenshots)
        finally:
            browser.close()
        total = len(SIZES) * 2 + len(STRESS_SIZES)
        print(f'PASS {total}/{total}: {len(SIZES) * 2} viewport/motion + '
            f'{len(STRESS_SIZES)} long-name/pagination/empty cases. Screenshots: {screenshots}', flush=True)


if __name__ == '__main__':
    main()