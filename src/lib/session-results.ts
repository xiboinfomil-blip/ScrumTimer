import type { Person } from '../types/team.ts';

export type SessionSpeaker = Person & { done: boolean; started: boolean; speakingSeconds: number; budgetSeconds: number; timeUp: boolean; attempts: number; manualPenalty?: number };

export const MANUAL_PENALTY_STEP = 50;
export const MAX_MANUAL_PENALTY = 1_000_000;
export function validManualPenalty(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_MANUAL_PENALTY);
}

export type ScoreZone = 'waiting' | 'building' | 'optimal' | 'closing' | 'overtime';

export function timeScore(speakingSeconds: number, budgetSeconds: number) {
  const elapsed = Math.max(0, Math.round(speakingSeconds * 1000) / 1000);
  const ratio = elapsed / budgetSeconds;
  // Fixed two-minute scoring reference, independent of the configured timer budget.
  const zone: ScoreZone = elapsed <= 30 ? 'building' : elapsed <= 105 ? 'optimal' : elapsed <= 120 ? 'closing' : 'overtime';
  const closing = Math.max(0, elapsed - 105);
  const base = elapsed <= 105 ? (elapsed - 5) * 10
    : elapsed <= 120 ? 1000 - 5 * Math.min(closing, 5)
      - 10 * Math.min(Math.max(closing - 5, 0), 5)
      - 15 * Math.min(Math.max(closing - 10, 0), 5)
      : 850 - 50 * Math.floor((elapsed - 120) / 10);
  return { ratio, zone, points: elapsed <= 5 ? 0 : Math.round(Math.max(125, Math.min(1000, base))) };
}

export function explainScore(person: { speakingSeconds: number; budgetSeconds: number; score: number | null; attempts?: number; manualPenalty?: number }) {
  if (person.score === null || person.speakingSeconds < 1 || person.budgetSeconds <= 0) return ['Passage non mesuré : aucun score attribué (moins d’une seconde de parole ou aucun budget mesurable).'];
  const { ratio, zone, points } = timeScore(person.speakingSeconds, person.budgetSeconds);
  const number = (value: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value);
  const lines = [`Temps actif : ${number(person.speakingSeconds)} s sur ${number(person.budgetSeconds)} s, soit ${number(ratio * 100)} % du budget initial. Pauses exclues.`];
  const elapsed = Math.max(0, Math.round(person.speakingSeconds * 1000) / 1000);
  lines.push('Barème fixe de référence : 120 s, même si le budget du minuteur est différent.');
  const calculation = elapsed <= 5 ? 'Les 5 premières secondes : 0 pt.'
    : zone === 'building' || zone === 'optimal' ? `Jusqu’à 105 s : max(125, (${number(elapsed)} − 5) × 10) = ${points} pts après arrondi. Pic de 1 000 pts à 105 s.`
      : zone === 'closing' ? `De 105 à 120 s : depuis 1 000 pts, retrait par seconde de 5 pts pendant 5 s, puis 10 pts pendant 5 s, puis 15 pts pendant 5 s = ${points} pts après arrondi. 850 pts à 120 s.`
        : `Après 120 s : max(125, 850 − 50 × ${Math.floor((elapsed - 120) / 10)}) = ${points} pts. Retrait de 50 pts par tranche complète de 10 s, plancher 125.`;
  if (person.attempts !== undefined) {
    const penalty = Math.min(200, Math.max(0, person.attempts - 1) * 100);
    const afterRetries = points === 0 ? 0 : Math.max(125, points - penalty);
    lines.push(calculation, `Relances après réinitialisation : ${Math.max(0, person.attempts - 1)} ; pénalité de ${penalty} pts (100 par relance, plafond 200). Pause/reprise sans pénalité.`, elapsed <= 5 ? 'Avant pénalité manuelle : 0 pt pendant les 5 premières secondes.' : `Avant pénalité manuelle : max(125, ${points} − ${penalty}) = ${afterRetries} pts.`, `Pénalité manuelle cumulée : ${person.manualPenalty ?? 0} pts (50 par clic), déduite après le plancher de 125 ; le total peut descendre jusqu’à 0.`, `Total : max(0, ${afterRetries} − ${person.manualPenalty ?? 0}) = ${person.score} pts.`);
  } else {
    lines.push(`Comparaison avec le barème actuel : ${calculation}`, `Score enregistré : ${person.score} pts. Écart avec le score de temps actuel : ${number(person.score - points)} pts.`, 'Cette archive conserve le total, pas le nombre de relances, les pénalités manuelles ni la version du barème. Cet écart ne peut donc pas être attribué avec certitude à des relances, à des pénalités manuelles ou à un ancien barème. Le score enregistré n’est pas recalculé.');
  }
  lines.push('Ce score ludique mesure uniquement la gestion du temps : ni la qualité du travail, ni la productivité, ni l’humeur.');
  return lines;
}

// Shared live/final formula: the retry floor applies BEFORE manual deductions.
export function speakerScoreProgress(person: SessionSpeaker): { score: number | null; zone: ScoreZone } {
  if (!person.started || !Number.isFinite(person.speakingSeconds) || !Number.isFinite(person.budgetSeconds) || person.budgetSeconds <= 0) return { score: null, zone: 'waiting' };
  const { zone, points } = timeScore(person.speakingSeconds, person.budgetSeconds);
  const retries = Math.min(200, Math.max(0, person.attempts - 1) * 100);
  const afterRetries = points === 0 ? 0 : Math.max(125, points - retries);
  return { score: Math.max(0, afterRetries - (person.manualPenalty ?? 0)), zone };
}

export function scoreSpeaker(person: SessionSpeaker): number | null {
  if (!person.done || person.speakingSeconds < 1) return null;
  return speakerScoreProgress(person).score;
}

export function sessionLeaderboard(people: SessionSpeaker[]) {
  const sorted = people.map(person => ({ ...person, score: scoreSpeaker(person) }))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return sorted.map((person, index) => ({ ...person, rank: person.score === null ? null : sorted.findIndex(other => other.score === person.score) + 1, position: index + 1 }));
}

export function sessionStatistics(people: SessionSpeaker[]) {
  const measured = people.filter(person => person.done && person.started && person.speakingSeconds >= 1);
  const speakingSeconds = people.reduce((sum, person) => sum + person.speakingSeconds, 0);
  return {
    speakingSeconds,
    averageSeconds: measured.length ? speakingSeconds / measured.length : 0,
    measured: measured.length,
    withinTime: measured.filter(person => person.speakingSeconds <= person.budgetSeconds).length,
    expired: measured.filter(person => person.speakingSeconds > person.budgetSeconds).length,
    moods: ([1, 2, 3, 4] as const).map(mood => ({ mood, count: people.filter(person => person.mood === mood).length })),
  };
}