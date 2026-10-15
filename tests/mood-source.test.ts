import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMoodSource } from '../src/lib/mood-source.ts';

test('live catalogue parses all source links and categories with stable published IDs', () => {
  const known = [{ id: 'deck-11111111111111111111', googleId: 'google0', title: 'Existing title', category: 'Old' }, { id: 'deck-22222222222222222222', googleId: 'missing', title: 'Missing', category: 'Movies' }];
  const html = '<h2>GIF Mood Meters (100)</h2>' + Array.from({ length: 100 }, (_, i) => `${i === 0 ? '<h2>Animals &amp; Creatures</h2>' : i === 50 ? '<h2>Movies</h2>' : ''}<a href="https://docs.google.com/presentation/d/google${i}/edit"><span>Title &amp; ${i}</span></a>`).join('');
  const result = parseMoodSource(html, known);
  assert.equal(result.length, 101);
  assert.deepEqual(result[0], { ...known[0], category: 'Animals & Creatures' });
  assert.equal(result[1].title, 'Title & 1');
  assert.equal(result[50].category, 'Movies');
  assert.match(result[1].id, /^deck-[a-f0-9]{20}$/);
  assert.equal(result[1].id, parseMoodSource(html, known)[1].id);
  assert.equal(result.at(-1)?.category, 'Other');
  assert.throws(() => parseMoodSource('<h2>Sign in</h2>', known), /incomplete/);
});