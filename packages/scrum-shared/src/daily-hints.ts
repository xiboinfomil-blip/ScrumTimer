/** Pure, browser-safe daily hint contracts. LF is the only permitted control. */
import type { Hint, Notes, NoteInput } from './types.ts';
export type DailyHint = Hint;
export type DailyHintsData = Notes;
export type DailyHintInput = NoteInput;

export function validateDailyHint(value: unknown): DailyHintInput {
  const fields = ['participantId', 'hint', 'day', 'revision'];
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Reflect.ownKeys(value).length !== fields.length
    || Reflect.ownKeys(value).some(key => typeof key !== 'string' || !fields.includes(key))) throw new Error('Requête invalide.');
  const input = value as Record<string, unknown>;
  if (typeof input.participantId !== 'string' || [...input.participantId].length < 1
    || [...input.participantId].length > 100 || /\p{Cc}/u.test(input.participantId)) throw new Error('Participant invalide.');
  // Reject CR/CRLF, tabs and other controls before trimming: never silently
  // normalize forbidden input into an apparently valid hint.
  if (typeof input.hint !== 'string' || /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/u.test(input.hint)) throw new Error('Indice invalide : seuls les retours à la ligne LF sont autorisés.');
  const hint = input.hint.trim();
  if ([...hint].length < 1 || [...hint].length > 600) throw new Error('L’indice doit contenir entre 1 et 600 caractères.');
  if (typeof input.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.day)
    || input.day.startsWith('0000') || !Number.isFinite(Date.parse(`${input.day}T00:00:00Z`))
    || new Date(`${input.day}T00:00:00Z`).toISOString().slice(0, 10) !== input.day) throw new Error('Date invalide.');
  if (typeof input.revision !== 'number' || !Number.isInteger(input.revision)
    || input.revision < 0 || input.revision >= 2147483647) throw new Error('Révision invalide.');
  return { participantId: input.participantId, hint, day: input.day, revision: input.revision };
}