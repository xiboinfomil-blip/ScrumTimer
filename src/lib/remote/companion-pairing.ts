/** Phone-only pairing preference. Never stores countdowns, roster data or host credentials. */
export const COMPANION_PAIRING_KEY = 'standup.companion.team.v1';
export interface CompanionPairing { id: string; token: string }

export function parseCompanionPairing(value: string): CompanionPairing | null {
  const parts = value.replace(/^#/, '').split('.');
  return parts.length === 2 && parts.every(part => /^[A-Za-z0-9_-]{43}$/.test(part))
    ? { id: parts[0], token: parts[1] } : null;
}

export function resolveCompanionPairing(fragment: string, stored: string | null): CompanionPairing | null {
  // An explicit malformed scan must never silently control the previously saved team.
  return fragment ? parseCompanionPairing(fragment) : stored ? parseCompanionPairing(stored) : null;
}