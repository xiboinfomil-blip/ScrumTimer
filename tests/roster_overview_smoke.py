"""100-person overview/shuffle contracts; run only after the parent rebuilds.

All API requests are intercepted before navigation: no live database access.
teams_smoke.py runs its suite at import time, so importing WorkspaceMock would
also launch unrelated tests. Keep this deliberately smaller contract standalone.
"""
import os
import re
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright


BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3000')
SIZES = [(320, 568), (1366, 768)]
TEAM_ID = 'a' * 64
PEOPLE = [
    {'id': f'person-{number:03d}', 'name': f'Personne {number:03d}',
     'present': True, 'mood': (number - 1) % 4 + 1,
     'moodUpdatedAt': datetime.now(timezone.utc).isoformat()}
    for number in range(1, 101)
]
NO_STORAGE = """for (const name of ['localStorage', 'sessionStorage'])
Object.defineProperty(window, name, {get() {
    throw new Error('Browser storage forbidden');
}});"""


class RosterMock:
    def __init__(self):
        self.team = {'roster': deepcopy(PEOPLE), 'session': [], 'duration': 120,
                     'warning': 30, 'sound': False, 'usedMoodMeters': [],
                     'currentMoodSlide': None}
        self.revision = 1
        self.day = (datetime.now(timezone.utc) + timedelta(hours=4)).date().isoformat()
        self.daily = {'day': self.day, 'meter': {
            'meterId': 'original', 'title': 'Baromètre original'}}
        self.requests = []
        self.unexpected = []

    def api(self, route):
        request = route.request
        path, method = urlparse(request.url).path, request.method
        self.requests.append((path, method))
        if path == '/api/mood-meters/catalog' and method == 'GET':
            route.fulfill(json=[])
            return
        if path == '/api/teams' and method == 'GET':
            route.fulfill(json={'teams': [{'id': TEAM_ID, 'name': 'Mon équipe',
                                          'memberCount': 100}],
                                'activeTeamId': TEAM_ID})
            return
        if request.headers.get('x-team-id') == TEAM_ID:
            if path == '/api/team':
                if method == 'GET':
                    route.fulfill(json={'team': deepcopy(self.team),
                                        'revision': self.revision})
                    return
                if method == 'PUT':
                    body = request.post_data_json
                    assert body['revision'] == self.revision, body
                    self.team = {**deepcopy(body['team']), 'session': [],
                                 'currentMoodSlide': None}
                    self.revision += 1
                    route.fulfill(json={'revision': self.revision})
                    return
            if path == '/api/daily-meter' and method == 'GET':
                route.fulfill(json=deepcopy(self.daily))
                return
            if path == '/api/history' and method == 'GET':
                route.fulfill(json={'rounds': []})
                return
        # Fail closed, including unexpected history writes or meter assignments.
        self.unexpected.append((path, method))
        route.abort('blockedbyclient')


def overview(page, scope):
    scope.get_by_role('button', name='Vue d’ensemble · 100', exact=True).click()
    dialog = page.get_by_role('dialog', name='Vue d’ensemble des personnes', exact=True)
    expect(dialog).to_be_visible()
    expect(dialog.get_by_role('list', name='Toutes les personnes', exact=True)
           .locator('li')).to_have_count(100)
    return dialog


def check_geometry(dialog, width, height):
    # One snapshot measures all 100 rows simultaneously, not after auto-scrolling.
    result = dialog.evaluate("""el => {
        const list = el.querySelector('ul');
        const box = node => {
            const r = node.getBoundingClientRect();
            const css = getComputedStyle(node);
            return {x: r.x, y: r.y, right: r.right, bottom: r.bottom,
                    width: r.width, height: r.height,
                    visible: css.display !== 'none' && css.visibility === 'visible'
                             && Number(css.opacity) > 0};
        };
        return {dialog: box(el), rows: [...list.children].map(box),
                names: [...list.children].map(row => row.title),
                noScroll: [el, list, document.documentElement, document.body]
                    .every(node => node.scrollHeight <= node.clientHeight + 1
                                && node.scrollWidth <= node.clientWidth + 1),
                dimensions: [el, list, document.documentElement, document.body].map(node => ({tag:node.tagName,h:node.clientHeight,sh:node.scrollHeight,w:node.clientWidth,sw:node.scrollWidth})),
                atOrigin: el.scrollTop === 0 && el.scrollLeft === 0
                          && window.scrollX === 0 && window.scrollY === 0};
    }""")
    assert result['names'] == [person['name'] for person in PEOPLE], result
    assert result['noScroll'] and result['atOrigin'], (width, height, result['dimensions'], result['atOrigin'])
    outer = result['dialog']
    for box in [outer, *result['rows']]:
        assert box['visible'] and box['width'] > 0 and box['height'] > 0, box
        assert box['x'] >= -1 and box['y'] >= -1, (width, height, box)
        assert box['right'] <= width + 1 and box['bottom'] <= height + 1, box
    for box in result['rows']:
        assert box['x'] >= outer['x'] and box['y'] >= outer['y'], box
        assert box['right'] <= outer['right'] and box['bottom'] <= outer['bottom'], box


def lineup_order(page, scope):
    dialog = overview(page, scope)
    names = dialog.get_by_role('list', name='Toutes les personnes', exact=True).locator('li').evaluate_all(
        'rows => rows.map(row => row.title)')
    assert len(names) == 100 and set(names) == {person['name'] for person in PEOPLE}
    dialog.get_by_role('button', name='Fermer la vue d’ensemble', exact=True).click()
    expect(dialog).not_to_be_visible()
    return names


def arm_icon_probe(button):
    # Framer may animate transforms through RAF rather than native WAAPI.
    # Sample the icon itself, not the button's delegated press animation.
    button.evaluate("""button => {
        const probe = window.__shuffleProbe = {frames: [], busySeen: false, stopped: false};
        const sample = () => {
            const icon = button.querySelector('[aria-hidden="true"]');
            const busy = button.getAttribute('aria-busy') === 'true';
            probe.busySeen ||= busy;
            probe.frames.push({busy, transform: getComputedStyle(icon).transform,
                running: icon.getAnimations().some(a => a.playState === 'running')});
        };
        const observer = new MutationObserver(sample);
        observer.observe(button, {attributes: true, childList: true, subtree: true});
        const tick = () => {
            sample();
            if (!probe.stopped) requestAnimationFrame(tick);
            else observer.disconnect();
        };
        requestAnimationFrame(tick);
    }""")


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        for width, height in SIZES:
            for motion in ['no-preference', 'reduce']:
                context = browser.new_context(viewport={'width': width, 'height': height},
                                              reduced_motion=motion, service_workers='block')
                context.add_init_script(NO_STORAGE)
                db = RosterMock()
                context.route('**/api/**', db.api)
                context.route('**/mood-meters/catalog.json',
                              lambda route: route.fulfill(json={'remote': True}))
                page = context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto(BASE + '/participants')
                page.wait_for_function("document.querySelector('.site-header [role=status]')?.title === 'Équipe enregistrée dans Neon.'")
                present = page.locator('#attendance-present')
                dialog = overview(page, present)
                # Wait for the dialog's entrance to settle before measuring.
                page.wait_for_function("document.querySelector('[role=dialog]').getAnimations({subtree: true}).every(a => a.playState !== 'running')")
                check_geometry(dialog, width, height)
                chooser = dialog.get_by_role('combobox', name='Aller à une personne', exact=True)
                expect(chooser.locator('option')).to_have_count(100)
                chooser.select_option(PEOPLE[-1]['id'])
                dialog.get_by_role('button', name='Voir', exact=True).click()
                expect(dialog).not_to_be_visible()
                expect(present.locator('li').get_by_text(PEOPLE[-1]['name'], exact=True)).to_be_visible()

                # Create the ready session through the UI; never seed transient lineup state.
                page.get_by_role('link', name='Humeurs', exact=True).click()
                expect(page).to_have_url(re.compile(r'/mood$'))
                expect(page.locator('#meter-catalogue-select')).to_have_value('-2')
                expect(page.locator('#meter-catalogue-select')).to_be_disabled()
                expect(page.locator('#daily-meter-note')).to_contain_text('Verrouillé après le premier vote')
                if width <= 800:
                    page.get_by_role('group', name='Panneau du bilan').get_by_role('button', name='Humeurs de l’équipe', exact=True).click()
                ready = page.get_by_role('button', name='Continuer vers le minuteur', exact=False)
                expect(ready).to_be_enabled()
                ready.click()
                expect(page).to_have_url(re.compile(r'/timer$'))
                expect(page.locator('#timer-page')).to_have_attribute('data-mode', 'setup')
                if width <= 800:
                    page.get_by_role('group', name='Panneau du minuteur', exact=True).get_by_role(
                        'button', name='Participants', exact=True).click()
                lineup = page.locator('.team-panel')
                expect(lineup).to_be_visible()
                before = lineup_order(page, lineup)
                shuffle = lineup.locator('#shuffle-button')
                expect(shuffle).to_be_enabled()
                expect(shuffle).to_have_attribute('aria-busy', 'false')
                arm_icon_probe(shuffle)
                shuffle.click()
                if motion == 'no-preference':
                    expect(shuffle).to_have_attribute('aria-busy', 'true')
                    expect(shuffle).to_be_disabled()
                    page.wait_for_function("window.__shuffleProbe.frames.filter(f => f.busy && f.transform !== 'none' && f.transform !== 'matrix(1, 0, 0, 1, 0, 0)').length >= 2")
                expect(shuffle).to_have_attribute('aria-busy', 'false')
                expect(shuffle).to_be_enabled()
                # Two more frames catch any animation left running after busy clears.
                probe = page.evaluate("""async () => {
                    await new Promise(requestAnimationFrame);
                    await new Promise(requestAnimationFrame);
                    window.__shuffleProbe.stopped = true;
                    return window.__shuffleProbe;
                }""")
                if motion == 'no-preference':
                    assert probe['busySeen'], probe
                    transforms = {frame['transform'] for frame in probe['frames'] if frame['busy']}
                    assert len(transforms) > 1, probe
                else:
                    assert not probe['busySeen'], probe
                    assert all(not frame['running'] and frame['transform'] in
                               ['none', 'matrix(1, 0, 0, 1, 0, 0)']
                               for frame in probe['frames']), probe
                after = lineup_order(page, lineup)
                assert after != before, (width, motion, before, after)
                assert sorted(after) == sorted(before), (before, after)
                assert ('/api/daily-meter', 'GET') in db.requests, db.requests
                assert not db.unexpected, db.unexpected
                assert not errors, errors
                context.close()
                print(f'PASS: {width}x{height} {motion}: 100-person overview fits without scroll, '
                      'last-person detail, UI-ready timer, changed shuffle order and icon/busy lifecycle; mocked APIs only')
        browser.close()


if __name__ == '__main__':
    main()