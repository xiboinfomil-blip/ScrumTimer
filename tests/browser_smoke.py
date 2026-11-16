"""Master workflow with mocked APIs and forbidden browser business storage.

Timer edge cases live in fresh_round_smoke.py and timer_recovery_smoke.py;
remote slides/GIFs and viewport matrices have their own focused suites.
"""
from playwright.sync_api import expect, sync_playwright

from meeting_features_smoke import BASE, MockMeeting, NAMES, TEAM_ID


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            for width, height in [(320, 568), (1366, 768)]:
                mock = MockMeeting()
                mock.team['roster'].append({
                    'id': 'absent', 'name': 'Absent', 'present': False,
                    'mood': None, 'moodUpdatedAt': None,
                })
                try:
                    page = mock.page(browser, width, height)
                    page.goto(BASE + '/participants?team=' + TEAM_ID)
                    expect(page.get_by_role('heading', name='Présences', exact=True)).to_be_visible()
                    expect(page.locator('#participants-page script')).to_have_count(0)
                    mock.timer(page)
                    first = page.locator('#speaker-name').inner_text()
                    assert first in NAMES
                    page.clock.install()
                    page.locator('#start-button').click()
                    page.clock.run_for(2000)
                    page.locator('#start-button').click()
                    paused = page.locator('#timer-display').inner_text()
                    page.clock.run_for(2000)
                    expect(page.locator('#timer-display')).to_have_text(paused)
                    page.get_by_role('dialog', name='Économiseur d’écran', exact=True).get_by_role('button', name='Revenir au minuteur', exact=True).click()
                    page.locator('#next-button').click()
                    expect(page.locator('#speaker-name')).not_to_have_text(first)
                    assert page.locator('#speaker-name').inner_text() in NAMES
                    page.clock.run_for(1000)
                    page.locator('#next-button').click()
                    summary = page.get_by_role('region', name='Point quotidien du jour', exact=True)
                    expect(summary).to_be_visible()
                    assert len(mock.rounds) == 1
                    assert {p['id'] for p in mock.rounds[0]['people']} == {'alice', 'bob'}
                    assert all(p['speakingSeconds'] >= 1 for p in mock.rounds[0]['people'])
                    page.reload()
                    expect(summary).to_be_visible()
                    assert len(mock.rounds) == 1
                    print(f'PASS master workflow {width}x{height}: safe names, absent excluded, pause, handoff, archive, reload; all APIs mocked', flush=True)
                finally:
                    mock.close()
        finally:
            browser.close()


if __name__ == '__main__':
    main()
