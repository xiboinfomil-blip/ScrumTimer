"""Manage-team design/journeys against an EXISTING dev server; mocked APIs only.

Run: python tests/manage_team_design_smoke.py
Defaults to http://localhost:3001 (BROWSER_TEST_URL may override). No real API
probes, environment-file reads, database access, app edits or server startup.
Screenshots go to the OS temp directory. Failures are collected per case so
geometry defects do not prevent independent journey/stress coverage.
"""
import os
import tempfile
from copy import deepcopy
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright

from browser_bootstrap import install_browser_bootstrap, team_fixture


BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3001').rstrip('/')
TEAM, OTHER = 'b' * 64, 'a' * 64
NAME = 'Équipe Élan'
LINK = 'https://participants.example/t/design-fixture-only'
SHARE_ERROR = 'Partage indisponible pour ce test.'
NAMES = ['Élodie', 'Alice', 'Benoît', 'Chloé', 'Désiré', 'Fatima',
         'Guillaume', 'Hélène', 'Inès', 'Jean <texte>', 'Zoë']
SIZES = [(320, 568), (390, 844), (650, 568), (820, 900),
         (1024, 576), (1280, 720), (1366, 768), (1920, 1080)]


class MockAPI:
    def __init__(self, names):
        self.team = team_fixture(names)
        self.other = team_fixture(['Autre équipe, ne pas modifier'])
        self.revision = 1
        self.writes = []
        self.share_error = False

    def route(self, route):
        request = route.request
        path, method = urlparse(request.url).path, request.method
        if path == '/api/jira' and method == 'GET':
            route.fulfill(json={'configured': False, 'connected': False})
        elif path == '/api/teams' and method == 'GET':
            # Deliberately NOT the first/default team: URL context must win.
            route.fulfill(json={'teams': [
                {'id': OTHER, 'name': 'Autre équipe', 'memberCount': 1},
                {'id': TEAM, 'name': NAME, 'memberCount': len(self.team['roster'])}],
                'activeTeamId': OTHER})
        elif path in ('/api/team', '/api/history') and method == 'GET':
            assert request.headers.get('x-team-id') == TEAM, request.url
            route.fulfill(json=({'team': deepcopy(self.team), 'revision': self.revision}
                                if path == '/api/team' else {'rounds': []}))
        elif path == '/api/team' and method == 'PUT':
            assert request.headers.get('x-team-id') == TEAM
            body = request.post_data_json
            assert body['revision'] == self.revision, body
            self.team = deepcopy(body['team'])
            self.revision += 1
            self.writes.append((method, path, deepcopy(body)))
            route.fulfill(json={'team': deepcopy(self.team), 'revision': self.revision})
        elif path == '/api/participant-link' and method == 'POST':
            assert request.headers.get('x-team-id') == TEAM
            assert not request.post_data, 'Sharing must not transmit roster data'
            self.writes.append((method, path, None))
            route.fulfill(status=503 if self.share_error else 200,
                          json={'error': SHARE_ERROR} if self.share_error else {'url': LINK})
        else:
            # In particular DELETE is NEVER fulfilled as a successful mutation.
            route.fallback()


def settle(page):
    page.wait_for_function('''() => !document.getAnimations().some(a =>
        a.playState === 'running' && Number.isFinite(a.effect?.getTiming().iterations))''')
    page.evaluate('async () => { for (let i=0;i<4;i++) await new Promise(requestAnimationFrame); }')


def saved(page):
    expect(page.locator('.site-header [role="status"]')).to_have_attribute(
        'title', 'Équipe enregistrée dans Neon.')


def correct_team_link(link, path):
    href = urlparse(link.get_attribute('href'))
    assert href.path == path and parse_qs(href.query) == {'team': [TEAM]}, href


def controls_fit(scope, width):
    """Measure rendered hit targets, not MUI's small inner text input glyph box."""
    geometry = scope.evaluate('''root => [...root.querySelectorAll(
        'button,a,input,summary')].filter(e => e.getClientRects().length).map(e => {
        const target = e.closest('.MuiCheckbox-root,.MuiInputBase-root') || e;
        const r = target.getBoundingClientRect();
        let left=r.left, right=r.right, top=r.top, bottom=r.bottom;
        for (let parent=e.parentElement; parent; parent=parent.parentElement) {
            const style=getComputedStyle(parent), b=parent.getBoundingClientRect();
            if (/auto|scroll|hidden|clip/.test(style.overflowX)) { left=Math.max(left,b.left); right=Math.min(right,b.right); }
            if (/auto|scroll|hidden|clip/.test(style.overflowY)) { top=Math.max(top,b.top); bottom=Math.min(bottom,b.bottom); }
        }
        left=Math.max(left,0); right=Math.min(right,innerWidth);
        top=Math.max(top,0); bottom=Math.min(bottom,innerHeight);
        return {name:e.getAttribute('aria-label') || e.textContent || e.id,
            x:r.x,y:r.y,w:r.width,h:r.height,
            visible:{x:left,y:top,w:Math.max(0,right-left),h:Math.max(0,bottom-top)}};
    })''')
    assert geometry, 'No controls found'
    for box in geometry:
        assert box['h'] >= 43.99 and box['w'] >= 43.99, ('44px control', box)
        assert box['x'] >= -1 and box['x'] + box['w'] <= width + 1, box
    # Distinct actionable targets must not overlap; no label/wrapper duplicates.
    for index, first in enumerate(geometry):
        for second in geometry[index + 1:]:
            a, b = first['visible'], second['visible']
            if not a['w'] or not a['h'] or not b['w'] or not b['h']:
                continue
            overlap_x = min(a['x'] + a['w'], b['x'] + b['w']) - max(a['x'], b['x'])
            overlap_y = min(a['y'] + a['h'], b['y'] + b['h']) - max(a['y'], b['y'])
            assert overlap_x <= 1 or overlap_y <= 1, ('Overlapping controls', first, second)


def layout(page, width):
    settle(page)
    main = page.locator('main')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Horizontal overflow'
    controls_fit(main, width)
    section = page.get_by_role('region', name='Gérer les membres', exact=True)
    aside = page.get_by_role('complementary', name='Espace et accès de l’équipe', exact=True)
    details = main.locator('details')
    boxes = [node.bounding_box() for node in (section, aside, details)]
    card, side, deletion = boxes
    assert all(boxes), boxes
    assert deletion['y'] >= card['y'] + card['height'] - 1, boxes
    assert abs(deletion['x'] - card['x']) <= 1, boxes
    assert abs(deletion['width'] - card['width']) <= 1, boxes
    if width >= 1024:
        assert abs(card['y'] - side['y']) <= 1, boxes
        assert card['x'] + card['width'] < side['x'], boxes
    else:
        assert side['y'] >= deletion['y'] + deletion['height'] - 1, boxes
        assert abs(card['x'] - side['x']) <= 1, boxes
        assert abs(card['width'] - side['width']) <= 1, boxes
    # Check every major stacked surface is reachable by the actual scroll pane.
    for target in (section, details.locator('summary'), aside.locator('section').last):
        target.scroll_into_view_if_needed()
        assert target.evaluate('e => {const r=e.getBoundingClientRect(); return r.bottom>0 && r.top<innerHeight;}')
    section.scroll_into_view_if_needed()


def paginate(page, names, width):
    seen, pages = set(), set()
    listing = page.locator('main .checkin-list:visible')
    for _ in range(101):
        settle(page)
        expect(listing).to_have_count(1)
        listing.scroll_into_view_if_needed()
        geometry = listing.evaluate('''list => {
            const b=list.getBoundingClientRect();
            return {height:list.clientHeight, scroll:list.scrollHeight,
                rows:[...list.children].map(row => {
                    const r=row.getBoundingClientRect();
                    return {name:row.querySelector('strong').textContent,h:r.height,
                        fits:r.top>=b.top-1 && r.bottom<=b.bottom+1 &&
                            r.left>=b.left-1 && r.right<=b.right+1};
                })};
        }''')
        assert geometry['height'] >= 56 and geometry['scroll'] <= geometry['height'] + 2, geometry
        assert geometry['rows'] and all(row['fits'] and abs(row['h'] - 56) <= 1
                                        for row in geometry['rows']), geometry
        current = tuple(row['name'] for row in geometry['rows'])
        assert current not in pages, ('Repeated pagination page', current)
        pages.add(current)
        seen.update(current)
        controls_fit(page.locator('main'), width)
        following = page.get_by_role('button', name='Page suivante', exact=True)
        if not following.count() or following.is_disabled():
            break
        following.click()
    assert seen == set(names), (len(seen), len(names), set(names) - seen)
    previous = page.get_by_role('button', name='Page précédente', exact=True)
    while previous.count() and previous.is_enabled():
        previous.click()
        settle(page)
    if previous.count():
        expect(previous).to_be_disabled()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')


def journeys(page, mock, width):
    main = page.locator('main')
    back = main.get_by_role('link', name='Toutes les équipes', exact=True)
    confirm = main.get_by_role('link', name='Confirmer les présences', exact=True)
    correct_team_link(back, '/teams')
    correct_team_link(confirm, '/participants')
    confirm.click()
    expect(page).to_have_url(f'{BASE}/participants?team={TEAM}')
    page.goto(f'{BASE}/manage-team?team={TEAM}')
    expect(page.locator('#manage-team-heading')).to_have_text(NAME)
    saved(page)

    add = page.locator('#checkin-name')
    button = page.get_by_role('button', name='Enregistrer cette personne', exact=True)
    before = len(mock.writes)
    for invalid in ('   ', 'X' * 61):
        add.fill(invalid)
        button.click()
        expect(add).to_have_attribute('aria-invalid', 'true')
        expect(page.locator('#checkin-name-error')).to_be_visible()
        assert len(mock.writes) == before
    add.fill('  André <safe>  ')
    button.click()
    saved(page)
    assert len(mock.team['roster']) == 12
    assert mock.team['roster'][-1]['name'] == 'André <safe>'
    search = page.get_by_role('searchbox', name='Rechercher un membre', exact=True)
    search.fill('elodie')
    expect(page.locator('main .checkin-list strong')).to_have_text(['Élodie'])
    search.fill('andre')
    expect(page.locator('main .checkin-list strong')).to_have_text(['André <safe>'])
    assert page.locator('main .checkin-list safe').count() == 0
    page.get_by_role('button', name='Modifier le nom de André <safe>', exact=True).click()
    dialog = page.get_by_role('dialog', name='Modifier le nom du participant', exact=True)
    expect(dialog).to_be_visible()
    dialog.get_by_role('textbox').fill('André renommé')
    controls_fit(dialog, width)
    dialog.get_by_role('button', name='Enregistrer', exact=True).click()
    expect(dialog).not_to_be_visible()
    saved(page)
    assert mock.team['roster'][-1]['name'] == 'André renommé'
    remove = page.get_by_role('button', name='Retirer André renommé de l’équipe', exact=True)
    before = len(mock.writes)
    remove.click()
    deletion = page.get_by_role('dialog', name='Supprimer cette personne ?', exact=True)
    deletion.get_by_role('button', name='Annuler', exact=True).click()
    expect(deletion).not_to_be_visible()
    assert len(mock.writes) == before
    remove.click()
    deletion.get_by_role('button', name='Supprimer', exact=True).click()
    expect(deletion).not_to_be_visible()
    saved(page)
    assert len(mock.team['roster']) == 11
    search.fill('')
    page.get_by_role('checkbox', name='Sélectionner Élodie', exact=True).check()
    expect(page.get_by_role('button', name='Supprimer la sélection', exact=True)).to_have_text('Supprimer (1)')
    page.get_by_role('checkbox', name='Tout sélectionner', exact=True).check()
    expect(page.get_by_role('button', name='Supprimer la sélection', exact=True)).to_have_text('Supprimer (11)')
    page.get_by_role('button', name='Supprimer la sélection', exact=True).click()
    bulk = page.get_by_role('dialog', name='Supprimer les personnes sélectionnées ?', exact=True)
    before = len(mock.writes)
    bulk.get_by_role('button', name='Annuler', exact=True).click()
    expect(bulk).not_to_be_visible()
    assert len(mock.writes) == before
    page.get_by_role('button', name='Supprimer la sélection', exact=True).click()
    bulk.get_by_role('button', name='Supprimer', exact=True).click()
    expect(bulk).not_to_be_visible()
    saved(page)
    assert mock.team['roster'] == []
    expect(page.get_by_text('Votre équipe prend forme ici.', exact=True)).to_be_visible()

    for error in (False, True):
        mock.share_error = error
        page.get_by_role('button', name='Lien participants', exact=True).click()
        share = page.get_by_role('dialog', name=f'Portail participants · {NAME}', exact=True)
        expect(share).to_be_visible()
        if error:
            expect(share.get_by_role('alert')).to_contain_text(SHARE_ERROR)
            expect(share.get_by_role('button', name='Réessayer', exact=True)).to_be_visible()
            expect(share.get_by_role('textbox')).to_have_count(0)
            expect(share.get_by_role('button', name='Copier le lien', exact=True)).to_have_count(0)
        else:
            name_field = share.get_by_role('textbox', name='Nom de l’équipe dans le lien', exact=True)
            link_field = share.get_by_role('textbox', name='Lien à partager', exact=True)
            expect(name_field).to_have_value(NAME)
            expect(link_field).to_have_attribute('readonly', '')
            original = urlparse(LINK)
            generated = urlparse(link_field.input_value())
            assert generated.scheme == original.scheme and generated.netloc == original.netloc and generated.path == original.path
            assert parse_qs(generated.query) == {'equipe': [NAME]}
            qr = share.locator('[data-testid="participant-share-qr"] svg')
            expect(qr).to_have_count(1)
            qr_before = qr.inner_html()
            name_field.fill('Equipe Support')
            expect(link_field).to_have_value(f'{LINK}?equipe=Equipe+Support')
            assert qr.inner_html() != qr_before, 'QR payload must follow the edited team label'
            name_field.fill(NAME)
            expect(link_field).to_have_value(f'{LINK}?equipe=%C3%89quipe+%C3%89lan')
            page.evaluate('''() => {
                window.__copiedParticipantLinks = [];
                Object.defineProperty(navigator, 'clipboard', {configurable:true,
                    value:{writeText:async text => window.__copiedParticipantLinks.push(text)}});
            }''')
            share.get_by_role('button', name='Copier le lien', exact=True).click()
            expect(share.get_by_role('status')).to_have_text('Lien copié dans le presse-papiers.')
            assert page.evaluate('window.__copiedParticipantLinks') == [link_field.input_value()]
        settle(page)
        controls_fit(share, width)
        share.get_by_role('button', name='Fermer', exact=True).click()
        expect(share).not_to_be_visible()

    summary = main.locator('summary')
    summary.click()
    expect(main.locator('details')).to_have_attribute('open', '')
    page.get_by_role('button', name=f'Supprimer l’équipe {NAME}', exact=True).click()
    exact = page.get_by_role('dialog', name='Supprimer définitivement cette équipe ?', exact=True)
    expect(exact).to_be_visible()
    field = exact.get_by_role('textbox', name='Recopiez le nom exact de l’équipe', exact=True)
    final = exact.get_by_role('button', name='Supprimer définitivement', exact=True)
    expect(final).to_be_disabled()
    field.fill('equipe elan')
    expect(final).to_be_disabled()
    field.fill(NAME)
    expect(final).to_be_enabled()
    controls_fit(exact, width)
    before = len(mock.writes)
    exact.get_by_role('button', name='Annuler', exact=True).click()
    expect(exact).not_to_be_visible()
    assert len(mock.writes) == before, 'Cancel must never delete the team'
    summary.click()
    back.click()
    expect(page.locator('#teams-heading')).to_be_visible()
    expect(page).to_have_url(f'{BASE}/teams?team={TEAM}')
    assert mock.other == team_fixture(['Autre équipe, ne pas modifier'])
    assert [entry[:2] for entry in mock.writes].count(('POST', '/api/participant-link')) == 2
    assert all(method in ('PUT', 'POST') for method, _, _ in mock.writes)


def run_case(browser, width, height, motion, stress=False):
    names = [(f'Membre {i:03d} ' + 'Éloïse très-long-nom ' * 2).strip()
             for i in range(100)] if stress else NAMES
    context = browser.new_context(viewport={'width': width, 'height': height},
                                  reduced_motion=motion, service_workers='block')
    bootstrap = install_browser_bootstrap(context)
    mock = MockAPI(names)
    context.route('**/api/**', mock.route)
    errors, failures = [], []
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    label = f'{width}x{height} {motion} {"100 stress" if stress else "11 members"}'
    try:
        page.goto(f'{BASE}/manage-team?team={TEAM}')
        expect(page.locator('#manage-team-heading')).to_have_text(NAME)
        saved(page)
        for title, action in [('layout', lambda: layout(page, width)),
                              ('pagination', lambda: paginate(page, names, width))]:
            try:
                action()
            except Exception as error:
                failures.append(f'{title}: {type(error).__name__}: {error}')
        if not stress and motion == 'reduce' and width in (390, 1366):
            page.locator('#manage-team-heading').evaluate('''heading => {
                for (let node=heading.parentElement; node; node=node.parentElement)
                    node.scrollTop=0;
            }''')
            settle(page)
            path = Path(tempfile.gettempdir()) / f'scrum-manage-team-design-{width}.png'
            page.screenshot(path=str(path))
            print(f'SCREENSHOT {path}', flush=True)
        if not stress:
            try:
                journeys(page, mock, width)
            except Exception as error:
                failures.append(f'journeys: {type(error).__name__}: {error}')
        else:
            assert not mock.writes, mock.writes
        bootstrap.assert_no_unexpected_api()
        assert not errors, errors
        assert not failures, '\n'.join(failures)
        print(f'PASS {label}', flush=True)
    finally:
        context.close()


def main():
    failures = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            cases = [(w, h, motion, False) for motion in ('reduce', 'no-preference') for w, h in SIZES]
            cases += [(w, h, motion, True) for motion in ('reduce', 'no-preference')
                      for w, h in ((390, 844), (1366, 768))]
            for width, height, motion, stress in cases:
                try:
                    run_case(browser, width, height, motion, stress)
                except Exception as error:
                    failures.append(f'{width}x{height} {motion} stress={stress}: {type(error).__name__}: {error}')
                    print(f'FAIL {failures[-1]}', flush=True)
        finally:
            browser.close()
    assert not failures, '\n'.join(failures)
    print(f'PASS all {len(cases)} fail-closed manage-team cases', flush=True)


if __name__ == '__main__':
    main()