import assert from 'node:assert/strict';
import test from 'node:test';
import catalog from '../src/lib/mood/remote-mood-catalog.json' with { type: 'json' };
import { groupMoodMeters, parseMoodMeterCatalog } from '../src/lib/mood/mood-meter.ts';

test('source categories are preserved and grouped without changing deck selection indices', () => {
  const decks = parseMoodMeterCatalog([
    { title: 'Zebra', remoteId: 'deck-11111111111111111111', category: 'Animals & Creatures', slides: [] },
    { title: 'Avatar', remoteId: 'deck-22222222222222222222', category: 'Movies', slides: [] },
    { title: 'Unknown', remoteId: 'deck-33333333333333333333', slides: [] },
  ]);
  assert.equal(decks[0].category, 'Movies');
  const groups = groupMoodMeters(decks);
  assert.deepEqual(groups.map(group => group.label), ['Animaux et créatures', 'Autres', 'Films']);
  assert.equal(groups[0].entries[0].index, 2);
  assert.equal(groups[2].entries[0].index, 0);
  for (const group of groups) for (const entry of group.entries) assert.equal(decks[entry.index], entry.deck);
});

test('invalid category metadata is ignored without dropping legacy decks', () => {
  for (const category of [null, 12, 'x'.repeat(101), 'bad\nlabel']) {
    const [deck] = parseMoodMeterCatalog([{ title: 'Safe', category, slides: ['mood-meters/slides/test/page.svg'] }]);
    assert.equal(deck.category, undefined);
    assert.equal(groupMoodMeters([deck])[0].label, 'Autres');
  }
});

test('published catalogue includes source categories and stable unique identifiers', () => {
  assert.equal(catalog.length, 888);
  assert.equal(new Set(catalog.map(entry => entry.id)).size, catalog.length);
  assert.equal(new Set(catalog.map(entry => entry.category)).size, 13);
  assert.equal(catalog.find(entry => entry.title === 'Alligators')?.category, 'Animals & Creatures');
  assert.equal(catalog.find(entry => entry.title === 'Minecraft')?.category, 'Gaming');
  assert.equal(catalog.filter(entry => entry.category === 'Other').length, 2);
});