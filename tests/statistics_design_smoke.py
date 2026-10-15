"""Strict viewport statistics contracts. Mocked APIs only; no live database writes."""
import os
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3000')
SIZES = [(320, 568), (390, 844), (768, 1024), (820, 568), (1024, 576), (1366, 768), (1920, 1080)]
now = datetime.now(timezone.utc) - timedelta(minutes=1)
people = [dict(id=str(i), name=f'Participant au nom particulièrement long {i}',
               mood=None if i == 11 else i % 4 + 1, speakingSeconds=30 + i,
               budgetSeconds=120, timeUp=False, score=1000 if i < 2 else 1000 - i * 20,
               meterTitle='Baromètre original') for i in range(12)]
# Recorded zero and unavailable are deliberately different, and first place is tied.
people[10]['score'] = 0
people[11].update(score=None, speakingSeconds=0)
rounds = [dict(id=f'recent-{i}', completedAt=(now - timedelta(minutes=i)).isoformat(), people=people)
          for i in range(12)]
rounds.append(dict(id='expired', completedAt=(now - timedelta(days=8)).isoformat(), people=people))


def settle(page):
    # ResizeObserver pagination and finite action/route motion must settle before geometry.
    page.evaluate('''async () => {
      for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame);
      for (const a of document.getAnimations()) {
        if (a.effect?.getTiming().iterations !== Infinity) a.finish();
      }
      for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame);
    }''')


def assert_viewport(page, case):
    settle(page)
    failures = page.evaluate('''() => {
      const root = document.querySelector('[data-statistics-root]');
      const visible = e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
      const bad = [];
      for (const e of [document.documentElement, document.body, root,
        ...root.querySelectorAll('[data-statistics-pane], section, ol, ul')]) {
        if (!visible(e)) continue;
        if (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1)
          bad.push([e.tagName, e.className, e.clientHeight, e.scrollHeight, e.clientWidth, e.scrollWidth]);
      }
      const r = root.getBoundingClientRect();
      for (const e of root.querySelectorAll('button, li')) {
        if (!visible(e)) continue;
        const b = e.getBoundingClientRect();
        if (b.top < r.top - 1 || b.bottom > r.bottom + 1 || b.left < r.left - 1 || b.right > r.right + 1)
          bad.push(['clipped', e.outerHTML.slice(0, 180), b.toJSON()]);
        if (e.tagName === 'BUTTON' && (b.height < 43.9 || b.width < 43.9))
          bad.push(['small control', e.textContent, b.toJSON()]);
      }
      return bad;
    }''')
    assert not failures, (case, failures)
    assert page.evaluate('scrollX === 0 && scrollY === 0'), case


def select_view(page, width, label):
    group = 'Sections des statistiques' if width < 1024 else (
        'Sections activité et classement' if label in ['Activité', 'Classement'] else 'Sections humeurs et points')
    page.get_by_role('navigation', name=group, exact=True).get_by_role('button', name=label, exact=True).click()
    settle(page)


def visit_pages(page, section, selector, attr, expected):
    seen = set()
    ranking = {}
    for _ in range(20):
        settle(page)
        assert_viewport(page, ('pagination', attr))
        seen.update(section.locator(selector).evaluate_all(f'els => els.map(e => e.getAttribute("{attr}"))'))
        if attr == 'data-person':
            for row in section.locator(selector).all():
                ranking[row.get_attribute(attr)] = (row.get_attribute('data-rank'), row.get_attribute('data-score'))
        forward = section.get_by_role('button', name='Page suivante', exact=True)
        if forward.is_disabled():
            break
        forward.click()
    assert seen == expected, (seen, expected)
    if ranking:
        assert ranking['0'][0] == ranking['1'][0] == '1', ranking
        assert ranking['2'][0] == '3', ranking
        assert ranking['10'] == ('11', '0'), ranking
        assert ranking['11'] == ('none', 'unavailable'), ranking
    while section.get_by_role('button', name='Page précédente', exact=True).is_enabled():
        section.get_by_role('button', name='Page précédente', exact=True).click()
        settle(page)


with sync_playwright() as p:
    browser = p.chromium.launch()
    for motion in ['reduce', 'no-preference']:
        context = browser.new_context(reduced_motion=motion)
        # Development tooling must not cover the application's 44px controls.
        context.add_init_script("document.addEventListener('DOMContentLoaded', () => { const style = document.createElement('style'); style.textContent = 'nextjs-portal { display: none !important; }'; document.head.append(style); });")
        state, requests = ['populated'], [0]

        def api(route):
            path = route.request.url.split('/api/', 1)[1]
            if path == 'teams':
                route.fulfill(json={'teams': [{'id': 'a' * 64, 'name': 'Équipe Produit & Innovation', 'memberCount': 12}], 'activeTeamId': 'a' * 64})
            elif path == 'team':
                route.fulfill(json={'team': {'roster': [], 'session': [], 'duration': 120, 'warning': 30, 'sound': False, 'usedMoodMeters': []}, 'revision': 1})
            elif path == 'history':
                requests[0] += 1
                if state[0] == 'error' and requests[0] > 1:
                    route.fulfill(status=503, json={'error': 'Unavailable'})
                else:
                    route.fulfill(json={'rounds': rounds if state[0] == 'populated' else []})
            else:
                raise AssertionError(path)

        context.route('**/api/**', api)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        for mode in ['populated', 'empty', 'error']:
            state[0], requests[0] = mode, 0
            page.goto(BASE + '/statistics')
            action = 'Réessayer' if mode == 'error' else 'Actualiser'
            expect(page.get_by_role('button', name=action, exact=True)).to_be_enabled()
            expect(page.locator('[aria-label="Indicateurs des cinq derniers jours"] dd').first).to_have_text(
                '12' if mode == 'populated' else '—' if mode == 'error' else '0')
            if mode == 'error':
                expect(page.locator('[data-statistics-root] [role="status"]')).to_contain_text('Neon indisponible · Aucune donnée de remplacement.')
            for width, height in SIZES:
                page.set_viewport_size({'width': width, 'height': height})
                case = (mode, width, height, motion)
                for label, heading in [('Activité', 'daily-heading'), ('Classement', 'leaderboard-heading'),
                                       ('Humeurs', 'moods-heading'), ('Points récents', 'recent-heading')]:
                    select_view(page, width, label)
                    expect(page.locator('#' + heading)).to_be_visible()
                    assert_viewport(page, (*case, label))
                    section = page.locator('#' + heading).locator('..').locator('..')
                    if label == 'Activité' and mode != 'error':
                        expect(section.locator('ol > li')).to_have_count(5)
                        expect(section.locator('svg')).to_have_count(5)
                    if mode == 'populated' and label == 'Classement':
                        visit_pages(page, section, '[data-person]', 'data-person', {str(i) for i in range(12)})
                        expect(section.locator('[data-person="0"]')).to_have_attribute('data-rank', '1')
                        # Exact shared rank remains correct even across a one-row page boundary.
                        section.get_by_role('button', name='Détails de ' + people[0]['name'], exact=True).click()
                        dialog = page.get_by_role('dialog', name=people[0]['name'], exact=True)
                        expect(dialog).to_be_visible()
                        expect(dialog.get_by_text('Rang 1 · égalités partagées', exact=True)).to_be_visible()
                        dialog.get_by_role('button', name='Fermer', exact=True).click()
                        expect(dialog).not_to_be_visible()
                    if mode == 'populated' and label == 'Points récents':
                        visit_pages(page, section, '[data-round]', 'data-round', {f'recent-{i}' for i in range(10)})
                        section.locator('[data-round] button').first.click()
                        dialog = page.get_by_role('dialog', name='Point du', exact=False)
                        expect(dialog).to_be_visible()
                        settle(page)
                        # The dialog itself also uses measured rows, rather than a long expanded summary.
                        assert dialog.locator('.statistics-round-people').evaluate('e => e.scrollHeight <= e.clientHeight + 1'), case
                        dialog.get_by_role('button', name='Comprendre le score de ' + people[0]['name'], exact=True).click()
                        score = page.get_by_role('dialog', name='Score de', exact=False)
                        expect(score).to_be_visible()
                        score.get_by_role('button', name='Fermer', exact=True).click()
                        expect(score).not_to_be_visible()
                        dialog.get_by_role('button', name='Fermer', exact=True).click()
                        expect(dialog).not_to_be_visible()
                    assert_viewport(page, (*case, label, 'after interactions'))
                page.get_by_role('button', name='Comprendre ces statistiques', exact=True).click()
                methodology = page.get_by_role('dialog', name='Comprendre ces statistiques', exact=True)
                expect(methodology).to_be_visible()
                expect(methodology.get_by_text('5 jours UTC, aujourd’hui inclus.', exact=True)).to_be_visible()
                if mode == 'error':
                    expect(methodology.get_by_role('alert')).to_contain_text('Réessayez le chargement')
                methodology.get_by_role('button', name='Fermer', exact=True).click()
                expect(methodology).not_to_be_visible()
                assert_viewport(page, (*case, 'methodology closed'))
                if mode == 'populated' and motion == 'reduce' and width in [320, 1366]:
                    select_view(page, width, 'Activité')
                    select_view(page, width, 'Humeurs')
                    page.screenshot(path=str(Path(tempfile.gettempdir()) / f'scrum-statistics-{width}.png'))
            if mode == 'error':
                state[0] = 'populated'
                page.get_by_role('button', name='Réessayer', exact=True).click()
                expect(page.locator('[aria-label="Indicateurs des cinq derniers jours"] dd').first).to_have_text('12')
        assert not errors, errors
        context.close()
        print(f'PASS statistics / populated12 + empty + error/retry / seven sizes / all tabs + pagination + dialogs / {motion}')
    browser.close()