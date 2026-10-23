"""DEV-only PWA HTTP/browser smoke; synthetic prompts are NOT real installation.

All application APIs fail closed using browser_bootstrap. Public manifest, PNGs
and worker are fetched over real HTTP. No production build or Neon/Redis writes.
"""
import re
import struct
import zlib
from urllib.parse import urljoin, urlsplit

from playwright.sync_api import expect, sync_playwright
from browser_bootstrap import install_browser_bootstrap
from timer_remote_smoke import BASE


def isolated_context(context):
    guard = install_browser_bootstrap(context, fullscreen=False, intro=False)

    def teams(route):
        assert route.request.method == 'GET', 'PWA tests must not write teams'
        route.fulfill(json={'teams': [], 'activeTeamId': None})

    # The shared provider reads the directory even on /remote. Empty fixture
    # prevents any selected-team hydration; every other API still fails closed.
    context.route('**/api/teams', teams)
    return guard


def valid_png(data, size):
    """Check signature, all chunk CRCs, IHDR dimensions and compressed pixels."""
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    offset, chunks, pixels = 8, [], bytearray()
    while offset < len(data):
        length = struct.unpack('>I', data[offset:offset + 4])[0]
        kind = data[offset + 4:offset + 8]
        payload = data[offset + 8:offset + 8 + length]
        crc = struct.unpack('>I', data[offset + 8 + length:offset + 12 + length])[0]
        assert zlib.crc32(kind + payload) & 0xffffffff == crc
        chunks.append(kind)
        if kind == b'IHDR':
            assert struct.unpack('>II', payload[:8]) == (size, size)
        if kind == b'IDAT':
            pixels.extend(payload)
        offset += 12 + length
    assert chunks[0] == b'IHDR' and chunks[-1] == b'IEND'
    assert offset == len(data) and len(zlib.decompress(pixels)) > size * size


PROMPT = """outcome => {
    window.installCalls = 0;
    const event = new Event('beforeinstallprompt', {cancelable:true});
    event.prompt = () => {
        window.installCalls++;
        return Promise.resolve();
    };
    event.userChoice = new Promise(resolve => { window.resolveInstallChoice = () =>
        resolve({outcome, platform:'synthetic-browser'}); });
    window.dispatchEvent(event);
    return event.defaultPrevented;
}"""

PREFERENCE_KEY = 'standup.companion.install.hidden.v1'
PAIRING_KEY = 'standup.companion.team.v1'


def install_dialog(page):
    return page.get_by_role('dialog', name='Installer la télécommande', exact=True)


def close_install_dialog(page):
    install_dialog(page).get_by_role('button', name='Continuer dans le navigateur', exact=True).click()
    expect(install_dialog(page)).to_have_count(0)


def reopen_install_dialog(page):
    page.get_by_role('button', name='Ajouter l’application', exact=True).click()
    expect(install_dialog(page)).to_be_visible()


def geometry(page, label, failures):
    # The incomplete-link fixture has no countdown. Check the actual portalled
    # dialog, including its scrollable content and reachable footer, instead.
    dialog = install_dialog(page)
    report = dialog.evaluate("""root => {
        const b = root.getBoundingClientRect();
        return {left:b.left, right:b.right, top:b.top, bottom:b.bottom,
            width:innerWidth, height:innerHeight, scroll:root.scrollWidth,
            client:root.clientWidth,
            buttons:[...root.querySelectorAll('button')].map(el => {
                const b = el.getBoundingClientRect();
                return {name:el.textContent, width:b.width, height:b.height};
            })};
    }""")
    if (report['left'] < -1 or report['right'] > report['width'] + 1
            or report['top'] < -1 or report['bottom'] > report['height'] + 1
            or report['scroll'] > report['client'] + 1):
        failures.append((label, 'dialog overflow', report))
    for button in report['buttons']:
        if button['width'] < 43.99 or button['height'] < 43.99:
            failures.append((label, 'touch target', button))
    dialog.get_by_role('checkbox', name='Ne plus afficher automatiquement').scroll_into_view_if_needed()
    expect(dialog.get_by_role('checkbox', name='Ne plus afficher automatiquement')).to_be_in_viewport()
    expect(dialog.get_by_role('button', name='Continuer dans le navigateur')).to_be_in_viewport()


def worker_contract(page, source):
    # Execute the ACTUAL HTTP response with instrumented worker globals. Any
    # storage access or network request outside a navigation fails the test.
    report = page.evaluate("""async source => {
        const handlers = {}, fetches = [], storage = [];
        let offline = false;
        const forbidden = new Proxy({}, {get(_, key) {
            storage.push(String(key)); throw new Error('Worker storage forbidden');
        }});
        const self = {location:{origin:location.origin},
            addEventListener:(name, fn) => {handlers[name] = fn;},
            skipWaiting:() => Promise.resolve(), clients:{claim:() => Promise.resolve()}};
        const network = async (request, options) => {
            fetches.push({method:request.method, url:request.url, cache:options?.cache});
            if (offline) throw new Error('offline');
            return new Response('network-only', {status:200});
        };
        new Function('self','fetch','caches','indexedDB','localStorage', source)(
            self, network, forbidden, forbidden, forbidden);
        for (const name of ['install','activate']) {
            const pending=[];
            handlers[name]({waitUntil:p => pending.push(p)});
            await Promise.all(pending);
        }
        const results=[];
        for (const [path, method, mode] of [
            ['/api/timer-remote','POST','cors'], ['/api/team','PUT','cors'],
            ['/api/team','GET','cors'], ['/api/timer-remote','GET','cors'],
            ['/remote','POST','navigate'], ['/teams','GET','navigate'],
            ['/remote/icon?size=192','GET','cors'], ['/remote','GET','navigate'],
            ['/remote/nested','GET','navigate']]) {
            let response;
            handlers.fetch({request:{url:location.origin+path,method,mode},
                respondWith:value => {response=value;}});
            results.push({path, intercepted:response !== undefined});
            if (response) await response;
        }
        offline=true;
        let fallback;
        handlers.fetch({request:{url:location.origin+'/remote',method:'GET',mode:'navigate'},
            respondWith:value => {fallback=value;}});
        const response=await fallback;
        return {results, fetches, storage, status:response.status,
            cache:response.headers.get('cache-control'), body:await response.text()};
    }""", source)
    assert [r['intercepted'] for r in report['results']] == [False] * 7 + [True, True], report
    assert not report['storage'], report
    assert len(report['fetches']) == 3 and all(
        r['method'] == 'GET' and r['cache'] == 'no-store' for r in report['fetches']), report
    assert report['status'] == 503 and report['cache'] == 'no-store'
    assert 'Connexion nécessaire' in report['body']
    print('PASS worker executed HTTP JS: navigation network-only/offline503; no API interception, writes or storage', flush=True)


def main():
    failures = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        # Request only known public routes: never an application data API.
        http = p.request.new_context(base_url=BASE)
        response = http.get('/remote/manifest.webmanifest')
        assert response.status == 200
        assert 'application/manifest+json' in response.headers['content-type']
        assert 'no-store' in response.headers['cache-control']
        manifest = response.json()
        assert manifest['id'] == manifest['start_url'] == manifest['scope'] == '/remote'
        assert manifest['display'] == 'standalone' and manifest['lang'] == 'fr'
        assert {i['sizes'] for i in manifest['icons']} >= {'192x192', '512x512'}
        for size in (192, 512):
            icon = next(i for i in manifest['icons'] if i['sizes'] == f'{size}x{size}')
            assert icon['type'] == 'image/png'
            target = urljoin(BASE, icon['src'])
            assert urlsplit(target).netloc == urlsplit(BASE).netloc
            assert urlsplit(target).path == '/remote/icon'
            image = http.get(target)
            assert image.status == 200 and 'image/png' in image.headers['content-type']
            valid_png(image.body(), size)
            print(f'PASS real HTTP icon {size}x{size}: valid PNG ({len(image.body())} bytes)', flush=True)
        worker = http.get('/remote/sw.js')
        assert worker.status == 200
        assert re.search(r'(application|text)/javascript', worker.headers['content-type'])
        assert worker.headers['service-worker-allowed'] == '/remote'
        assert 'no-store' in worker.headers['cache-control']
        assert worker.headers['x-content-type-options'] == 'nosniff'
        source = worker.text()
        print('PASS real HTTP manifest + service-worker content type/no-store/allowed scope /remote', flush=True)

        for width, height in ((320, 568), (390, 844)):
            context = browser.new_context(viewport={'width': width, 'height': height},
                                          service_workers='allow', reduced_motion='reduce')
            guard = isolated_context(context)
            errors = []
            page = context.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(BASE + '/remote')
            card = page.get_by_role('complementary', name='Installer la télécommande')
            dialog = install_dialog(page)
            expect(dialog).to_be_visible()  # Automatic: no click or native event.
            expect(dialog.get_by_role('button', name='Continuer dans le navigateur')).to_be_focused()
            expect(page.locator('link[rel="manifest"]')).to_have_attribute('href', '/remote/manifest.webmanifest')
            # Current Next emits the standardized capable flag, with Apple title/style.
            expect(page.locator('meta[name="mobile-web-app-capable"], meta[name="apple-mobile-web-app-capable"]')).to_have_attribute('content', 'yes')
            expect(page.locator('meta[name="apple-mobile-web-app-title"]')).to_have_attribute('content', 'Télécommande')
            expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).to_have_attribute('content', 'default')
            expect(page.locator('link[rel="apple-touch-icon"]')).to_have_attribute('href', '/remote/icon?size=192')
            registration = page.evaluate("""async () => {
                const r = await Promise.race([
                    navigator.serviceWorker.ready,
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Worker activation timeout')), 15000))
                ]);
                return {scope:r.scope, script:r.active.scriptURL, caches:await caches.keys()};
            }""")
            assert registration == {'scope': BASE + '/remote', 'script': BASE + '/remote/sw.js', 'caches': []}
            worker_contract(page, source)
            # Registration alone must never be reported as successful installation.
            expect(dialog.get_by_role('button', name='Installer', exact=True)).to_have_count(0)
            expect(dialog.get_by_text('iPhone / iPad · Safari :', exact=True)).to_be_visible()
            expect(dialog).to_contain_text('ouvrez Partager, puis « Sur l’écran d’accueil »')
            expect(dialog).to_contain_text('La disponibilité dépend du navigateur')
            geometry(page, ('PWA browser tips', width, height), failures)
            close_install_dialog(page)
            expect(card.get_by_role('button', name='Ajouter l’application')).to_be_visible()
            page.reload()
            expect(page).to_have_url(BASE + '/remote')
            expect(dialog).to_be_visible()  # Dismissal alone never persists.
            close_install_dialog(page)
            reopen_install_dialog(page)
            page.keyboard.press('Escape')
            expect(dialog).to_have_count(0)
            expect(card.get_by_role('button', name='Ajouter l’application')).to_be_focused()
            reopen_install_dialog(page)
            for outcome, message in (
                ('dismissed', 'Installation annulée. Vous pouvez continuer dans le navigateur.'),
                ('accepted', 'Demande d’installation acceptée par le navigateur.'),
            ):
                assert page.evaluate(PROMPT, outcome), 'beforeinstallprompt must be prevented'
                assert page.evaluate('window.installCalls') == 0, 'must require an explicit install click'
                button = dialog.get_by_role('button', name='Installer', exact=True)
                expect(button).to_be_visible()
                geometry(page, ('PWA prompt', width, height, outcome), failures)
                button.click()
                expect(dialog.get_by_role('button', name='Ouverture…', exact=True)).to_be_disabled()
                assert page.evaluate('window.installCalls') == 1
                page.evaluate('window.resolveInstallChoice()')
                expect(dialog.get_by_role('status')).to_have_text(message)
                expect(button).to_have_count(0)
                expect(dialog).to_be_visible()  # Accepted request is NOT installed.
                assert page.evaluate('window.installCalls') == 1

            # Preference stores only a boolean, never touches the pairing key.
            assert page.evaluate('(key) => localStorage.getItem(key)', PREFERENCE_KEY) is None
            pairing = page.evaluate('(key) => localStorage.getItem(key)', PAIRING_KEY)
            dialog.get_by_role('checkbox', name='Ne plus afficher automatiquement').check()
            assert page.evaluate('(key) => localStorage.getItem(key)', PREFERENCE_KEY) == 'true'
            assert page.evaluate('(key) => localStorage.getItem(key)', PAIRING_KEY) == pairing
            close_install_dialog(page)
            page.reload()
            expect(page.get_by_role('button', name='Ajouter l’application')).to_be_visible()
            expect(dialog).to_have_count(0)
            reopen_install_dialog(page)
            close_install_dialog(page)
            assert page.evaluate(PROMPT, 'dismissed')
            expect(dialog).to_have_count(0)  # Native availability must not defeat opt-out.
            assert page.evaluate('window.installCalls') == 0
            reopen_install_dialog(page)
            expect(dialog.get_by_role('checkbox', name='Ne plus afficher automatiquement')).to_be_checked()
            expect(dialog.get_by_role('button', name='Installer', exact=True)).to_be_visible()
            dialog.get_by_role('checkbox', name='Ne plus afficher automatiquement').uncheck()
            assert page.evaluate('(key) => localStorage.getItem(key)', PREFERENCE_KEY) is None
            assert page.evaluate('(key) => localStorage.getItem(key)', PAIRING_KEY) == pairing
            close_install_dialog(page)
            page.reload()
            expect(dialog).to_be_visible()
            page.evaluate("window.dispatchEvent(new Event('appinstalled'))")
            expect(dialog).to_have_count(0)
            expect(card).to_have_count(0)
            assert not page.evaluate(PROMPT, 'accepted'), 'installed app must ignore later prompts'
            assert page.evaluate('caches.keys()') == []
            assert not errors, errors
            guard.assert_no_unexpected_api()
            print(f'PASS {width}x{height}: automatic dialog, dismiss/reload/reopen/Escape, preference/reset/pairing isolation, explicit native prompt, appinstalled closes dialog', flush=True)
            page.evaluate("""async () => {
                for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
            }""")
            context.close()

        for failure in ('read', 'write'):
            context = browser.new_context(viewport={'width': 320, 'height': 568}, reduced_motion='reduce')
            guard = isolated_context(context)
            context.add_init_script("""(() => {
                const failure = 'FAILURE_MODE';
                const key = 'standup.companion.install.hidden.v1';
                for (const method of (failure === 'read' ? ['getItem', 'setItem', 'removeItem'] : ['setItem', 'removeItem'])) {
                    const original = Storage.prototype[method];
                    Storage.prototype[method] = function(name, ...args) {
                        if (name === key) throw new DOMException('blocked', 'SecurityError');
                        return original.call(this, name, ...args);
                    };
                }
            })();""".replace('FAILURE_MODE', failure))
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(BASE + '/remote')
            dialog = install_dialog(page)
            expect(dialog).to_be_visible()
            checkbox = dialog.get_by_role('checkbox', name='Ne plus afficher automatiquement')
            checkbox.check()
            expect(checkbox).to_be_checked()
            expect(dialog.get_by_role('alert').filter(has_text='Le stockage est indisponible')).to_be_visible()
            close_install_dialog(page)
            expect(page.get_by_role('alert').filter(has_text='Le stockage est indisponible')).to_be_visible()
            reopen_install_dialog(page)
            expect(checkbox).to_be_checked()  # In-memory fallback survives reopening.
            close_install_dialog(page)
            page.reload()
            expect(dialog).to_be_visible()
            expect(checkbox).not_to_be_checked()
            assert not errors, errors
            guard.assert_no_unexpected_api()
            print(f'PASS blocked preference {failure}: visible notice, memory-only fallback, reopen and reload', flush=True)
            context.close()

        for mode in ('display-mode', 'ios-standalone'):
            context = browser.new_context(service_workers='allow')
            guard = isolated_context(context)
            if mode == 'display-mode':
                context.add_init_script("""const original = window.matchMedia.bind(window);
                    window.matchMedia = query => {
                        const result = original(query);
                        if (query === '(display-mode: standalone)')
                            Object.defineProperty(result, 'matches', {value:true});
                        return result;
                    };""")
            else:
                context.add_init_script("Object.defineProperty(navigator, 'standalone', {value:true});")
            page = context.new_page()
            page.goto(BASE + '/remote')
            expect(page.get_by_role('status')).to_contain_text('Ce lien est incomplet')
            expect(page.get_by_role('complementary', name='Installer la télécommande')).to_have_count(0)
            expect(install_dialog(page)).to_have_count(0)
            expect(page.get_by_role('button', name='Ajouter l’application')).to_have_count(0)
            assert not page.evaluate(PROMPT, 'accepted')
            expect(page.get_by_role('button', name='Installer', exact=True)).to_have_count(0)
            guard.assert_no_unexpected_api()
            print(f'PASS standalone init ({mode}): install card absent, prompt ignored', flush=True)
            context.close()
        http.dispose()
        browser.close()
    assert not failures, failures
    print('PASS companion PWA DEV smoke: real HTTP assets + synthetic browser lifecycle; no Neon/API writes', flush=True)
    print('NOT TESTED: actual installation/OS home screen, physical phone QR scan, native iOS Safari install and cross-storage pairing.', flush=True)


if __name__ == '__main__':
    main()