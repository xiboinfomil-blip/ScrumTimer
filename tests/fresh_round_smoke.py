"""Reset/re-entry/checkpoint invalidation; all API traffic isolated from Neon."""
import os

from playwright.sync_api import expect, sync_playwright
from browser_bootstrap import install_browser_bootstrap
from postponement_smoke import WorkspaceMock, saved

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3001').rstrip('/')


def show_votes(page, width):
    if width < 801:
        page.get_by_role('button', name='Humeurs de l’équipe', exact=True).click()


def show_bob(page):
    if page.locator('.checkin-person').filter(has_text='Bob').count() == 0:
        page.get_by_role('button', name='Page suivante', exact=True).click()


def move_bob(page, width, present):
    if width < 650:
        group = page.get_by_role('group', name='Afficher les présences', exact=True)
        group.get_by_role('button', name='Présents' if present else 'Absents', exact=False).click()
    section = page.locator('#attendance-present' if present else '#attendance-absent')
    page.locator('#attendance-search').fill('Bob')
    section.locator('.checkin-person').filter(has_text='Bob').locator('.attendance-button').click()
    saved(page)


def run_case(browser, width, height, case):
    context = browser.new_context(viewport={'width': width, 'height': height},
                                  reduced_motion='reduce', service_workers='block')
    bootstrap = install_browser_bootstrap(context)
    db = WorkspaceMock()
    context.route('**/api/**', db.api)
    context.route('**/mood-meters/catalog.json', lambda r: r.fulfill(json={'remote': True}))
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    try:
        page.goto(BASE + '/mood')
        saved(page)
        show_votes(page, width)
        page.get_by_role('button', name='Humeur 2 pour Alice', exact=True).click()
        show_bob(page)
        page.get_by_role('button', name='Reporter l’humeur et le passage de Bob', exact=True).click()
        saved(page)
        page.get_by_role('button', name='Continuer vers le minuteur', exact=False).click()
        page.locator('#start-button').click()
        expect(page.locator('#start-button')).to_contain_text('Pause')
        page.locator('#start-button').click()
        page.wait_for_function("Object.keys(sessionStorage).some(k => k.startsWith('standup.timer.tab.v1:'))")
        page.get_by_role('link', name='Participants', exact=True).click()
        expect(page.locator('#participants-page')).to_be_visible()
        if case == 'reset':
            page.get_by_role('button', name='Nouveau bilan', exact=True).click()
            modal = page.get_by_role('dialog', name='Commencer un nouveau bilan ?', exact=True)
            modal.get_by_role('button', name='Annuler', exact=True).click()
            assert page.evaluate("Object.keys(sessionStorage).some(k => k.startsWith('standup.timer.tab.v1:'))")
            page.get_by_role('button', name='Nouveau bilan', exact=True).click()
            modal.get_by_role('button', name='Recommencer', exact=True).click()
            saved(page)
            assert all(p['present'] and p['mood'] is None for p in db.team['roster'])
        else:
            move_bob(page, width, True)
            # Immediate removal is essential: reverting to the original durable
            # roster must not resurrect the old, otherwise context-valid timer.
            assert not page.evaluate("Object.keys(sessionStorage).some(k => k.startsWith('standup.timer.tab.v1:'))")
            move_bob(page, width, False)
            page.locator('#attendance-search').fill('')
        assert not db.team.get('postponed'), db.team
        assert not page.evaluate("Object.keys(sessionStorage).some(k => k.startsWith('standup.timer.tab.v1:'))")
        if case == 'checkpoint':
            page.reload()
            saved(page)
            assert not page.evaluate("Object.keys(sessionStorage).some(k => k.startsWith('standup.timer.tab.v1:'))")
        page.get_by_role('link', name='Humeurs', exact=True).click()
        show_votes(page, width)
        if case == 'reset':
            page.get_by_role('button', name='Humeur 2 pour Alice', exact=True).click()
        show_bob(page)
        bob = page.locator('.checkin-person').filter(has_text='Bob')
        expect(bob.get_by_role('button', name='Reporter l’humeur et le passage de Bob', exact=True)).to_have_attribute('aria-pressed', 'false')
        expect(page.get_by_role('button', name='Continuer vers le minuteur', exact=False)).to_be_disabled()
        bootstrap.assert_no_unexpected_api()
        assert not db.unexpected and not errors, (db.unexpected, errors)
        assert not db.history_posts
        print(f'PASS fresh-round {case} {width}x{height}: no inherited wait or timer recovery')
    finally:
        context.close()


if __name__ == '__main__':
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for width, height in [(320, 568), (1366, 768)]:
            for case in ['reset', 'attendance', 'checkpoint']:
                run_case(browser, width, height, case)
        browser.close()