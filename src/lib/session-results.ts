import type { Person } from '../types/team.ts';

export type SessionSpeaker = Person & { done: boolean; started: boolean; speakingSeconds: number; budgetSeconds: number; timeUp: boolean; attempts: number };

export type ScoreZone = 'waiting' | 'building' | 'optimal' | 'overtime';

export function timeScore(speakingSeconds: number, budgetSeconds: number) {
  const elapsed = Math.max(0, Math.round(speakingSeconds * 1000) / 1000);
  const ratio = elapsed / budgetSeconds;
  const zone: ScoreZone = ratio < .25 ? 'building' : ratio <= 1 ? 'optimal' : 'overtime';
  const base = ratio < .25 ? 1000 * ratio / .25 : ratio <= 1 ? 1000 : Math.max(0, 1000 * (2 - ratio));
  return { ratio, zone, points: Math.round(base) };
}

export function explainScore(person: { speakingSeconds: number; budgetSeconds: number; score: number | null; attempts?: number }) {
  if (person.score === null || person.speakingSeconds < 1 || person.budgetSeconds <= 0) return ['Passage non mesuré : aucun score attribué (moins d’une seconde de parole ou aucun budget mesurable).'];
  const { ratio, zone, points } = timeScore(person.speakingSeconds, person.budgetSeconds);
  const number = (value: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value);
  const lines = [`Temps actif : ${number(person.speakingSeconds)} s sur ${number(person.budgetSeconds)} s, soit ${number(ratio * 100)} % du budget initial. Pauses exclues.`];
  const calculation = zone === 'building'
    ? `Avant 25 % : 1 000 × (${number(person.speakingSeconds)} ÷ ${number(person.budgetSeconds / 4)}) = ${points} pts après arrondi.`
    : zone === 'optimal' ? 'Entre 25 % et 100 % inclus : 1 000 pts. Parler plus longtemps dans cette zone ne rapporte rien de plus.'
      : `Dépassement de ${number((ratio - 1) * 100)} % : 1 000 − (1 000 × ${number(ratio - 1)}) = ${points} pts après arrondi, minimum 0.`;
  if (person.attempts !== undefined) {
    const penalty = Math.min(200, Math.max(0, person.attempts - 1) * 100);
    lines.push(calculation, `Relances après réinitialisation : ${Math.max(0, person.attempts - 1)} ; pénalité de ${penalty} pts (100 par relance, plafond 200). Pause/reprise sans pénalité.`, `Total : max(0, ${points} − ${penalty}) = ${person.score} pts.`);
  } else {
    lines.push(`Comparaison avec le barème actuel : ${calculation}`, `Score enregistré : ${person.score} pts. Écart avec le score de temps actuel : ${number(person.score - points)} pts.`, 'Cette archive conserve le total, pas le nombre de relances ni la version du barème. Cet écart ne peut donc pas être attribué avec certitude à des relances ou à un ancien barème. Le score enregistré n’est pas recalculé.');
  }
  lines.push('Ce score ludique mesure uniquement la gestion du temps : ni la qualité du travail, ni la productivité, ni l’humeur.');
  return lines;
}

// One formula for the live preview and the archived score. Mood is never graded.
export function speakerScoreProgress(person: SessionSpeaker): { score: number | null; zone: ScoreZone } {
  if (!person.started || !Number.isFinite(person.speakingSeconds) || !Number.isFinite(person.budgetSeconds) || person.budgetSeconds <= 0) return { score: null, zone: 'waiting' };
  const { zone, points } = timeScore(person.speakingSeconds, person.budgetSeconds);
  const retries = Math.min(200, Math.max(0, person.attempts - 1) * 100);
  return { score: Math.max(0, points - retries), zone };
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