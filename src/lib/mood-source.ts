import { createHash } from 'node:crypto';
import { decodeHTML } from 'entities';
import type { RemoteMoodSource } from './mood-fetch-cache.ts';

export const MOOD_SOURCE_URL = 'https://sites.google.com/scred.k12.mn.us/scredsel/calming-strategies-toolbox/name-your-feelings_express-yourself_cst/gif-mood-meters';
const text = (html: string) => decodeHTML(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Read real section headings, never infer a category from a presentation name. */
export function parseMoodSource(html: string, known: RemoteMoodSource[]): RemoteMoodSource[] {
  const byGoogleId = new Map(known.map(item => [item.googleId, item]));
  const found = new Map<string, RemoteMoodSource>();
  let category = 'Other';
  const tokens = html.matchAll(/<h2\b[^>]*>[\s\S]*?<\/h2>|<a\b[^>]*href=["'][^"']*docs\.google\.com\/presentation\/d\/[^"']*["'][^>]*>[\s\S]*?<\/a>/gi);
  for (const [token] of tokens) {
    if (/^<h2\b/i.test(token)) {
      const heading = text(token);
      category = !heading || /^GIF Mood Meters/i.test(heading) ? 'Other' : heading;
      continue;
    }
    const googleId = token.match(/docs\.google\.com\/presentation\/d\/([\w-]+)/)?.[1];
    if (!googleId || found.has(googleId)) continue;
    const previous = byGoogleId.get(googleId);
    const title = previous?.title ?? text(token);
    if (!title || title.length > 200 || category.length > 100 || /\p{Cc}/u.test(title + category)) continue;
    found.set(googleId, { id: previous?.id ?? `deck-${createHash('sha256').update(googleId).digest('hex').slice(0, 20)}`, googleId, title, category });
  }
  // A login/error/changed source page must never become a partial live catalogue.
  if (found.size < Math.max(100, Math.floor(known.length * .8)) || new Set([...found.values()].map(item => item.category)).size < 2) throw new Error('Public mood catalogue incomplete');
  // Retain known links absent from the current page so saved daily choices work.
  for (const entry of known) if (!found.has(entry.googleId)) found.set(entry.googleId, { ...entry, category: 'Other' });
  return [...found.values()];
}