export interface LiveSnapshot {
  speaker: string;
  nextSpeaker: string;
  teamName: string;
  running: boolean;
  remaining: number;
  deadline: number;
  completed: number;
  total: number;
}
export function validateLiveSnapshot(value: unknown): LiveSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Diffusion invalide.');
  const data = value as Record<string, unknown>;
  const keys = ['speaker', 'nextSpeaker', 'teamName', 'running', 'remaining', 'deadline', 'completed', 'total'];
  if (Object.keys(data).some(key => !keys.includes(key))) throw new Error('Diffusion invalide.');
  for (const key of ['speaker', 'nextSpeaker', 'teamName']) if (typeof data[key] !== 'string' || (data[key] as string).length > 100 || /[\u0000-\u001f]/.test(data[key] as string)) throw new Error('Nom invalide.');
  if (typeof data.running !== 'boolean') throw new Error('État invalide.');
  for (const key of ['remaining', 'deadline', 'completed', 'total']) if (typeof data[key] !== 'number' || !Number.isFinite(data[key])) throw new Error('Temps invalide.');
  if (Math.abs(data.remaining as number) > 86400 || (data.deadline as number) < 0 || !Number.isInteger(data.completed) || !Number.isInteger(data.total) || (data.completed as number) < 0 || (data.total as number) < (data.completed as number) || (data.total as number) > 1000) throw new Error('Temps invalide.');
  return data as unknown as LiveSnapshot;
}
export function liveRemaining(snapshot: LiveSnapshot, serverNow: number) {
  return snapshot.running ? (snapshot.deadline - serverNow) / 1000 : snapshot.remaining;
}