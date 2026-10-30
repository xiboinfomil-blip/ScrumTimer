"""Responsive panels, long names and short landscape; mocked APIs, no live writes."""
import os
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('BROWSER_TEST_URL', 'http://localhost:3000')
SIZES = [(320, 568), (390, 844), (768, 1024), (820, 568), (900, 600), (1024, 576), (1366, 768)]
with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(reduced_motion='reduce')
    roster = [dict(id=str(i), name='Une personne avec un nom particulièrement long ' + str(i), present=True, mood=2, moodUpdatedAt=None) for i in range(30)]
    team = dict(roster=roster, session=[person['id'] for person in roster], duration=120, warning=30, sound=False, usedMoodMeters=[])
    def api(route):
        path = route.request.url.split('/api/', 1)[1]
        if path == 'teams':
            value = dict(teams=[dict(id='a'*64, name='Une très longue équipe de développement', memberCount=30)], activeTeamId='a'*64)
        elif path == 'team':
            value = dict(team=team, revision=1)
        elif path == 'history':
            value = dict(rounds=[])
        elif path == 'daily-meter':
            value = dict(day='2026-10-15', meter=dict(meterId='original', title='Baromètre original'))
        else:
            value = []
        route.fulfill(json=value)
    context.route('**/api/**', api)
    context.route('**/mood-meters/catalog.json', lambda route: route.fulfill(json={'remote': True}))
    page = context.new_page()
    for path in ['/participants', '/mood', '/timer']:
        page.goto(BASE + path)
        expect(page.locator('[data-route-transition]')).to_be_visible()
        expect(page.get_by_role('button', name='Choisir une équipe : Une très longue équipe de développement')).to_have_count(0)
        for width, height in SIZES:
            page.set_viewport_size(dict(width=width, height=height))
            page.wait_for_function('document.documentElement.scrollWidth <= innerWidth')
            page.evaluate('async () => { for (let i=0;i<3;i++) await new Promise(resolve => requestAnimationFrame(resolve)); }')
            # Detect controls clipped by overflow ancestors, not just page overflow.
            clipped = page.evaluate('''() => [...document.querySelectorAll('main button, main select, header a, header button')].filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden').flatMap(e => {
                const r=e.getBoundingClientRect(); if (!r.width || !r.height || e.getAttribute('href') === '#main-content') return [];
                let left=0,top=0,right=innerWidth,bottom=innerHeight;
                for(let p=e.parentElement;p;p=p.parentElement){const s=getComputedStyle(p), b=p.getBoundingClientRect();
                    if(['hidden','clip','auto','scroll'].includes(s.overflowX)){left=Math.max(left,b.left);right=Math.min(right,b.right)}
                    if(['hidden','clip','auto','scroll'].includes(s.overflowY)){top=Math.max(top,b.top);bottom=Math.min(bottom,b.bottom)}
                }
                return r.left<left-2 || r.right>right+2 || r.top<top-2 || r.bottom>bottom+2 ? [{text:e.textContent.slice(0,70),id:e.id,rect:[r.x,r.y,r.width,r.height],bounds:[left,top,right,bottom]}] : [];
            })''')
            assert not clipped, (path, width, height, clipped)
            if path == '/timer':
                stage = page.locator('#timer-stage').bounding_box()
                assert stage and stage['width'] >= 90 and stage['height'] >= 90, (width, height, stage)
            for pagination in page.locator('.list-pagination:visible').all():
                if pagination.evaluate("e => getComputedStyle(e).visibility === 'hidden'"):
                    continue
                boxes = [button.bounding_box() for button in pagination.locator('button').all()]
                for i, a in enumerate(boxes):
                    for b in boxes[i + 1:]:
                        assert not (a['x'] < b['x'] + b['width'] - 1 and b['x'] < a['x'] + a['width'] - 1 and a['y'] < b['y'] + b['height'] - 1 and b['y'] < a['y'] + a['height'] - 1), (path, width, 'overlapping pagination', a, b)
            if width in [320, 820, 1024]:
                page.screenshot(path=str(Path(tempfile.gettempdir()) / f'scrum-responsive-{path[1:]}-{width}.png'))
            print('PASS', path, width, height)
    attempts = [0]
    recovery = [False]
    def unavailable(route):
        attempts[0] += 1
        route.fulfill(json=[]) if recovery[0] else route.fulfill(status=503, json={'error': 'Catalogue temporairement indisponible.'})
    context.route('**/api/mood-meters/catalog', unavailable)
    page.goto(BASE + '/mood')
    expect(page.locator('#meter-source-note')).to_have_text('Catalogue temporairement indisponible.', timeout=15000)
    assert attempts[0] == 4, 'Initial read plus three automatic read retries'
    recovery[0] = True
    page.get_by_role('button', name='Réessayer le catalogue').click()
    expect(page.locator('#meter-catalogue-select')).to_have_value('-2')
    assert attempts[0] == 5
    print('PASS catalogue 503 message and retry recovery')
    context.close()
    browser.close()