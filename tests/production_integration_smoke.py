"""Real HTTP between built apps; unauthorized requests only, no database access.

Run with fixture-configured portal/master origins. Never supplies real team
capabilities, writes notes, lists teams, or reads personal data.
"""
import base64
import json
import os
from urllib.error import HTTPError
from urllib.request import Request, urlopen

MASTER = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3000').rstrip('/')
PORTAL = os.environ.get('PORTAL_TEST_URL', 'http://localhost:3003').rstrip('/')


def request(origin, path, *, method='GET', headers=None, data=None):
    req = Request(origin + path, method=method, headers=headers or {}, data=data)
    try:
        response = urlopen(req, timeout=20)
    except HTTPError as error:
        response = error
    with response:
        body = response.read()
        assert not response.headers.get('Set-Cookie'), 'Application must not set a cookie'
        return response.status, response.headers, body


def run():
    for origin, path in [(MASTER, '/help'), (PORTAL, '/')]:
        status, _, body = request(origin, path)
        assert status == 200 and b'<html' in body, (origin, path, status)
    for path in ['/statistics', '/daily-notes']:
        assert request(MASTER, path)[0] == 404, path
    assert request(MASTER, '/api/participant-portal')[0] == 403
    status, headers, _ = request(PORTAL, '/api/team')
    assert status == 401, ('Portal fixture configuration missing?', status)
    assert 'no-store' in headers.get('Cache-Control', '')
    encode = lambda value: base64.urlsafe_b64encode(value).decode().rstrip('=')
    # Correct shape, deliberately invalid signature; never a real capability.
    token = encode(json.dumps({'v': 1, 'teamId': 'a' * 64}).encode()) + '.' + encode(bytes(32))
    status, _, body = request(PORTAL, '/api/team', headers={'X-Team-Link': token})
    assert status == 401 and json.loads(body)['error'] == 'INVALID_LINK', (status, body)
    # This 401 is proxied through a REAL server-side fetch to the built master,
    # not Playwright interception. Configuration/unreachable upstream gives 503/502.
    status, _, _ = request(PORTAL, '/api/team', method='PUT', headers={
        'X-Team-Link': token, 'Origin': 'https://untrusted.invalid',
        'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site',
    }, data=b'{}')
    assert status == 403, status
    print('PASS production HTTP integration: pages, removed routes, no cookies, '
          'no-store, real portal-to-master rejection and cross-origin write rejection; no database access')


if __name__ == '__main__':
    run()