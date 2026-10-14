export const secondsUntil = (deadline: number, now: number) => Math.max(0, (deadline - now) / 1000);
export function timerUrgency(remaining: number, warning: number, ended: boolean, turnStarted: boolean) {
  if (ended) return 'expired';
  if (!turnStarted || warning <= 0 || remaining <= 0 || remaining > warning) return 'normal';
  return remaining <= Math.min(10, warning / 2) ? 'critical' : 'warning';
}
export const formatTime = (seconds: number) => {
  const value = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
};

export function shuffleEligible<T extends { id: string; done: boolean }>(people: T[], activeId: string | null, turnStarted: boolean) {
  return people.filter(person => !person.done && (!turnStarted || person.id !== activeId));
}