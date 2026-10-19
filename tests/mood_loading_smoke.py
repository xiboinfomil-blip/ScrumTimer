"""Remote stacked slides and retries; every API mocked, no database access.

Run against an already-started app: python tests/mood_loading_smoke.py
Override the origin with BROWSER_TEST_URL when needed.
"""
import os
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from time import monotonic
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright
from fullscreen_helpers import emulate_fullscreen

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3000').rstrip('/')
TEAM_ID = 'a' * 64
DECK_ID = 'deck-' + '1' * 20
TITLE = 'Loading test meter'
SLIDES = [f'/mood-meters/slides/{DECK_ID}/page-{i}.svg' for i in (1, 2)]
SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="blue"/></svg>'


def run_case(browser, case):
    # Fresh contexts also isolate the client-side catalogue/deck caches.
    context = browser.new_context(viewport={'width': 1366, 'height': 768}, reduced_motion='reduce', service_workers='block')
    emulate_fullscreen(context)
    try:
        day = (datetime.now(timezone.utc) + timedelta(hours=4)).date().isoformat()
        team = {'roster': [{'id': 'alice', 'name': 'Alice', 'present': True, 'mood': None, 'moodUpdatedAt': None}], 'session': [], 'duration': 120, 'warning': 30, 'sound': False, 'usedMoodMeters': [], 'currentMoodSlide': None}
        db = {'revision': 1, 'meter': None}
        metadata, images, held, errors = [], [], [], []

        def api(route):
            req = route.request
            path = urlparse(req.url).path
            if path == '/api/teams':
                assert req.method == 'GET'
                route.fulfill(json={'teams': [{'id': TEAM_ID, 'name': 'Test', 'memberCount': 1}], 'activeTeamId': TEAM_ID})
            elif path in ('/api/team', '/api/history', '/api/daily-meter'):
                assert req.headers.get('x-team-id') == TEAM_ID
                if path == '/api/team':
                    assert req.method in ('GET', 'PUT')
                    if req.method == 'PUT':
                        team.update(deepcopy(req.post_data_json['team']))
                        db['revision'] += 1
                    route.fulfill(json={'team': deepcopy(team), 'revision': db['revision']})
                elif path == '/api/history':
                    assert req.method == 'GET'
                    route.fulfill(json={'rounds': [], 'day': day})
                else:
                    assert req.method in ('GET', 'POST', 'PATCH')
                    if req.method != 'GET':
                        db['meter'] = req.post_data_json
                    route.fulfill(json={'day': day, 'meter': db['meter']})
            elif path == '/api/mood-meters/catalog':
                route.fulfill(json=[{'title': TITLE, 'remoteId': DECK_ID, 'slides': []}])
            elif path == f'/api/mood-meters/decks/{DECK_ID}':
                metadata.append(monotonic())
                if case == 'metadata_retry' and len(metadata) == 1:
                    route.fulfill(status=503, json={'error': 'Temporary metadata failure'})
                else:
                    route.fulfill(json={'title': TITLE, 'slides': [path.lstrip('/') for path in SLIDES]})
            else:
                raise AssertionError(f'Unexpected API (never forwarded): {req.method} {path}')

        def image(route):
            url = urlparse(route.request.url)
            assert url.path in SLIDES, url.path
            images.append((url.path, parse_qs(url.query), monotonic()))
            if url.path == SLIDES[0]:
                if case == 'image_retry' and len(images) == 1:
                    route.fulfill(status=503, content_type='text/plain', body='Temporary SVG failure')
                else:
                    # Return without fulfilling: the test explicitly releases
                    # the first successful SVG, including its retry response.
                    held.append(route)
            else:
                route.fulfill(content_type='image/svg+xml', body=SVG)

        context.route('**/api/**', api)
        context.route('**/mood-meters/catalog.json', lambda route: route.fulfill(json={'remote': True}))
        context.route('**/mood-meters/slides/**', image)
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))

        def target_request(req):
            url = urlparse(req.url)
            return url.path == SLIDES[0] and (case != 'image_retry' or parse_qs(url.query).get('retry') == ['1'])

        with page.expect_request(target_request, timeout=10000):
            # Waiting for window.load would deadlock on the deliberately held SVG.
            page.goto(BASE + '/mood?team=' + TEAM_ID, wait_until='domcontentloaded')
        expect(page.locator('#meter-page-1-slide')).to_be_attached()
        # Pump browser events while the response is held: eager loading would
        # request page 2 here, even though neither SVG has decoded successfully.
        page.wait_for_timeout(350)
        assert len(held) == 1, f'{case}: expected one pending first-slide response'
        assert all(path == SLIDES[0] for path, _, _ in images), images
        expect(page.locator('#meter-page-2-slide')).to_have_count(0)

        if case == 'image_retry':
            assert len(images) == 2, images
            assert images[0][1] == {} and images[1][1] == {'retry': ['1']}, images
            delay = images[1][2] - images[0][2]
            assert 0.9 <= delay <= 5, f'SVG retry delay: {delay:.3f}s'
        else:
            assert len(images) == 1, images
        assert len(metadata) == (2 if case == 'metadata_retry' else 1), metadata
        if case == 'metadata_retry':
            delay = metadata[1] - metadata[0]
            assert 0.9 <= delay <= 5, f'Metadata retry delay: {delay:.3f}s'

        released = monotonic()
        with page.expect_request(lambda req: urlparse(req.url).path == SLIDES[1]):
            held.pop().fulfill(content_type='image/svg+xml', body=SVG)
        page.wait_for_function("""() => [1, 2].every(i => {
            const image = document.querySelector(`#meter-page-${i}-slide`);
            return image?.complete && image.naturalWidth > 0;
        })""")
        assert [path for path, _, _ in images] == ([SLIDES[0]] * (2 if case == 'image_retry' else 1) + [SLIDES[1]]), images
        assert images[-1][2] >= released, 'Second SVG requested before first response was released'
        expect(page.locator('#meter-slide-stack img')).to_have_count(2)
        expect(page.locator('#default-mood-meter')).to_have_count(0)
        assert not errors, errors
        print(f'PASS remote stacked mood loading: {case}')
    finally:
        context.close()


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            for case in ('sequential', 'image_retry', 'metadata_retry'):
                run_case(browser, case)
        finally:
            browser.close()


if __name__ == '__main__':
    main()