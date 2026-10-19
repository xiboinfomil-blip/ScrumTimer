"""Responsive participant-to-mood shuffle, retained until timer. All APIs mocked; no database writes."""
import os
from copy import deepcopy
from pathlib import Path
import tempfile
from time import monotonic
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from browser_bootstrap import TEAM_ID, install_browser_bootstrap, mauritius_day, team_fixture

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3001')
ID = TEAM_ID


def setup(browser, width, height, motion, count=12):
    context = browser.new_context(viewport={'width': width, 'height': height}, reduced_motion=motion, service_workers='block')
    bootstrap = install_browser_bootstrap(context)
    team = team_fixture(roster=[{'id': f'p{i}', 'name': f'Personne {i + 1}', 'present': True,
                   'mood': 2}
                  for i in range(count)] + [{'id': 'absent', 'name': 'Absente', 'present': False, 'mood': None}],
        postponed=[f'p{count - 1}'] if count > 1 else [])
    db = {'revision': 1, 'session': None, 'bootstrap': bootstrap}
    day = mauritius_day()

    def api(route):
        request = route.request
        path = urlparse(request.url).path
        if path == '/api/teams':
            route.fulfill(json={'teams': [{'id': ID, 'name': 'Équipe test', 'memberCount': count + 1}], 'activeTeamId': ID})
        elif path == '/api/team':
            if request.method == 'PUT':
                team.update(deepcopy(request.post_data_json['team']))
                db['revision'] += 1
                if team.get('session'):
                    db['session'] = team['session']
            route.fulfill(json={'team': deepcopy(team), 'revision': db['revision']})
        elif path == '/api/history':
            route.fulfill(json={'rounds': [], 'day': day})
        elif path == '/api/mood-meters/catalog':
            route.fulfill(json=[])
        elif path == '/api/daily-meter':
            route.fulfill(json={'day': day, 'meter': {'meterId': 'original', 'title': 'Baromètre original'}})
        elif path == '/api/meeting-settings':
            route.fulfill(json={'prompts': [], 'revision': 0})
        elif path == '/api/daily-hints':
            route.fulfill(json={'day': day, 'hints': []})
        else:
            route.fallback()

    context.route('**/api/**', api)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE + '/participants')
    start = page.get_by_role('button', name='Continuer vers les humeurs')
    expect(start).to_be_enabled(timeout=30000)
    return context, page, start, db, errors


def continue_to_timer(page, width, db):
    page.wait_for_url('**/mood*', timeout=15000)
    expect(page.get_by_role('dialog')).to_have_count(0)
    assert db['session'] is None
    if width <= 800:
        page.get_by_role('button', name='Humeurs de l’équipe', exact=True).click()
    # Voting must not discard or randomize the transient participant order.
    vote = page.locator('.checkin-person').first.get_by_role('button', name='Humeur 3 pour ', exact=False)
    expect(vote).to_be_enabled(timeout=30000)
    vote.click()
    assert db['session'] is None
    start = page.get_by_role('button', name='Continuer vers le minuteur')
    expect(start).to_be_enabled(timeout=30000)
    dialogs = []
    page.on('dialog', lambda dialog: dialogs.append(dialog.type))
    page.evaluate("""() => {
        globalThis.lineupDialogSeen = false;
        globalThis.lineupDialogObserver = new MutationObserver(() => {
            if (document.querySelector('[role="dialog"]')) globalThis.lineupDialogSeen = true;
        });
        globalThis.lineupDialogObserver.observe(document.body, {childList: true, subtree: true});
    }""")
    with page.expect_response(lambda response: urlparse(response.url).path == '/api/team'
                              and response.request.method == 'PUT'
                              and bool(response.request.post_data_json['team'].get('session'))):
        start.click()
    expect(page.get_by_role('dialog')).to_have_count(0)
    page.wait_for_url('**/timer*', timeout=15000)
    expect(page.get_by_role('button', name='Démarrer', exact=True)).to_be_visible()
    expect(page.get_by_role('dialog')).to_have_count(0)
    assert not dialogs
    assert not page.evaluate('globalThis.lineupDialogSeen'), 'Mood-to-timer must not open a shuffle dialog'
    page.evaluate('globalThis.lineupDialogObserver.disconnect()')
    expect(page.locator('#shuffle-button')).to_have_count(0)


with sync_playwright() as p:
    browser = p.chromium.launch()
    for width, height in [(320, 568), (390, 844), (768, 1024), (1024, 576), (1366, 768)]:
        for motion in ['no-preference', 'reduce']:
            context, page, start, db, errors = setup(browser, width, height, motion, 40)
            start.click()
            dialog = page.get_by_role('dialog', name='Place au hasard, place à l’équipe.')
            expect(dialog).to_be_visible()
            cards = dialog.locator('li[data-person-id]')
            expect(cards).to_have_count(40)
            expect(dialog.get_by_text('Absente', exact=True)).to_have_count(0)
            assert '/participants' in page.url and db['session'] is None
            for control in [dialog, dialog.get_by_role('button', name='Annuler'), dialog.get_by_role('button', name='Aller aux humeurs')]:
                box = control.bounding_box()
                assert box and box['x'] >= -1 and box['y'] >= -1, (width, height, box)
                assert box['x'] + box['width'] <= width + 1 and box['y'] + box['height'] <= height + 1, (width, height, box)
            if motion == 'no-preference':
                original = cards.evaluate_all('nodes => nodes.map(n => n.dataset.personId)')
                expect(dialog.get_by_role('status')).to_have_text('Le hasard redistribue les cartes…')
                mixing_started = monotonic()
                page.wait_for_function("original => JSON.stringify([...document.querySelectorAll('[role=dialog] li[data-person-id]')].map(n => n.dataset.personId)) !== JSON.stringify(original)", arg=original)
                moving = page.evaluate("""async () => {
                    const cards = [...document.querySelectorAll('[role=dialog] li[data-person-id]')];
                    const before = cards.map(card => card.getBoundingClientRect());
                    await new Promise(resolve => setTimeout(resolve, 100));
                    return cards.some((card, index) => {
                        const after = card.getBoundingClientRect();
                        return Math.abs(before[index].x - after.x) + Math.abs(before[index].y - after.y) > 1;
                    });
                }""")
                assert moving, 'Keyed participant cards must visibly move, not just change labels'
            expect(dialog.get_by_role('status')).to_have_text('L’ordre de passage est prêt', timeout=10000)
            if motion == 'no-preference':
                assert monotonic() - mixing_started >= 2.7, 'Shuffle must last three seconds'
            final = cards.evaluate_all('nodes => nodes.map(n => n.dataset.personId)')
            assert set(final) == {f'p{i}' for i in range(40)}, 'Shuffle includes every present teammate, even postponed ones'
            assert final != [f'p{i}' for i in range(40)], 'The final order must change when possible'
            assert db['session'] is None
            if width in [320, 1366]:
                page.screenshot(path=str(Path(tempfile.gettempdir()) / f'scrum-lineup-{width}-{motion}.png'))
            if motion == 'reduce':
                assert dialog.evaluate("e => e.getAnimations({subtree:true}).filter(a => a.playState === 'running').length") == 0
            expect(dialog).not_to_be_visible(timeout=10000)
            continue_to_timer(page, width, db)
            assert db['session'] == final, (db['session'], final)
            assert not errors, errors
            db['bootstrap'].assert_no_unexpected_api()
            context.close()
            print(f'PASS animated handoff {width}x{height} {motion}')

    context, page, start, db, errors = setup(browser, 320, 568, 'no-preference', 2)
    for repeat in range(2):
        start.click()
        page.get_by_role('dialog').get_by_role('button', name='Annuler', exact=True).click()
        expect(page.get_by_role('dialog')).not_to_be_visible()
        page.wait_for_timeout(5100)
        assert '/participants' in page.url and db['session'] is None
        start.click()
        page.get_by_role('dialog').press('Escape')
        expect(page.get_by_role('dialog')).not_to_be_visible()
        assert '/participants' in page.url and db['session'] is None
        start.click()
        page.get_by_role('dialog').get_by_role('button', name='Aller aux humeurs').click()
        page.wait_for_url('**/mood*')
        expect(page.get_by_role('dialog')).to_have_count(0)
        assert db['session'] is None
        if repeat == 0:
            # Full navigation deliberately clears the transient preview before reopening.
            page.goto(BASE + '/participants')
            expect(start).to_be_enabled(timeout=30000)
    continue_to_timer(page, 320, db)
    assert set(db['session']) == {'p0', 'p1'} and not errors
    db['bootstrap'].assert_no_unexpected_api()
    context.close()
    print('PASS cancel, Escape, reopen and skip')

    context, page, start, db, errors = setup(browser, 320, 568, 'reduce', 1)
    start.click()
    expect(page.get_by_role('dialog').locator('li[data-person-id]')).to_have_count(1)
    page.wait_for_url('**/mood*')
    expect(page.get_by_role('dialog')).to_have_count(0)
    assert db['session'] is None and not errors
    db['bootstrap'].assert_no_unexpected_api()
    context.close()
    print('PASS single participant')
    browser.close()