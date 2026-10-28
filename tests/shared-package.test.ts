import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { validateDailyHint as masterValidate } from '../src/lib/meeting/daily-hints.ts';
import { validateDailyHint } from '@infomil/scrum-shared/daily-hints';
import { characterCount, parseNotes, parsePortal, validDay, validateNote } from '@infomil/scrum-shared/contracts';
import { totals } from '@infomil/scrum-shared/statistics';
import type { Hint, NoteInput, Notes, Person, Round } from '@infomil/scrum-shared/types';
import type { DailyHint, DailyHintInput, DailyHintsData } from '../src/lib/meeting/daily-hints.ts';
import type { HistoryPerson, HistoryRound } from '../src/lib/history/history.ts';
import type { Mood } from '../src/types/team.ts';

// Compiled by the root typecheck, even though Node erases these assertions.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;
export type SharedContractIdentity = [
  Expect<Equal<HistoryPerson, Person>>, Expect<Equal<HistoryRound, Round>>,
  Expect<Equal<HistoryPerson['mood'], Mood | null>>,
  Expect<Equal<DailyHint, Hint>>, Expect<Equal<DailyHintsData, Notes>>, Expect<Equal<DailyHintInput, NoteInput>>,
];

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const input: NoteInput = { participantId: 'alice', hint: 'Sujet\nà partager', day: '2026-10-16', revision: 0 };

test('master and participant contracts share the exact canonical validator and French errors', () => {
  assert.equal(masterValidate, validateDailyHint);
  assert.equal(validateNote, validateDailyHint);
  assert.deepEqual(masterValidate({ ...input, hint: ' \nSujet\nà partager \n' }), input);
  assert.equal(characterCount(validateNote({ ...input, hint: '😀'.repeat(600) }).hint), 600);
  assert.equal(validDay('2028-02-29'), true);
  const invalid: [unknown, string][] = [
    [{ ...input, [Symbol('extra')]: true }, 'Requête invalide.'],
    [Object.defineProperty({ ...input }, 'hidden', { value: true }), 'Requête invalide.'],
    [{ ...input, teamId: 'forged' }, 'Requête invalide.'],
    [{ ...input, participantId: 'A\n' }, 'Participant invalide.'],
    [{ ...input, hint: '\tSujet' }, 'Indice invalide : seuls les retours à la ligne LF sont autorisés.'],
    [{ ...input, hint: 'A\r\nB' }, 'Indice invalide : seuls les retours à la ligne LF sont autorisés.'],
    [{ ...input, hint: '😀'.repeat(601) }, 'L’indice doit contenir entre 1 et 600 caractères.'],
    [{ ...input, day: '2026-02-29' }, 'Date invalide.'],
    [{ ...input, revision: 2147483647 }, 'Révision invalide.'],
  ];
  for (const [value, message] of invalid) {
    for (const validate of [masterValidate, validateNote]) assert.throws(() => validate(value), { message });
  }
});

test('portal parser projects public DTOs without forwarding master fields or secrets', () => {
  const person: HistoryPerson = { id: 'alice', name: '<script>alert(1)</script>', mood: 3,
    speakingSeconds: 60, budgetSeconds: 120, timeUp: false, score: 1000, meterTitle: null };
  const round: HistoryRound = { id: 'round', completedAt: '2026-10-16T10:00:00.000Z', people: [person] };
  const notes = { day: input.day, hints: [{ participantId: input.participantId, hint: input.hint, revision: 1 }] };
  const publicData = { team: { id: 'a'.repeat(64), name: 'Équipe', roster: [{ id: person.id, name: person.name, present: false }] }, ...notes, history: [round] };
  const parsed = parsePortal({ ...publicData, privateSecret: 'never-forward', duration: 120,
    team: { ...publicData.team, workspaceId: 'private', roster: [{ ...publicData.team.roster[0], mood: 4 }] },
    history: [{ ...round, internal: true, people: [{ ...person, attempts: 2 }] }] });
  assert.deepEqual(parsed, publicData);
  assert.deepEqual(parseNotes(notes), notes);
  assert.throws(() => parsePortal({ ...publicData, hints: [{ ...notes.hints[0], participantId: 'other' }] }), { message: 'Note hors équipe.' });
  assert.throws(() => parseNotes({ ...notes, hints: [...notes.hints, ...notes.hints] }), { message: 'Identifiants dupliqués.' });
  assert.deepEqual(totals(parsed.history, new Date('2026-10-16T11:00:00Z')), { rounds: 1, turns: 1, seconds: 60, average: 1000 });
});

test('package boundaries and both app consumers use shared source, not validator or DTO copies', () => {
  const manifest = JSON.parse(read('../packages/scrum-shared/package.json'));
  assert.equal(manifest.name, '@infomil/scrum-shared');
  assert.equal(manifest.version, '1.0.0');
  assert.equal(manifest.private, true);
  assert.equal(manifest.type, 'module');
  assert.deepEqual(manifest.dependencies ?? {}, {});
  assert.deepEqual(manifest.peerDependencies, { react: '>=19' });
  assert.deepEqual(manifest.exports, { './contracts': './src/contracts.ts', './types': './src/types.ts',
    './statistics': './src/statistics.ts', './ui': './src/ui.tsx', './daily-hints': './src/daily-hints.ts' });
  const rootManifest = JSON.parse(read('../package.json'));
  assert.ok(rootManifest.workspaces.includes('apps/participants'));
  assert.ok(rootManifest.workspaces.includes('packages/*'));
  assert.equal(rootManifest.dependencies[manifest.name], '1.0.0');
  assert.ok(JSON.parse(read('../apps/participants/package.json')).dependencies[manifest.name]);
  assert.match(read('../src/lib/meeting/daily-hints.ts'), /export \{ validateDailyHint \} from '@infomil\/scrum-shared\/daily-hints'/);
  assert.doesNotMatch(read('../src/lib/meeting/daily-hints.ts'), /function validateDailyHint/);
  assert.match(read('../src/lib/history/history.ts'), /Person as HistoryPerson, Round as HistoryRound/);
  assert.doesNotMatch(read('../src/lib/history/history.ts'), /interface History(?:Person|Round)/);
  for (const [path, entry] of [['lib/contracts.ts', 'contracts'], ['lib/statistics.ts', 'statistics'], ['components/ui.tsx', 'ui'], ['types/portal.ts', 'types']]) {
    assert.ok(read(`../apps/participants/src/${path}`).includes(`'@infomil/scrum-shared/${entry}'`));
  }
  assert.match(read('../src/app/error.tsx'), /import \{ StateScreen \} from '@infomil\/scrum-shared\/ui'/);
  assert.match(read('../src/app/error.tsx'), /<StateScreen title=/);
  assert.match(read('../src/app/globals.css'), /@source "\.\.\/\.\.\/packages\/scrum-shared\/src"/);
  assert.match(read('../apps/participants/src/app/globals.css'), /@source "\.\.\/\.\.\/\.\.\/\.\.\/packages\/scrum-shared\/src"/);
  assert.match(read('../packages/scrum-shared/src/ui.tsx'), /^'use client';/);
  assert.doesNotMatch(read('../packages/scrum-shared/src/daily-hints.ts'), /from ['"].*contracts/);
  assert.doesNotMatch(read('../packages/scrum-shared/src/contracts.ts'), /function validateNote|const controls/);
  for (const entry of ['types.ts', 'contracts.ts', 'statistics.ts', 'daily-hints.ts', 'ui.tsx']) {
    assert.doesNotMatch(read(`../packages/scrum-shared/src/${entry}`), /from ['"](?:next|server-only|drizzle-orm|@neondatabase)|process\.env|from ['"].*\/db\//);
  }
});