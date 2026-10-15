/** Browser-safe, pure contracts. No identity, storage or database dependencies. */
export const DEFAULT_DISCUSSION_PROMPTS = [
  'Qu’avez-vous fait hier ?',
  'Sur quoi travaillez-vous ?',
  'Que ferez-vous aujourd’hui ?',
] as const;
export const FEEDBACK_VALUES = ['utile', 'mitige', 'pas-utile'] as const;
export type FeedbackValue = typeof FEEDBACK_VALUES[number];
export type MeetingSettings = { prompts: string[]; revision: number };
export type RoundFeedbackData = {
  roundId: string;
  responses: { participantId: string; value: FeedbackValue }[];
  counts: Record<FeedbackValue, number>;
};
function object(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== fields.length || Object.keys(value).some(key => !fields.includes(key))) throw new Error('Requête invalide.');
  return value as Record<string, unknown>;
}
export function validateDiscussionPrompts(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5) throw new Error('Choisissez entre 1 et 5 questions.');
  return Array.from(value, prompt => {
    if (typeof prompt !== 'string' || prompt !== prompt.trim() || [...prompt].length < 1 || [...prompt].length > 160 || /\p{Cc}/u.test(prompt)) throw new Error('Chaque question doit contenir entre 1 et 160 caractères, sans caractère de contrôle ni espace aux extrémités.');
    return prompt;
  });
}
export function validateMeetingSettings(value: unknown): MeetingSettings {
  const input = object(value, ['prompts', 'revision']);
  if (!Number.isInteger(input.revision) || Number(input.revision) < 0 || Number(input.revision) >= 2147483647) throw new Error('Révision invalide.');
  return { prompts: validateDiscussionPrompts(input.prompts), revision: Number(input.revision) };
}
export function validateRoundId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error('Bilan invalide.');
  return value;
}
export function validateRoundFeedback(value: unknown): { roundId: string; participantId: string; value: FeedbackValue } {
  const input = object(value, ['roundId', 'participantId', 'value']);
  if (typeof input.participantId !== 'string' || input.participantId.length < 1 || input.participantId.length > 100 || /\p{Cc}/u.test(input.participantId)) throw new Error('Participant invalide.');
  if (!FEEDBACK_VALUES.includes(input.value as FeedbackValue)) throw new Error('Choisissez Utile, Mitigé ou Pas utile.');
  return { roundId: validateRoundId(input.roundId), participantId: input.participantId, value: input.value as FeedbackValue };
}
export function summarizeRoundFeedback(roundId: string, responses: RoundFeedbackData['responses']): RoundFeedbackData {
  const counts: RoundFeedbackData['counts'] = { utile: 0, mitige: 0, 'pas-utile': 0 };
  for (const response of responses) counts[response.value]++;
  return { roundId, responses, counts };
}