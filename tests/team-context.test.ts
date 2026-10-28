import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTeamContext, teamContextUrl } from '../src/lib/team/team-context.ts';

test('URL team context restores only a team present in the database list', () => {
  assert.equal(resolveTeamContext(['a', 'b'], 'b', 'a'), 'b');
  for (const requested of [null, '', 'deleted', '<script>']) {
    assert.equal(resolveTeamContext(['a', 'b'], requested, 'a'), 'a');
  }
});

test('team context URLs preserve the current route, other parameters and anchor', () => {
  assert.equal(teamContextUrl('https://example.test/mood?view=all#meter', 'b'), '/mood?view=all&team=b#meter');
  assert.equal(teamContextUrl('https://example.test/timer?team=a', 'b'), '/timer?team=b');
});