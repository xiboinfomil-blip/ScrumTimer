import { validateTeamInput } from '../team/team-validation.ts';

export class CloudRequestError extends Error {
  readonly status: number;
  readonly retryAfter: number | null;
  constructor(response: Response) {
    super(response.status === 507 ? 'Stockage Neon presque plein. Contactez l’administrateur avant de réessayer.' : `Requête Neon refusée (${response.status}).`);
    this.status = response.status;
    this.retryAfter = parseRetryAfter(response.headers.get('Retry-After'));
  }
}

export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value?.trim()) return null;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
  return Number.isFinite(delay) && delay >= 0 ? delay : null;
}

export function isTransientCloudError(error: unknown): boolean {
  if (error instanceof CloudRequestError) {
    if (error.status === 507) return false;
    return [408, 425, 429].includes(error.status) || (error.status >= 500 && error.status <= 599);
  }
  return error instanceof TypeError || (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name));
}

/** The exponential component is capped; an explicit server cooldown is a minimum. */
export function cloudRetryDelay(attempt: number, retryAfter: number | null = null): number {
  return Math.min(2147483647, Math.max(Math.min(30000, 1000 * 2 ** Math.min(5, Math.max(0, attempt))), retryAfter ?? 0));
}

/** Preserve 409 for endpoint-specific reconciliation; never blindly retry it. */
export async function cloudFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (!response.ok && response.status !== 409) throw new CloudRequestError(response);
  return response;
}

export function sameCloudTeam(a: unknown, b: unknown): boolean {
  try { return JSON.stringify(validateTeamInput(a)) === JSON.stringify(validateTeamInput(b)); }
  catch { return false; }
}