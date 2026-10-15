import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_DISCUSSION_PROMPTS, summarizeRoundFeedback, validateDiscussionPrompts, validateMeetingSettings, validateRoundFeedback, validateRoundId } from '../src/lib/meeting-settings.ts';

test('discussion prompts validate exact bounded text and independent revisions', () => {
  assert.deepEqual(validateDiscussionPrompts([...DEFAULT_DISCUSSION_PROMPTS]), DEFAULT_DISCUSSION_PROMPTS);
  assert.deepEqual(validateMeetingSettings({ prompts: ['Blocages ?'], revision: 0 }), { prompts: ['Blocages ?'], revision: 0 });
  assert.equal(validateDiscussionPrompts(['😀'.repeat(160)])[0].length, 320, 'limits use Unicode characters like PostgreSQL length');
  assert.equal(validateDiscussionPrompts(Array(5).fill('Question')).length, 5);
  for (const prompts of [null, [], Array(6).fill('Q'), [''], [' Q'], ['Q '], ['Q\n'], ['a'.repeat(161)], ['😀'.repeat(161)], [4], ['A\u0000B']]) assert.throws(() => validateDiscussionPrompts(prompts));
  assert.throws(() => validateDiscussionPrompts(Array(1)), 'sparse arrays cannot bypass required text');
  for (const revision of [-1, 1.2, '1', null, Infinity, 2147483647]) assert.throws(() => validateMeetingSettings({ prompts: ['Q'], revision }));
  assert.throws(() => validateMeetingSettings({ prompts: ['Q'], revision: 0, teamId: 'forged' }));
  assert.throws(() => validateMeetingSettings({ prompts: ['Q'] }));
  const defaults = validateDiscussionPrompts([...DEFAULT_DISCUSSION_PROMPTS]); defaults[0] = 'Changed';
  assert.equal(DEFAULT_DISCUSSION_PROMPTS[0], 'Qu’avez-vous fait hier ?');
});
test('feedback is a strict three-value contract with no free text or inferred identity', () => {
  for (const value of ['utile', 'mitige', 'pas-utile']) assert.equal(validateRoundFeedback({ roundId: 'round-1', participantId: 'person-1', value }).value, value);
  for (const roundId of ['', 'x'.repeat(101), '../round', 'round\n']) assert.throws(() => validateRoundId(roundId));
  for (const override of [{ value: 'Utile' }, { value: null }, { participantId: '' }, { participantId: 'x'.repeat(101) }, { participantId: 'A\n' }, { comment: 'Sensitive text' }, { teamId: 'other' }]) assert.throws(() => validateRoundFeedback({ roundId: 'r', participantId: 'p', value: 'utile', ...override }));
  assert.deepEqual(summarizeRoundFeedback('r', []), { roundId: 'r', responses: [], counts: { utile: 0, mitige: 0, 'pas-utile': 0 } });
  assert.deepEqual(summarizeRoundFeedback('r', [{ participantId: 'a', value: 'utile' }, { participantId: 'b', value: 'pas-utile' }]).counts, { utile: 1, mitige: 0, 'pas-utile': 1 });
});