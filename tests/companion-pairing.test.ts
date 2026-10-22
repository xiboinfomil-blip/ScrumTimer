import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPANION_PAIRING_KEY, parseCompanionPairing, resolveCompanionPairing } from '../src/lib/companion-pairing.ts';

const a = `${'a'.repeat(43)}.${'b'.repeat(43)}`;
const b = `${'c'.repeat(43)}.${'d'.repeat(43)}`;

test('companion remembers only a structurally valid team capability, not live state or owner secrets', () => {
  assert.equal(COMPANION_PAIRING_KEY, 'standup.companion.team.v1');
  assert.deepEqual(parseCompanionPairing(a), { id: 'a'.repeat(43), token: 'b'.repeat(43) });
  assert.deepEqual(parseCompanionPairing(`#${a}`), parseCompanionPairing(a));
  for (const invalid of ['', '#', `${a}.extra`, 'x.y', `${a}\n`, JSON.stringify({ id: a }), 'https://example.test']) {
    assert.equal(parseCompanionPairing(invalid), null);
  }
});

test('explicit QR wins, malformed explicit links never fall back, installed credential-free start restores team', () => {
  assert.deepEqual(resolveCompanionPairing(`#${b}`, a), parseCompanionPairing(b));
  assert.equal(resolveCompanionPairing('#broken', a), null);
  assert.deepEqual(resolveCompanionPairing('', a), parseCompanionPairing(a));
  assert.equal(resolveCompanionPairing('', null), null);
  assert.equal(resolveCompanionPairing('', 'broken'), null);
});