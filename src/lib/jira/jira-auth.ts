import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as oauth from 'oauth4webapi';
import { WorkspaceError } from '../team/workspace-store.ts';
import { jiraObject, jiraText } from './jira.ts';

type Database = Pick<NeonHttpDatabase, 'execute' | 'batch'>;
export const jiraCookie = 'scrum-jira-session';
export const jiraStateCookie = 'scrum-jira-state';
export const jiraSessionSeconds = 8 * 60 * 60;
export const jiraScopes = ['read:me', 'offline_access', 'read:board-scope:jira-software', 'read:project:jira', 'read:sprint:jira-software', 'read:issue-details:jira', 'read:jql:jira'];
const server: oauth.AuthorizationServer = { issuer: 'https://auth.atlassian.com', authorization_endpoint: 'https://auth.atlassian.com/authorize', token_endpoint: 'https://auth.atlassian.com/oauth/token' };
export const jiraHash = (value: string) => createHash('sha256').update(value).digest('hex');
const loginRequired = () => new WorkspaceError(401, 'Connectez-vous à Jira pour accéder à cette équipe de sprint.');

export function jiraConfiguration() {
  const clientId = process.env.JIRA_CLIENT_ID; const secret = process.env.JIRA_CLIENT_SECRET; const encryptionKey = process.env.JIRA_ENCRYPTION_KEY;
  let callback: URL;
  try { callback = new URL(process.env.JIRA_CALLBACK_URL ?? ''); } catch { throw new WorkspaceError(503, 'La connexion Jira doit être configurée sur le serveur.'); }
  if (!clientId || !secret || !encryptionKey || !/^[a-f0-9]{64}$/i.test(encryptionKey)
    || callback.username || callback.password || callback.search || callback.hash || callback.pathname !== '/api/jira/callback'
    || (callback.protocol !== 'https:' && !(callback.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(callback.hostname)))) throw new WorkspaceError(503, 'La connexion Jira doit être configurée sur le serveur.');
  return { client: { client_id: clientId } satisfies oauth.Client, secret, encryptionKey: Buffer.from(encryptionKey, 'hex'), callback };
}
export function jiraConfigured() { try { jiraConfiguration(); return true; } catch { return false; } }
export function sealJiraToken(value: string, context: string) {
  const nonce = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', jiraConfiguration().encryptionKey, nonce);
  cipher.setAAD(Buffer.from(context));
  return Buffer.concat([nonce, cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()]).toString('base64url');
}
export function openJiraToken(value: string, context: string) {
  const data = Buffer.from(value, 'base64url');
  if (data.length < 29) throw loginRequired();
  const decipher = createDecipheriv('aes-256-gcm', jiraConfiguration().encryptionKey, data.subarray(0, 12));
  decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(data.subarray(-16));
  return Buffer.concat([decipher.update(data.subarray(12, -16)), decipher.final()]).toString('utf8');
}
export function jiraRequestCookie(request: Request, name = jiraCookie) {
  const value = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
export async function jiraFetch(url: string | URL | Request, init: RequestInit = {}) {
  const target = new URL(typeof url === 'string' ? url : url instanceof URL ? url.href : url.url);
  if (target.protocol !== 'https:' || !['auth.atlassian.com', 'api.atlassian.com'].includes(target.hostname) || target.port || target.username || target.password) throw new WorkspaceError(400, 'Adresse Jira interdite.');
  const response = await fetch(target, { ...init, redirect: 'error', cache: 'no-store', signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000) });
  if (response.status === 401) throw loginRequired();
  if (response.status === 403 || response.status === 404) throw new WorkspaceError(403, 'Votre compte Jira ne peut pas accéder à ce tableau ou à ce sprint.');
  if (response.status === 429) throw new WorkspaceError(429, 'Jira limite les requêtes. Réessayez dans quelques instants.');
  if (!response.ok) throw new WorkspaceError(502, 'Jira est momentanément indisponible.');
  const reader = response.body?.getReader();
  if (!reader) throw new WorkspaceError(502, 'Réponse Jira vide.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length; if (size > 4_000_000) throw new WorkspaceError(502, 'Réponse Jira trop volumineuse.');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return new Response(Buffer.concat(chunks), { status: response.status, headers: response.headers });
}
const oauthOptions = () => ({ [oauth.customFetch]: async (url: string, options: RequestInit) => {
  const form = new URLSearchParams(String(options.body));
  const headers = new Headers(options.headers); headers.set('content-type', 'application/json');
  const response = await jiraFetch(url, { ...options, headers, body: JSON.stringify(Object.fromEntries(form)) });
  const body = jiraObject(await response.json());
  return Response.json({ ...body, token_type: body.token_type ?? 'Bearer' }, { status: response.status });
} });

export async function beginJiraLogin(db: Database, origin: string) {
  const config = jiraConfiguration();
  if (config.callback.origin !== origin) throw new WorkspaceError(400, 'Origine de connexion Jira invalide.');
  const state = oauth.generateRandomState();
  await db.execute(sql`DELETE FROM jira_oauth_states WHERE expires_at < now()`);
  await db.execute(sql`INSERT INTO jira_oauth_states(id,expires_at) VALUES(${jiraHash(state)},now()+interval '10 minutes')`);
  const url = new URL(server.authorization_endpoint!);
  url.search = new URLSearchParams({ audience: 'api.atlassian.com', client_id: config.client.client_id, scope: jiraScopes.join(' '), redirect_uri: config.callback.href, state, response_type: 'code', prompt: 'consent' }).toString();
  return { state, url };
}
export async function finishJiraLogin(db: Database, request: Request) {
  const config = jiraConfiguration(); const state = jiraRequestCookie(request, jiraStateCookie);
  if (!state || new URL(request.url).origin !== config.callback.origin) throw new WorkspaceError(400, 'Connexion Jira expirée ou invalide.');
  const parameters = oauth.validateAuthResponse(server, config.client, new URL(request.url), state);
  const consumed = await db.execute(sql`DELETE FROM jira_oauth_states WHERE id=${jiraHash(state)} AND expires_at>now() RETURNING id`);
  if (!consumed.rows.length) throw new WorkspaceError(400, 'Connexion Jira expirée ou déjà utilisée.');
  const response = await oauth.authorizationCodeGrantRequest(server, config.client, oauth.ClientSecretPost(config.secret), parameters, config.callback.href, oauth.nopkce, oauthOptions());
  const tokens = await oauth.processAuthorizationCodeResponse(server, config.client, response);
  const profile = jiraObject(await (await jiraFetch('https://api.atlassian.com/me', { headers: { Authorization: `Bearer ${tokens.access_token}` } })).json());
  const accountId = jiraText(profile.account_id, 100); const displayName = jiraText(profile.name, 300);
  const cookie = randomBytes(32).toString('base64url'); const id = jiraHash(cookie);
  const expires = Math.min(Number(tokens.expires_in ?? 3600), 86400);
  if (!(expires > 0)) throw loginRequired();
  await db.execute(sql`DELETE FROM jira_sessions WHERE expires_at<now()`);
  await db.execute(sql`INSERT INTO jira_sessions(id,account_id,display_name,access_token,refresh_token,access_expires_at,expires_at) VALUES(${id},${accountId},${displayName},${sealJiraToken(tokens.access_token, `${id}:access`)},${tokens.refresh_token ? sealJiraToken(tokens.refresh_token, `${id}:refresh`) : null},${new Date(Date.now() + expires * 1000).toISOString()}::timestamptz,now()+interval '8 hours')`);
  return cookie;
}
export async function jiraSession(db: Database, request: Request, required = true) {
  const cookie = jiraRequestCookie(request);
  if (!cookie) { if (required) throw loginRequired(); return null; }
  const id = jiraHash(cookie);
  const result = await db.execute(sql`SELECT id,account_id,display_name,access_token,refresh_token,access_expires_at FROM jira_sessions WHERE id=${id} AND expires_at>now()`);
  const row = result.rows[0];
  if (!row) { if (required) throw loginRequired(); return null; }
  return { id, accountId: String(row.account_id), name: String(row.display_name), encryptedAccess: String(row.access_token), encryptedRefresh: row.refresh_token ? String(row.refresh_token) : null, accessExpiresAt: new Date(row.access_expires_at as string).getTime() };
}
export async function jiraAccessToken(db: Database, request: Request) {
  const session = (await jiraSession(db, request))!;
  if (session.accessExpiresAt > Date.now() + 30_000) return openJiraToken(session.encryptedAccess, `${session.id}:access`);
  if (!session.encryptedRefresh) throw loginRequired();
  const lease = randomBytes(16).toString('hex');
  const claim = await db.execute(sql`UPDATE jira_sessions SET refresh_lease=${lease},refresh_lease_until=now()+interval '30 seconds' WHERE id=${session.id} AND expires_at>now() AND (refresh_lease_until IS NULL OR refresh_lease_until<now()) AND access_token=${session.encryptedAccess} RETURNING id`);
  if (!claim.rows.length) throw new WorkspaceError(409, 'Connexion Jira en cours de renouvellement. Réessayez.');
  const config = jiraConfiguration();
  try {
    const response = await oauth.refreshTokenGrantRequest(server, config.client, oauth.ClientSecretPost(config.secret), openJiraToken(session.encryptedRefresh, `${session.id}:refresh`), oauthOptions());
    const tokens = await oauth.processRefreshTokenResponse(server, config.client, response);
    const expiry = Number(tokens.expires_in ?? 3600);
    if (!(expiry > 0 && expiry <= 86400)) throw loginRequired();
    const saved = await db.execute(sql`UPDATE jira_sessions SET access_token=${sealJiraToken(tokens.access_token, `${session.id}:access`)},refresh_token=${tokens.refresh_token ? sealJiraToken(tokens.refresh_token, `${session.id}:refresh`) : session.encryptedRefresh},access_expires_at=${new Date(Date.now() + expiry * 1000).toISOString()}::timestamptz,refresh_lease=NULL,refresh_lease_until=NULL WHERE id=${session.id} AND refresh_lease=${lease} AND expires_at>now() RETURNING id`);
    if (!saved.rows.length) throw loginRequired();
    return tokens.access_token;
  } catch {
    await db.execute(sql`DELETE FROM jira_sessions WHERE id=${session.id} AND refresh_lease=${lease}`);
    throw loginRequired();
  }
}
export async function endJiraLogin(db: Database, request: Request) {
  const cookie = jiraRequestCookie(request);
  if (cookie) await db.execute(sql`DELETE FROM jira_sessions WHERE id=${jiraHash(cookie)}`);
}