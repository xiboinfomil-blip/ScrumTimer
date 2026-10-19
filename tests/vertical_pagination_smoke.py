"""Master roster rails: five viewports, both motion modes, mocked APIs only.

Run with Python/Playwright against the existing development server on 3001.
Application assertion failures are collected across all three routes; this test
does not change production code, contact remote APIs, or write real team data.
"""
import os
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright
from fullscreen_helpers import emulate_fullscreen


BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3001').rstrip('/')
TEAM_ID = 'a' * 64
SIZES = [(320, 568), (390, 844), (768, 1024), (1024, 576), (1366, 768)]


def setup(browser, width, height, motion):
    context = browser.new_context(
        viewport={'width': width, 'height': height}, reduced_motion=motion,
        service_workers='block',
    )
    emulate_fullscreen(context)
    now = datetime.now(timezone.utc)
    day = (now + timedelta(hours=4)).date().isoformat()
    team = {
        'roster': [dict(id=f'p{i:02}',
                        name=f'Participant {i + 1:02} au nom particulièrement long',
                        present=True, mood=2, moodUpdatedAt=now.isoformat(),
                        moodSlide=None) for i in range(40)],
        'session': [], 'postponed': [], 'duration': 120, 'warning': 30,
        'sound': False, 'usedMoodMeters': [], 'currentMoodSlide': None,
    }
    db = {'team': team, 'revision': 1, 'daily_reads': 0, 'unexpected': [],
          'page_errors': [], 'external': [], 'daily_writes': []}

    def local_only(route):
        if urlparse(route.request.url).netloc != urlparse(BASE).netloc:
            db['external'].append(route.request.url)
            route.abort()
        else:
            route.fallback()

    def api(route):
        request = route.request
        path = urlparse(request.url).path
        if path == '/api/teams' and request.method == 'GET':
            payload = {'teams': [{'id': TEAM_ID, 'name': 'Équipe pagination',
                                  'memberCount': 40}], 'activeTeamId': TEAM_ID}
        elif path == '/api/team' and request.method in ('GET', 'PUT'):
            if request.method == 'PUT':
                db['team'] = deepcopy(request.post_data_json['team'])
                db['revision'] += 1
            payload = {'team': deepcopy(db['team']), 'revision': db['revision']}
        elif path == '/api/history' and request.method == 'GET':
            payload = {'rounds': [], 'day': day}
        elif path == '/api/daily-meter':
            if request.method != 'GET':
                db['daily_writes'].append(request.method)
            db['daily_reads'] += request.method == 'GET'
            payload = {'day': day, 'meter': {'meterId': 'original',
                                           'title': 'Baromètre original'}}
        elif path == '/api/mood-meters/catalog' and request.method == 'GET':
            payload = []
        else:
            db['unexpected'].append(f'{request.method} {path}')
            route.fulfill(status=501, json={'error': 'Unexpected mocked API'})
            return
        route.fulfill(json=payload)

    context.route('**/*', local_only)
    context.route('**/api/**', api)
    context.route('**/mood-meters/catalog.json',
                  lambda route: route.fulfill(json={'remote': True}))
    page = context.new_page()
    page.on('pageerror', lambda error: db['page_errors'].append(str(error)))
    page.set_default_timeout(15000)
    return context, page, db


def settle(page):
    # Wait for ResizeObserver pagination and finite entrance/press transitions;
    # ambient infinite decoration is irrelevant to list geometry.
    page.evaluate('''async () => {
        for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
    }''')
    page.wait_for_function('''() => !document.getAnimations().some(a =>
        a.playState === 'running' &&
        Number.isFinite(a.effect?.getComputedTiming().endTime))''')
    page.evaluate('''async () => {
        for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
    }''')


def geometry(wrapper):
    return wrapper.evaluate('''root => {
        const box = e => { const r = e.getBoundingClientRect();
            return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,
                    width:r.width,height:r.height}; };
        const list = root.querySelector('ul, ol');
        const rail = root.querySelector('nav');
        const rows = [...list.children];
        const inside = (a,b) => a.x >= b.x - 1 && a.right <= b.right + 1 &&
            a.y >= b.y - 1 && a.bottom <= b.bottom + 1;
        return {list:box(list),rail:box(rail),
            controls:[...rail.children].map(box),
            buttons:[...rail.querySelectorAll('button')].map(box),
            clipped:rows.flatMap(row => {
                const r = box(row);
                return [...row.querySelectorAll('strong, button, input[type=checkbox]')]
                    .filter(e => !inside(box(e),r)).map(e => ({
                        name:e.getAttribute('aria-label') || e.textContent,
                        box:box(e),row:r}));
            }),
            clippedRows:rows.filter(row => !inside(box(row),box(list)))
                .map(row => row.querySelector('strong')?.textContent),
            horizontal: {document:document.documentElement.scrollWidth,
                viewport:innerWidth,list:list.scrollWidth,client:list.clientWidth},
            rowButtons:rows.flatMap(row => [...row.querySelectorAll('button')]
                .map(e => ({name:e.getAttribute('aria-label'),...box(e)})))};
    }''')


def click_and_capture(page, listing, button):
    # Observe the list itself, not a ripple/row/route animation. Arm before the
    # real pointer click so a short WAAPI effect cannot finish between calls.
    listing.evaluate('''list => {
        globalThis.paginationMotion = {done:false, animations:[], frames:[]};
        document.addEventListener('click', () => {
            const sample = () => {
                const result = globalThis.paginationMotion;
                result.animations.push(...list.getAnimations().map(a => ({
                    state:a.playState,keyframes:a.effect.getKeyframes()})));
                result.frames.push({transform:getComputedStyle(list).transform,
                    opacity:getComputedStyle(list).opacity});
                if (result.frames.length < 24) requestAnimationFrame(sample);
                else result.done = true;
            };
            sample();
        }, {capture:true,once:true});
    }''')
    button.click()
    page.wait_for_function('globalThis.paginationMotion.done')
    result = page.evaluate('globalThis.paginationMotion')
    settle(page)
    return result


def exercise(page, wrapper, motion, record, mood=False):
    expect(wrapper).to_be_visible()
    listing = wrapper.locator(':scope > ul, :scope > ol')
    rail = wrapper.get_by_role('navigation', name='Pages de la liste')
    expect(rail).to_be_visible()
    settle(page)
    previous = rail.get_by_role('button', name='Page précédente', exact=True)
    following = rail.get_by_role('button', name='Page suivante', exact=True)
    status = rail.get_by_role('status')
    expect(previous).to_be_disabled()
    expect(following).to_be_enabled()
    first_names = listing.locator('li strong').all_text_contents()
    assert first_names and len(first_names) < 40, first_names
    total_pages = status.inner_text().split('sur')[-1].strip()

    def check_geometry():
        g = geometry(wrapper)
        assert g['rail']['x'] >= g['list']['right'] - 1, g
        assert len(g['buttons']) == 2 and len(g['controls']) == 3, g
        assert all(b['width'] >= 43.99 and b['height'] >= 43.99
                   for b in g['buttons']), g
        top, middle, bottom = g['controls']
        assert top['bottom'] <= middle['y'] + 1, g
        assert middle['bottom'] <= bottom['y'] + 1, g
        assert abs(top['x'] - bottom['x']) <= 1, g
        assert g['horizontal']['document'] <= g['horizontal']['viewport'] + 1, g
        assert g['horizontal']['list'] <= g['horizontal']['client'] + 1, g
        assert not g['clipped'] and not g['clippedRows'], g
        assert all(b['height'] >= 43.99 and b['width'] >= 43.99
                   for b in g['rowButtons']), g
        if mood:
            for row in listing.locator('li').all():
                expect(row.get_by_role('button')).to_have_count(5)
                expect(row.get_by_role('button', name='Reporter l’humeur et le passage de ',
                                       exact=False)).to_be_enabled()

    record('first-page geometry / row containment', check_geometry)
    for direction, control in [('forward', following), ('back', previous)]:
        capture = click_and_capture(page, listing, control)

        def check_motion():
            if motion == 'reduce':
                assert not capture['animations'], capture
                assert all(f['transform'] == 'none' and f['opacity'] == '1'
                           for f in capture['frames']), capture
            else:
                assert capture['animations'], 'No animation on the list itself'
                assert any(f['transform'] != 'none' or f['opacity'] != '1'
                           for f in capture['frames']), capture

        record(f'{direction} list animation', check_motion)

        def check_content():
            names = listing.locator('li strong').all_text_contents()
            if direction == 'forward':
                assert names and set(names).isdisjoint(first_names), (first_names, names)
                expect(status).to_have_text(f'2sur {total_pages}')
                expect(previous).to_be_enabled()
            else:
                assert names == first_names, (first_names, names)
                expect(status).to_have_text(f'1sur {total_pages}')
                expect(previous).to_be_disabled()

        record(f'{direction} actual names / page status', check_content)
        record(f'{direction} geometry / row containment', check_geometry)


def main():
    failures = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        for width, height in SIZES:
            for motion in ('no-preference', 'reduce'):
                context, page, db = setup(browser, width, height, motion)
                label = f'{width}x{height} {motion}'
                current_route = 'participants'

                def record(name, check):
                    try:
                        check()
                    except AssertionError as error:
                        message = f'{label} {current_route}: {name}: {error}'
                        failures.append(message)
                        print(f'FAIL {message}', flush=True)

                try:
                    page.goto(f'{BASE}/participants?team={TEAM_ID}')
                    start = page.get_by_role('button', name='Continuer vers les humeurs')
                    expect(start).to_be_enabled(timeout=30000)
                    exercise(page, page.locator('#attendance-present .paginated-list'),
                             motion, record)
                    # Exercise the real Continue/shuffle handoff. A direct goto
                    # would discard participantOrder and miss the master flow.
                    start.click()
                    dialog = page.get_by_role('dialog', name='Place au hasard, place à l’équipe.')
                    expect(dialog).to_be_visible()
                    expect(dialog.locator('li[data-person-id]')).to_have_count(40)
                    dialog.get_by_role('button', name='Aller aux humeurs', exact=True).click()
                    page.wait_for_url('**/mood*')
                    expect(dialog).not_to_be_visible()
                    current_route = 'mood'
                    expect(page.locator('#meter-catalogue-select')).to_be_disabled()
                    expect(page.locator('#default-mood-meter')).to_be_visible()
                    expect(page.locator('#daily-meter-note')).to_contain_text('Verrouillé après le premier vote')
                    if width <= 800:
                        page.get_by_role('button', name='Humeurs de l’équipe', exact=True).click()
                    exercise(page, page.locator('[aria-labelledby="mood-team-title"] .paginated-list'),
                             motion, record, mood=True)
                    assert db['daily_reads'] > 0 and not db['daily_writes'], db
                    assert len(db['team']['roster']) == 40
                    assert all(p['present'] and p['mood'] == 2 for p in db['team']['roster'])
                    current_route = 'manage-team'
                    page.goto(f'{BASE}/manage-team?team={TEAM_ID}')
                    exercise(page, page.get_by_role('region', name='Gérer les membres')
                             .locator('.paginated-list'), motion, record)
                    assert not db['unexpected'], db['unexpected']
                    assert not db['external'], db['external']
                    assert not db['page_errors'], db['page_errors']
                except Exception as error:
                    message = f'{label} {current_route}: {type(error).__name__}: {error}'
                    failures.append(message)
                    print(f'FAIL {message}', flush=True)
                finally:
                    context.close()
                print(f'FINISHED {label}', flush=True)
        browser.close()
    if failures:
        print(f'\n{len(failures)} failure(s):', flush=True)
        for failure in failures:
            print(f'- {failure}', flush=True)
        raise SystemExit(1)
    print('PASS master participants/mood/manage: 40 people, five sizes, both motion modes')


if __name__ == '__main__':
    main()