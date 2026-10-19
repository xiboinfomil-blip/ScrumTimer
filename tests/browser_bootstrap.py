"""Explicit sync Playwright setup for isolated UI suites (not fullscreen/intro tests).

Call immediately after new_context(service_workers='block'), before suite routes
and pages. Later routes win in Playwright; their unknown branches should call
route.fallback() to reach this fail-closed guard, never route.continue_().
Keep the returned state and call assert_no_unexpected_api() before closing.
No application hooks, storage flags, or browser API monkeypatches except the
existing test-only Fullscreen API emulator are needed.
"""
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from playwright.sync_api import expect

from fullscreen_helpers import emulate_fullscreen


TEAM_ID = 'a' * 64
WARNING_SECONDS = 30
EXPECT_TIMEOUT_MS = 15000  # Longer than the hydrated five-second introduction.
MAURITIUS = timezone(timedelta(hours=4))


def mauritius_day(now=None):
    """Current application day, optionally from an aware datetime for fixtures."""
    return (now or datetime.now(timezone.utc)).astimezone(MAURITIUS).date().isoformat()


def team_fixture(names=(), *, roster=None, **options):
    """Fresh independent team state; override options/roster without aliasing."""
    team = {
        'roster': roster if roster is not None else [
            {'id': f'p{i}', 'name': name, 'present': True, 'mood': None,
             'moodUpdatedAt': None}
            for i, name in enumerate(names)
        ],
        'session': [], 'duration': 120, 'warning': WARNING_SECONDS,
        'sound': False, 'usedMoodMeters': [], 'currentMoodSlide': None,
    }
    team.update(options)
    if team['warning'] not in (0, 10, 15, 30, 60):
        raise ValueError('Unsupported warning threshold in browser fixture')
    return deepcopy(team)


def team_options(name='Équipe test', *, team_id=TEAM_ID, member_count=0):
    """Single-team /api/teams response with a valid scoped identifier."""
    return {'teams': [{'id': team_id, 'name': name, 'memberCount': member_count}],
            'activeTeamId': team_id}


@dataclass
class BrowserBootstrap:
    unexpected_api: list = field(default_factory=list)

    def block_unexpected_api(self, route):
        self.unexpected_api.append(f'{route.request.method} {route.request.url}')
        route.fulfill(status=501, json={'error': 'Unexpected API blocked by browser test'})

    def assert_no_unexpected_api(self):
        assert not self.unexpected_api, self.unexpected_api


def install_browser_bootstrap(context, *, fullscreen=True, intro=True, api_guard=True):
    """Install before routes/pages; return per-context unexpected-API tracking.

    intro=True dismisses the real welcome close button, including after reload
    and in new pages/popups. Set intro/fullscreen=False in behavior-specific
    suites. expect.set_options is Playwright's public assertion configuration,
    not a monkeypatch; action waits are configured on this context only.
    """
    state = BrowserBootstrap()
    expect.set_options(timeout=EXPECT_TIMEOUT_MS)
    context.set_default_timeout(EXPECT_TIMEOUT_MS)
    if fullscreen:
        emulate_fullscreen(context)
    if api_guard:
        # Register FIRST: suite-specific routes registered later take priority.
        context.route('**/api/**', state.block_unexpected_api)
    if intro:
        def install_intro_handler(page):
            close = page.get_by_role('button', name='Fermer l’introduction', exact=True)
            page.add_locator_handler(close, lambda: close.click())

        context.on('page', install_intro_handler)
        for page in context.pages:
            install_intro_handler(page)
    return state


# Run this module directly for browser-free setup/fixture contract tests.
if __name__ == '__main__':
    import unittest
    from unittest.mock import Mock, patch

    class BootstrapTests(unittest.TestCase):
        def test_defaults_and_registration_order(self):
            context = Mock(pages=[])
            with patch.object(expect, 'set_options') as options:
                state = install_browser_bootstrap(context)
            options.assert_called_once_with(timeout=EXPECT_TIMEOUT_MS)
            context.set_default_timeout.assert_called_once_with(EXPECT_TIMEOUT_MS)
            context.add_init_script.assert_called_once()
            self.assertEqual(context.route.call_args.args[0], '**/api/**')
            route = Mock()
            route.request.method = 'POST'
            route.request.url = 'https://example.invalid/api/unexpected'
            context.route.call_args.args[1](route)
            self.assertEqual(route.fulfill.call_args.kwargs['status'], 501)
            route.continue_.assert_not_called()
            route.fallback.assert_not_called()
            with self.assertRaises(AssertionError):
                state.assert_no_unexpected_api()
            # A later suite route is not replaced by the bootstrap guard.
            handler = Mock()
            context.route('**/api/team', handler)
            self.assertEqual(context.route.call_args.args, ('**/api/team', handler))

        def test_intro_handler_existing_and_future_pages(self):
            existing, future = Mock(), Mock()
            context = Mock(pages=[existing])
            with patch.object(expect, 'set_options'):
                state = install_browser_bootstrap(context, fullscreen=False)
            event, register = context.on.call_args.args
            self.assertEqual(event, 'page')
            register(future)
            for page in (existing, future):
                page.get_by_role.assert_called_once_with(
                    'button', name='Fermer l’introduction', exact=True)
                locator, dismiss = page.add_locator_handler.call_args.args
                self.assertIs(locator, page.get_by_role.return_value)
                dismiss()
                locator.click.assert_called_once_with()
            state.assert_no_unexpected_api()

        def test_opt_outs(self):
            context = Mock(pages=[])
            with patch.object(expect, 'set_options'):
                state = install_browser_bootstrap(
                    context, fullscreen=False, intro=False, api_guard=False)
            context.add_init_script.assert_not_called()
            context.on.assert_not_called()
            context.route.assert_not_called()
            state.assert_no_unexpected_api()

        def test_fixtures_are_independent_and_valid(self):
            roster = [{'id': 'alice', 'name': 'Alice', 'present': True, 'mood': 2}]
            first = team_fixture(roster=roster, postponed=['alice'])
            first['roster'][0]['name'] = 'Changed'
            first['usedMoodMeters'].append('deck')
            self.assertEqual(roster[0]['name'], 'Alice')
            self.assertEqual(team_fixture(['Bob'])['usedMoodMeters'], [])
            self.assertEqual(first['warning'], WARNING_SECONDS)
            with self.assertRaises(ValueError):
                team_fixture(warning=20)
            self.assertEqual(len(TEAM_ID), 64)
            self.assertEqual(team_options()['activeTeamId'], TEAM_ID)

        def test_mauritius_midnight(self):
            instant = datetime(2026, 10, 19, 20, tzinfo=timezone.utc)
            self.assertEqual(mauritius_day(instant), '2026-10-20')
            self.assertGreater(EXPECT_TIMEOUT_MS, 5000)

    unittest.main()