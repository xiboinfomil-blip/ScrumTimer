import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePersonName } from '../src/lib/team/action-validation.ts';

test('person names require a primitive string and a nonempty trimmed value', () => {
  for (const value of [null, undefined, 42, true, {}, [], new String('Alice'), '', '   ', '\u00a0']) {
    assert.equal(typeof validatePersonName(value), 'string');
  }
  assert.equal(validatePersonName(' Alice '), null);
});

test('person names enforce the trimmed 60-character boundary without clipping', () => {
  assert.equal(validatePersonName('A'.repeat(60)), null);
  assert.equal(validatePersonName(`  ${'A'.repeat(60)}  `), null);
  assert.equal(typeof validatePersonName('A'.repeat(61)), 'string');
  assert.equal(typeof validatePersonName(` ${'A'.repeat(61)} `), 'string');
});

test('person names reject every C0, DEL and C1 control, even at trimmed edges', () => {
  for (let code = 0; code <= 0x9f; code++) {
    if (code > 0x1f && code < 0x7f) continue;
    const control = String.fromCharCode(code);
    for (const value of [`A${control}B`, `${control}Alice`, `Alice${control}`]) {
      assert.equal(typeof validatePersonName(value), 'string', `control ${code}`);
    }
  }
});

test('person names allow accents, punctuation, emoji and literal angle brackets', () => {
  for (const value of ['Élodie', 'Jean-Luc', "O’Connor", '李明', 'Alice 🌻', '<b>Bob</b>', '<script>alert("x")</script>']) {
    assert.equal(validatePersonName(value), null);
  }
});