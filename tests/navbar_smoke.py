"""Navbar geometry, states, keyboard and dropdown checks; no live API writes."""
import os
import re
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from browser_bootstrap import install_browser_bootstrap
from contrast_helpers import assert_contrast
from timer_remote_smoke import MockAPIs, REMOTE_URL, open_phone

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3000')
TEAM_ID = 'a' * 64
SIZES = [(320, 568), (390, 844), (650, 600), (768, 1024), (800, 600), (820, 600), (1024, 576), (1366, 768), (1920, 1080)]

with sync_playwright() as p:
    browser = p.chromium.launch()
    for preference in ['reduce', 'no-preference']:
        context = browser.new_context(reduced_motion=preference, service_workers='block')
        install_browser_bootstrap(context)
        failing = [False]
        def api(route):
            path = route.request.url.split('/api/', 1)[1]
            if failing[0]:
                route.fulfill(status=503, json={'error': 'Indisponible'})
            elif path == 'teams':
                route.fulfill(json={'teams': [{'id': TEAM_ID, 'name': 'Équipe Expérience & Innovation', 'memberCount': 24}], 'activeTeamId': TEAM_ID})
            elif path == 'team':
                route.fulfill(json={'team': {'roster': [], 'duration': 120, 'warning': 30, 'sound': False, 'session': [], 'usedMoodMeters': []}, 'revision': 1})
            elif path == 'history':
                route.fulfill(json={'rounds': [], 'day': '2026-10-15'})
            elif path == 'jira':
                route.fulfill(json={'connected': False})
            elif path == 'participant-link':
                assert route.request.method == 'POST'
                route.fulfill(json={'url': 'https://participants.example/?team=fixture'})
            elif path == 'timer-remote':
                route.fulfill(status=503, json={'error': 'Remote controls are disabled in this test.'})
            else:
                raise AssertionError(path)
        context.route('**/api/**', api)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE + '/participants')
        navigation = page.get_by_role('navigation', name='Navigation du point quotidien')
        expect(navigation.get_by_role('link')).to_have_count(1)
        expect(navigation.get_by_role('link', name='Choisir une équipe', exact=True)).to_have_count(0)
        expect(page.get_by_role('button', name='Choisir une équipe : Équipe Expérience & Innovation', exact=True)).to_have_count(0)
        expect(navigation.get_by_role('link', name='Participants', exact=True)).to_have_attribute('aria-current', 'page')
        expect(navigation.get_by_role('button', name='Humeurs — Ajoutez au moins une personne présente pour continuer.', exact=True)).to_be_disabled()
        expect(navigation.get_by_role('button', name='Minuteur', exact=False)).to_be_disabled()
        page.get_by_role('link', name='Accueil du point quotidien Infomil Mauritius', exact=True).click()
        page.wait_for_url('**/teams*')
        if preference == 'reduce':
            assert_contrast(page, 'Teams')
        page.get_by_role('button', name='Ouvrir l’équipe Équipe Expérience & Innovation', exact=True).click()
        page.wait_for_url('**/participants*')
        expect(navigation.get_by_role('link', name='Participants', exact=True)).to_have_attribute('aria-current', 'page')
        page.keyboard.press('Control+Home')
        page.get_by_role('link', name='Aller au contenu', exact=True).focus()
        page.keyboard.press('Enter')
        expect(page.locator('#main-content')).to_be_focused()
        page.get_by_role('button', name='Actions de l’équipe', exact=True).click()
        page.get_by_role('menuitem', name='Lien participants', exact=True).click()
        share = page.get_by_role('dialog', name=re.compile('Portail participants'))
        expect(share).to_be_visible()
        expect(share.locator('#participant-share-url')).to_have_value(re.compile('https://participants.example/'))
        share.get_by_role('button', name='Fermer', exact=True).click()
        page.get_by_role('button', name='Actions de l’équipe', exact=True).click()
        page.get_by_role('menuitem', name='Nouveau bilan', exact=True).click()
        reset = page.get_by_role('dialog', name='Commencer un nouveau bilan ?', exact=True)
        expect(reset).to_be_visible()
        reset.get_by_role('button', name='Annuler', exact=True).click()
        expect(page.locator('#participants-page').get_by_role('button', name='Nouveau bilan', exact=True)).to_have_count(0)
        expect(page.locator('#participants-page a[href^="/manage-team"]')).to_have_count(0)
        for width, height in SIZES:
            page.set_viewport_size({'width': width, 'height': height})
            header = page.locator('.site-header')
            expect(header.locator('a[href^="/statistics"], a[href^="/daily-notes"]')).to_have_count(0)
            assert header.bounding_box()['height'] <= (112 if width <= 800 else 74)
            boxes = []
            for control in header.locator('a:not([href="#main-content"]), button').all():
                box = control.bounding_box()
                if not box:
                    continue
                assert box['height'] >= 43.9, (width, box)
                assert box['x'] >= 0 and box['x'] + box['width'] <= width + 1, (width, box)
                for previous in boxes:
                    overlap_x = min(box['x'] + box['width'], previous['x'] + previous['width']) - max(box['x'], previous['x'])
                    overlap_y = min(box['y'] + box['height'], previous['y'] + previous['height']) - max(box['y'], previous['y'])
                    assert overlap_x <= 1 or overlap_y <= 1, (width, box, previous)
                boxes.append(box)
            if width in [320, 1366] and preference == 'no-preference':
                page.screenshot(path=str(Path(tempfile.gettempdir()) / f'scrum-navbar-{width}.png'))
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            if preference == 'reduce' and width in [320, 1366]:
                assert_contrast(page, f'Participants {width}')
        page.get_by_role('link', name='Accueil du point quotidien Infomil Mauritius', exact=True).click()
        page.wait_for_url('**/teams*')
        page.get_by_role('button', name='Actions de l’équipe', exact=True).click()
        page.get_by_role('menuitem', name='Gérer l’équipe', exact=True).click()
        page.wait_for_url('**/manage-team*')
        if preference == 'reduce':
            assert_contrast(page, 'Manage team dialog')
        expect(page.locator('.site-header nav a[href="/teams"]')).to_have_count(0)
        page.keyboard.press('Escape')
        page.wait_for_url('**/teams*')
        page.get_by_role('link', name='Guide d’utilisation', exact=True).click()
        expect(page.get_by_role('link', name='Guide d’utilisation', exact=True)).to_have_attribute('aria-current', 'page')
        if preference == 'reduce':
            assert_contrast(page, 'Help')
        failing[0] = True
        page.reload()
        retry = page.get_by_role('button', name='Réessayer la sauvegarde Neon', exact=True)
        expect(retry).to_be_visible()
        for width, height in SIZES:
            page.set_viewport_size({'width': width, 'height': height})
            box = retry.bounding_box()
            assert box['x'] >= 0 and box['x'] + box['width'] <= width + 1
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        assert not errors, errors
        context.close()
        print(f'PASS navbar / nine sizes / team menu + creation / keyboard / offline / {preference}')
    remote_api = MockAPIs()
    host_context = browser.new_context(viewport={'width': 1366, 'height': 768}, reduced_motion='reduce', service_workers='block')
    phone_context = browser.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce', service_workers='block')
    host_guard = install_browser_bootstrap(host_context)
    phone_guard = install_browser_bootstrap(phone_context, fullscreen=False, intro=False)
    remote_api.register(host_context)
    remote_api.register(phone_context)
    host, phone = host_context.new_page(), phone_context.new_page()
    host.goto(BASE + '/participants')
    expect(host.locator('#participants-page')).to_be_visible()
    trigger = host.locator('#remote-pairing-button')
    pairing = host.get_by_role('dialog', name='Télécommande mobile', exact=True)
    trigger.hover()
    expect(pairing).to_be_visible()
    expect(pairing).to_have_attribute('aria-modal', 'false')
    pairing.hover()
    expect(pairing.locator('[data-testid="remote-qr"] svg')).to_be_visible()
    expect(pairing.get_by_role('button', name='Désactiver', exact=True)).to_have_count(0)
    qr = pairing.locator('[data-testid="remote-qr"] svg').inner_html()
    host.mouse.move(12, 150)
    expect(pairing).not_to_be_visible()
    trigger.focus()
    trigger.press('ArrowDown')
    expect(pairing).to_be_visible()
    host.keyboard.press('Escape')
    expect(pairing).not_to_be_visible()
    expect(trigger).to_be_focused()
    for width, height in [(320, 568), (390, 844), (1366, 768)]:
        host.set_viewport_size({'width': width, 'height': height})
        trigger.click()
        expect(pairing).to_be_visible()
        box = pairing.bounding_box()
        assert box and box['x'] >= 0 and box['x'] + box['width'] <= width + 1 and box['y'] + box['height'] <= height + 1, (width, box)
        host.screenshot(path=str(Path(tempfile.gettempdir()) / f'scrum-phone-dropdown-{width}.png'))
        pairing.get_by_role('button', name='Fermer la connexion mobile', exact=True).click()
    open_phone(phone, REMOTE_URL)
    expect(phone.get_by_text('En ligne', exact=True)).to_be_visible()
    assert_contrast(phone, 'Remote participants')
    expect(trigger).to_be_enabled()
    expect(trigger).to_have_attribute('aria-pressed', 'true')
    trigger.hover()
    expect(pairing.get_by_role('button', name='Déconnecter le téléphone', exact=True)).to_be_visible()
    trigger.click()
    expect(phone.get_by_text('Cette télécommande a été déconnectée depuis l’ordinateur', exact=False).first).to_be_visible()
    trigger.click()
    expect(pairing.get_by_role('button', name='Réactiver la connexion', exact=True)).to_be_visible()
    assert pairing.locator('[data-testid="remote-qr"] svg').inner_html() == qr
    pairing.get_by_role('button', name='Réactiver la connexion', exact=True).click()
    open_phone(phone, REMOTE_URL)
    expect(phone.get_by_text('En ligne', exact=True)).to_be_visible()
    expect(trigger).to_have_attribute('aria-pressed', 'true')
    expect(pairing).not_to_be_visible()
    assert not remote_api.deletes, 'Disconnect must retain the host session and team QR'
    live = {'snapshot': None, 'serverNow': 0, 'transport': 'redis'}
    host_context.route('**/api/live-session', lambda route: route.fulfill(json=live))
    spectator = host_context.new_page()
    spectator.goto(BASE + '/spectator')
    expect(spectator.get_by_text('En attente de la diffusion du facilitateur…', exact=True)).to_be_visible()
    assert_contrast(spectator, 'Spectator waiting')
    live['snapshot'] = {'speaker': 'Alice', 'nextSpeaker': 'Bob', 'teamName': 'Équipe test', 'running': False, 'remaining': 120, 'deadline': 0, 'completed': 0, 'total': 3}
    expect(spectator.get_by_role('timer')).to_have_text('02:00')
    assert_contrast(spectator, 'Spectator paused')
    live['snapshot']['remaining'] = -15
    expect(spectator.get_by_role('timer')).to_have_text('+00:15')
    assert_contrast(spectator, 'Spectator overtime')
    spectator.close()
    host_guard.assert_no_unexpected_api()
    phone_guard.assert_no_unexpected_api()
    host_context.close()
    phone_context.close()
    print('PASS phone dropdown: hover, cross-gap, leave, keyboard/Escape, click at three sizes, connected click disconnect, stable QR and reconnect')
    browser.close()