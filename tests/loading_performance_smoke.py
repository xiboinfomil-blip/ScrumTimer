"""Static loading placeholders and bounded timer work; all APIs fail-closed mocked.

Run with the development server already running on port 3001:
    python tests/loading_performance_smoke.py
BROWSER_TEST_URL overrides the origin. No real database reads/writes are allowed.
Deadline accuracy and pause/resume accounting belong to the existing timer suites.
"""
import time
import traceback
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

from meeting_features_smoke import BASE, TEAM_ID, MockMeeting, prompts_panel


SIZES = [(320, 568), (1366, 768)]
ROUTES = {
    'participants': ('list', '#participants-page'),
    'mood': ('mood', '#mood-page'),
    'timer': ('timer', '#timer-page'),
    'statistics': ('statistics', '#statistics-heading'),
    'teams': ('teams', '#teams-heading'),
}


class LoadingMock(MockMeeting):
    """Reuse the meeting contract, with explicitly released response barriers."""

    def __init__(self):
        super().__init__()
        # A valid transient lineup lets /timer mount without duplicating the
        # existing mood workflow/deadline tests. Votes lock the original meter.
        self.team['session'] = ['alice', 'bob']
        self.team['warning'] = 0
        self.meter = {'meterId': 'original', 'title': 'Baromètre original'}
        self.held = set()
        self.pending = {}
        self.requests = []

    def api(self, route):
        request = route.request
        path = urlparse(request.url).path
        self.requests.append((request.method, path))
        if request.method == 'GET' and path in self.held:
            self.pending.setdefault(path, []).append(route)
            return  # Never continue/fallback to the real server.
        super().api(route)

    def hold(self, *paths):
        self.held.update(paths)

    def wait_pending(self, page, *paths):
        # Pump synchronous Playwright dispatch, rather than sleeping Python
        # (which would prevent route handlers from processing new requests).
        deadline = time.monotonic() + 10
        while not all(self.pending.get(path) for path in paths):
            assert time.monotonic() < deadline, (
                'Requests did not start independently before fulfillment',
                paths, self.requests,
            )
            page.wait_for_timeout(20)

    def release(self, path, status=200):
        self.held.discard(path)
        routes = self.pending.pop(path, [])
        assert routes, f'No pending request for {path}'
        for route in routes:
            if status == 200:
                super().api(route)
            else:
                route.fulfill(status=status, json={'error': 'Chargement mock indisponible'})

    def count_requests(self, path):
        return sum(method == 'GET' and target == path for method, target in self.requests)

    def close(self):
        try:
            super().close()
        finally:
            self.pending.clear()


def open_page(browser, mock, width, height, motion='reduce'):
    page = mock.page(browser, width, height)
    page.emulate_media(reduced_motion=motion)
    page.set_default_timeout(15000)
    return page


def skeleton(page, variant):
    return page.locator(f'[data-page-skeleton="{variant}"]:visible').first


def static_skeleton(page, variant):
    placeholder = skeleton(page, variant)
    expect(placeholder).to_be_visible()
    status = placeholder.get_by_role('status')
    expect(status).to_have_count(1)
    expect(status).to_be_visible()
    expect(status).to_have_attribute('aria-live', 'polite')
    expect(status).to_have_attribute('aria-atomic', 'true')
    expect(status).to_contain_text('Chargement')
    expect(placeholder.locator('[aria-hidden="true"]')).to_have_count(1)
    assert placeholder.locator('button, input, select, textarea, a, [tabindex]').count() == 0
    # Animation checks are intentionally scoped to the skeleton, not ambient
    # navbar/footer motion or an enclosing route reveal.
    page.evaluate('() => new Promise(requestAnimationFrame)')
    problems = placeholder.evaluate("""root => [root, ...root.querySelectorAll('*')].flatMap(el => {
        const css = getComputedStyle(el);
        const issues = [];
        if (css.animationName.split(',').some(name => name.trim() !== 'none'))
            issues.push({kind: 'CSS animation', className: el.className});
        if (el.getAnimations().some(animation => animation.playState !== 'finished'))
            issues.push({kind: 'active animation', className: el.className});
        return issues;
    })""")
    assert not problems, problems
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), page.url
    return placeholder


def gated_controls(page, route):
    for name in ('Humeurs', 'Minuteur'):
        expect(page.get_by_role('button', name=name + ' —', exact=False)).to_be_disabled()
    if route == 'teams':
        # Public landing search/form remain available, but no team action is
        # usable before hydration (the form submit itself must be disabled).
        expect(page.get_by_role('button', name='Créer une équipe', exact=True)).to_be_disabled()
        for control in page.get_by_role('button', name='Ouvrir l’équipe', exact=False).all():
            expect(control).to_be_disabled()
    else:
        expect(page.locator(ROUTES[route][1])).to_have_count(0)
        expect(page.locator('main button:not([disabled]), main input, main select')).to_have_count(0)


def hydrated(page, route):
    expect(page.locator(ROUTES[route][1])).to_be_visible(timeout=30000)
    # This also waits for route-local deferred reads on mood/timer/statistics.
    expect(page.locator('[data-page-skeleton]:visible')).to_have_count(0, timeout=30000)
    if route == 'teams':
        expect(page.get_by_role('button', name='Ouvrir l’équipe Équipe test', exact=True)).to_be_enabled()
    elif route == 'participants':
        expect(page.get_by_role('button', name='Déplacer Alice <safe> vers les absents', exact=True)).to_be_enabled()
    elif route == 'timer':
        expect(page.locator('#start-button')).to_be_enabled()


def initial_case(browser, mock, width, height, route, motion):
    page = open_page(browser, mock, width, height, motion)
    mock.hold('/api/teams', '/api/team', '/api/history')
    page.goto(f'{BASE}/{route}?team={TEAM_ID}')
    mock.wait_pending(page, '/api/teams')
    variant = ROUTES[route][0]
    static_skeleton(page, variant)
    gated_controls(page, route)
    assert mock.count_requests('/api/team') == mock.count_requests('/api/history') == 0
    mock.release('/api/teams')
    # Both remain held: a serial team -> history implementation times out here.
    mock.wait_pending(page, '/api/team', '/api/history')
    static_skeleton(page, variant)
    gated_controls(page, route)
    # One response alone must not hydrate controls. Alternate release order to
    # cover both halves of the parallel-read barrier.
    first, second = ('/api/team', '/api/history') if width == 320 else ('/api/history', '/api/team')
    mock.release(first)
    page.wait_for_timeout(100)
    static_skeleton(page, variant)
    gated_controls(page, route)
    mock.release(second)
    hydrated(page, route)
    assert urlparse(page.url).path == '/' + route, 'guard redirected before valid hydration'


def initial_error_case(browser, mock, width, height, failed_path):
    page = open_page(browser, mock, width, height)
    mock.hold('/api/teams', '/api/team', '/api/history')
    page.goto(f'{BASE}/participants?team={TEAM_ID}')
    mock.wait_pending(page, '/api/teams')
    static_skeleton(page, 'list')
    mock.release('/api/teams', 503 if failed_path == '/api/teams' else 200)
    if failed_path != '/api/teams':
        mock.wait_pending(page, '/api/team', '/api/history')
        mock.release('/api/team', 503 if failed_path == '/api/team' else 200)
        mock.release('/api/history', 503 if failed_path == '/api/history' else 200)
    expect(page.get_by_text('Connexion à Neon nécessaire pour ouvrir votre équipe.', exact=True)).to_be_visible()
    expect(page.locator('[data-page-skeleton]')).to_have_count(0)
    expect(page.locator('#participants-page')).to_have_count(0)
    mock.hold('/api/teams', '/api/team', '/api/history')
    page.get_by_role('button', name='Réessayer Neon', exact=True).click()
    mock.wait_pending(page, '/api/teams')
    static_skeleton(page, 'list')
    mock.release('/api/teams')
    mock.wait_pending(page, '/api/team', '/api/history')
    mock.release('/api/team')
    mock.release('/api/history')
    hydrated(page, 'participants')
    assert mock.count_requests(failed_path) >= 2


def mood_case(browser, mock, width, height):
    page = open_page(browser, mock, width, height)
    mock.hold('/api/mood-meters/catalog', '/api/daily-meter')
    page.goto(f'{BASE}/mood?team={TEAM_ID}')
    mock.wait_pending(page, '/api/mood-meters/catalog', '/api/daily-meter')
    expect(page.locator('#mood-page')).to_be_visible()
    static_skeleton(page, 'mood')
    expect(page.locator('#meter-catalogue-select')).to_be_disabled()
    expect(page.locator('#random-meter-button')).to_be_disabled()
    expect(page.locator('#default-mood-meter')).to_have_count(0)
    mock.release('/api/daily-meter')
    page.wait_for_timeout(100)
    static_skeleton(page, 'mood')
    mock.release('/api/mood-meters/catalog', 503)
    expect(page.get_by_role('button', name='Réessayer le catalogue', exact=True)).to_be_visible()
    expect(page.locator('[data-page-skeleton="mood"]')).to_have_count(0)
    expect(page.locator('#daily-meter-note')).to_contain_text('indisponible')
    mock.hold('/api/mood-meters/catalog', '/api/daily-meter')
    page.get_by_role('button', name='Réessayer le catalogue', exact=True).click()
    mock.wait_pending(page, '/api/mood-meters/catalog', '/api/daily-meter')
    static_skeleton(page, 'mood')
    mock.release('/api/mood-meters/catalog')
    mock.release('/api/daily-meter')
    expect(page.locator('#default-mood-meter')).to_be_visible()
    expect(page.locator('[data-page-skeleton="mood"]')).to_have_count(0)


def prompts_case(browser, mock, width, height):
    page = open_page(browser, mock, width, height)
    mock.hold('/api/meeting-settings')
    page.goto(f'{BASE}/timer?team={TEAM_ID}')
    expect(page.locator('#start-button')).to_be_enabled()
    panel = prompts_panel(page, width)
    mock.wait_pending(page, '/api/meeting-settings')
    static_skeleton(page, 'timer')
    expect(panel.locator('article')).to_have_count(0)
    expect(panel.get_by_role('button', name='Modifier les questions de l’équipe')).to_be_disabled()
    mock.release('/api/meeting-settings', 503)
    expect(panel.get_by_role('alert')).to_contain_text('Questions par défaut affichées')
    expect(panel.locator('[data-page-skeleton]')).to_have_count(0)
    mock.hold('/api/meeting-settings')
    panel.get_by_role('button', name='Réessayer', exact=True).click()
    mock.wait_pending(page, '/api/meeting-settings')
    static_skeleton(page, 'timer')
    mock.release('/api/meeting-settings')
    expect(panel).to_contain_text('Question partagée A ?')
    expect(panel.get_by_role('button', name='Modifier les questions de l’équipe')).to_be_enabled()
    expect(panel.locator('[data-page-skeleton]')).to_have_count(0)


def statistics_case(browser, mock, width, height):
    page = open_page(browser, mock, width, height)
    statistics = page.get_by_role('region', name='Le rythme de l’équipe.', exact=True)
    indicators = statistics.locator('dl[aria-label="Indicateurs des cinq derniers jours"] dd')
    page.goto(f'{BASE}/participants?team={TEAM_ID}')
    hydrated(page, 'participants')
    # Hold only the statistics read, not the provider's initial history read.
    mock.hold('/api/history')
    page.get_by_role('link', name='Statistiques', exact=True).click()
    mock.wait_pending(page, '/api/history')
    static_skeleton(page, 'statistics')
    expect(statistics.get_by_role('button', name='Chargement…', exact=True)).to_be_disabled()
    expect(statistics.get_by_role('definition')).to_have_count(0)
    mock.release('/api/history', 503)
    expect(statistics.get_by_role('status')).to_contain_text('Historique Neon indisponible')
    expect(statistics.locator('[data-page-skeleton="statistics"]')).to_have_count(0)
    expect(indicators).to_have_text(['—', '—', '—', '—'])
    mock.hold('/api/history')
    statistics.get_by_role('button', name='Réessayer', exact=True).click()
    mock.wait_pending(page, '/api/history')
    static_skeleton(page, 'statistics')
    expect(statistics.get_by_role('button', name='Chargement…', exact=True)).to_be_disabled()
    expect(indicators).to_have_count(0)
    mock.release('/api/history')
    expect(statistics.get_by_role('status')).to_contain_text('Historique chargé depuis Neon')
    expect(statistics.locator('[data-page-skeleton="statistics"]')).to_have_count(0)
    expect(indicators).to_have_text(['0', '0', '—', '—'])


def observe_ring(page):
    page.locator('#ring-progress').evaluate("""ring => {
        window.__ringProbe?.observer.disconnect();
        const probe = {mutations: 0, started: performance.now(), initial: ring.getAttribute('style')};
        probe.observer = new MutationObserver(records => { probe.mutations += records.length; });
        probe.observer.observe(ring, {attributes: true, attributeFilter: ['style']});
        window.__ringProbe = probe;
    }""")


def ring_sample(page):
    return page.evaluate("""() => ({mutations: __ringProbe.mutations,
        seconds: (performance.now() - __ringProbe.started) / 1000,
        initial: __ringProbe.initial, current: document.querySelector('#ring-progress').getAttribute('style')})""")


def timer_case(browser, mock, width, height):
    page = open_page(browser, mock, width, height)
    # Instrument recurring timer callbacks before React mounts. Ignore unrelated
    # Next dev tooling intervals; retain exact delay/stack diagnostics on failure.
    page.add_init_script("""(() => {
        const install = window.setInterval.bind(window), clear = window.clearInterval.bind(window);
        const probe = window.__tickProbe = {active: {}, calls: 0};
        window.setInterval = (fn, delay, ...args) => {
            const stack = new Error().stack || '';
            // Production minifies hook names; 250ms is the documented timer
            // scheduler delay (no other fixture feature uses that cadence).
            const timer = (/useStandupTimer|use-standup-timer/.test(stack) || delay === 250) && typeof fn === 'function';
            const id = install(timer ? (...values) => { probe.calls++; fn(...values); } : fn, delay, ...args);
            if (timer) probe.active[id] = {delay, stack};
            return id;
        };
        window.clearInterval = id => { delete probe.active[id]; return clear(id); };
    })();""")
    page.goto(f'{BASE}/timer?team={TEAM_ID}')
    hydrated(page, 'timer')
    page.wait_for_timeout(300)  # Allow nonrecurring mount/layout work to settle.
    observe_ring(page)
    before = page.evaluate('__tickProbe.calls')
    page.wait_for_timeout(2100)
    idle = ring_sample(page)
    assert idle['mutations'] == 0 and idle['initial'] == idle['current'], idle
    assert page.evaluate('__tickProbe.calls') == before, 'idle timer callback keeps waking up'
    assert page.evaluate('Object.keys(__tickProbe.active).length') == 0
    page.locator('#start-button').click()
    expect(page.locator('#timer-page')).to_have_attribute('data-mode', 'speaking')
    # Focus mode replaces the keyed ring: attach to the new circle, not the
    # detached setup node. Count actual SVG stroke style writes, not RAFs.
    observe_ring(page)
    page.wait_for_timeout(2100)
    running = ring_sample(page)
    assert running['initial'] != running['current'], running
    assert 3 <= running['mutations'] < 6 * running['seconds'], running
    active = page.evaluate('Object.values(__tickProbe.active)')
    assert len(active) == 1 and active[0]['delay'] == 250, active
    # Ensure instrumentation actually found the hook (idle check isn't vacuous).
    assert page.evaluate('__tickProbe.calls') > before
    print(f'OBSERVATION timer {width}: idle={idle["mutations"]} ring writes; '
          f'running={running["mutations"] / running["seconds"]:.2f}/sec', flush=True)
    # Client navigation preserves the probe, so cleanup is not accidentally
    # "proved" by resetting the whole document and its instrumentation.
    page.get_by_role('link', name='Participants', exact=True).click()
    hydrated(page, 'participants')
    assert page.evaluate('Object.keys(__tickProbe.active).length') == 0, 'timer interval leaked on unmount'


def main():
    expect.set_options(timeout=15000)
    failures, passed = [], 0
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        for width, height in SIZES:
            cases = []
            for motion in ('reduce', 'no-preference'):
                for route in ROUTES:
                    cases.append((f'initial {route} {motion}',
                                  lambda b, m, w, h, r=route, mode=motion: initial_case(b, m, w, h, r, mode)))
            for path in ('/api/teams', '/api/team', '/api/history'):
                cases.append((f'initial error/retry {path}',
                              lambda b, m, w, h, target=path: initial_error_case(b, m, w, h, target)))
            cases.extend([('deferred mood/error/retry', mood_case),
                          ('deferred prompts/error/retry', prompts_case),
                          ('deferred statistics/error/retry', statistics_case),
                          ('timer idle/running/unmount', timer_case)])
            for name, case in cases:
                label = f'{name} {width}x{height}'
                mock = LoadingMock()
                failure = None
                try:
                    case(browser, mock, width, height)
                except Exception as error:
                    failure = str(error)
                    traceback.print_exc()
                finally:
                    try:
                        mock.close()
                    except Exception as error:
                        failure = f'{failure or ""} mock/runtime: {error}'
                if failure is not None:
                    failures.append(label)
                    print(f'FAIL {label}: {failure}', flush=True)
                else:
                    passed += 1
                    print(f'PASS {label}', flush=True)
        browser.close()
    print(f'{"FAIL" if failures else "PASS"}: {passed}/{passed + len(failures)} cases; '
          'all APIs mocked; no live DB writes', flush=True)
    return 1 if failures else 0


if __name__ == '__main__':
    raise SystemExit(main())