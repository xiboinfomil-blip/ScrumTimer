"""Navbar geometry, states, keyboard and dropdown checks; no live API writes."""
import os
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from browser_bootstrap import install_browser_bootstrap

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
        page.get_by_role('button', name='Ouvrir l’équipe Équipe Expérience & Innovation', exact=True).click()
        page.wait_for_url('**/participants*')
        expect(navigation.get_by_role('link', name='Participants', exact=True)).to_have_attribute('aria-current', 'page')
        page.keyboard.press('Control+Home')
        page.get_by_role('link', name='Aller au contenu', exact=True).focus()
        page.keyboard.press('Enter')
        expect(page.locator('#main-content')).to_be_focused()
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
        page.get_by_role('link', name='Accueil du point quotidien Infomil Mauritius', exact=True).click()
        page.wait_for_url('**/teams*')
        page.get_by_role('button', name='Gérer l’équipe Équipe Expérience & Innovation', exact=True).click()
        page.wait_for_url('**/manage-team*')
        expect(page.locator('.site-header nav a[href="/teams"]')).to_have_count(0)
        page.keyboard.press('Escape')
        page.wait_for_url('**/teams*')
        page.get_by_role('link', name='Guide d’utilisation', exact=True).click()
        expect(page.get_by_role('link', name='Guide d’utilisation', exact=True)).to_have_attribute('aria-current', 'page')
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
    browser.close()