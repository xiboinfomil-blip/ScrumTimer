/** Only resolve an explicit URL context against the authoritative team list. */
export function resolveTeamContext(ids: string[], requested: string | null, fallback: string): string {
  return requested && ids.includes(requested) ? requested : fallback;
}

export function teamContextUrl(href: string, teamId: string): string {
  const url = new URL(href);
  url.searchParams.set('team', teamId);
  return `${url.pathname}${url.search}${url.hash}`;
}