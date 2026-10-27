import { jiraObject, jiraText, jiraTickets, sprintParticipants, type JiraOption, type JiraSprintSelection } from './jira.ts';
import { jiraFetch } from './jira-auth.ts';
import { WorkspaceError } from './workspace-store.ts';
import { createHash } from 'node:crypto';
import { SharedReadCache } from './shared-read-cache.ts';

const shared = globalThis as typeof globalThis & { scrumJiraTickets?: SharedReadCache };
const ticketCache = shared.scrumJiraTickets ??= new SharedReadCache(64);

export type JiraSite = JiraOption & { url: string };
export class JiraService {
  private token: string;
  private sitesPromise?: Promise<JiraSite[]>;
  private boardsPromise = new Map<string, Promise<JiraOption[]>>();
  private signal = AbortSignal.timeout(25_000);
  constructor(token: string) { this.token = token; }
  async get(path: string) {
    return (await jiraFetch(`https://api.atlassian.com${path}`, { headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' }, signal: this.signal })).json() as Promise<unknown>;
  }
  sites() {
    return this.sitesPromise ??= (async () => {
      const data = await this.get('/oauth/token/accessible-resources');
      if (!Array.isArray(data) || data.length > 100) throw new WorkspaceError(502, 'Liste des sites Jira invalide.');
      const sites = new Map<string, JiraSite>();
      for (const value of data) {
        const site = jiraObject(value);
        if (!Array.isArray(site.scopes) || !site.scopes.includes('read:board-scope:jira-software')) continue;
        const id = jiraText(site.id, 36); const url = new URL(jiraText(site.url, 300));
        if (!/^[a-f0-9-]{36}$/i.test(id) || url.protocol !== 'https:' || !url.hostname.endsWith('.atlassian.net') || url.username || url.password || url.port) throw new WorkspaceError(502, 'Site Jira invalide.');
        sites.set(id, { id, name: jiraText(site.name, 200), url: url.origin });
      }
      return [...sites.values()];
    })();
  }
  async site(cloudId: string) {
    const site = (await this.sites()).find(site => site.id === cloudId);
    if (!site) throw new WorkspaceError(403, 'Site Jira non autorisé pour votre compte.');
    return site;
  }
  private async options(path: string): Promise<Record<string, unknown>[]> {
    const values: Record<string, unknown>[] = []; const ids = new Set<number>(); let startAt = 0;
    for (let page = 0; page < 100; page++) {
      const separator = path.includes('?') ? '&' : '?';
      const body = jiraObject(await this.get(`${path}${separator}maxResults=100&startAt=${startAt}`));
      if (!Array.isArray(body.values) || typeof body.isLast !== 'boolean' || Number(body.startAt) !== startAt) throw new WorkspaceError(502, 'Pagination Jira invalide.');
      for (const value of body.values) {
        const item = jiraObject(value);
        if (!Number.isSafeInteger(item.id) || Number(item.id) < 1 || Number(item.id) > 2_147_483_647 || ids.has(Number(item.id))) throw new WorkspaceError(502, 'Identifiant Jira invalide ou répété.');
        ids.add(Number(item.id)); values.push(item);
      }
      if (body.isLast) return values;
      if (!body.values.length) break;
      startAt += body.values.length;
    }
    throw new WorkspaceError(502, 'Jira a renvoyé une liste incomplète. Aucun import effectué.');
  }
  async boards(cloudId: string) {
    await this.site(cloudId);
    let result = this.boardsPromise.get(cloudId);
    if (!result) {
      result = this.options(`/ex/jira/${cloudId}/rest/agile/1.0/board?type=scrum`).then(values => values.filter(board => board.type === 'scrum').map(board => ({ id: String(board.id), name: jiraText(board.name, 255) })));
      this.boardsPromise.set(cloudId, result);
    }
    return result;
  }
  async authorize(cloudId: string, boardId: number) {
    if (!(await this.boards(cloudId)).some(board => board.id === String(boardId))) throw new WorkspaceError(403, 'Tableau Scrum inaccessible avec votre compte Jira.');
  }
  async sprints(cloudId: string, boardId: number, activeOnly = true) {
    await this.authorize(cloudId, boardId);
    const values = await this.options(`/ex/jira/${cloudId}/rest/agile/1.0/board/${boardId}/sprint${activeOnly ? '?state=active' : ''}`);
    return values.filter(sprint => !activeOnly || sprint.state === 'active').map(sprint => ({ id: String(sprint.id), name: jiraText(sprint.name, 200) }));
  }
  async tickets(selection: JiraSprintSelection, activeOnly = false, refresh = false) {
    const site = await this.site(selection.cloudId);
    const sprint = (await this.sprints(selection.cloudId, selection.boardId, activeOnly)).find(sprint => sprint.id === String(selection.sprintId));
    if (!sprint) throw new WorkspaceError(409, activeOnly ? 'Le sprint choisi n’est plus actif sur ce tableau.' : 'Ce sprint n’est plus disponible sur ce tableau.');
    const load = () => this.sprintIssues(selection, site.url, sprint.name);
    if (activeOnly || refresh) return ticketCache.mutate(load);
    const scope = createHash('sha256').update(this.token).digest('hex');
    return ticketCache.read(`${scope}:${selection.cloudId}:${selection.boardId}:${selection.sprintId}`, 60_000, load);
  }
  private async sprintIssues(selection: JiraSprintSelection, siteUrl: string, name: string) {
    const issues: unknown[] = []; const seen = new Set<string>(); let token = '';
    for (let page = 0; page < 100; page++) {
      const query = new URLSearchParams({ maxResults: '100', fields: 'summary,status,priority,assignee,issuetype' });
      if (token) query.set('nextPageToken', token);
      const body = jiraObject(await this.get(`/ex/jira/${selection.cloudId}/rest/software/1.0/board/${selection.boardId}/sprint/${selection.sprintId}/issue?${query}`));
      if (!Array.isArray(body.issues) || typeof body.isLast !== 'boolean') throw new WorkspaceError(502, 'Liste des tickets Jira invalide.');
      issues.push(...body.issues);
      if (body.isLast) {
        const tickets = jiraTickets(issues, siteUrl);
        if (new Set(tickets.map(ticket => ticket.id)).size !== tickets.length) throw new WorkspaceError(502, 'Jira a renvoyé des tickets répétés.');
        return { name, tickets };
      }
      token = jiraText(body.nextPageToken, 4000);
      if (seen.has(token) || !body.issues.length) break;
      seen.add(token);
    }
    throw new WorkspaceError(502, 'Jira a renvoyé des tickets incomplets. Aucun import effectué.');
  }
  async importSprint(selection: JiraSprintSelection) {
    const imported = await this.tickets(selection, true);
    try { return { ...selection, name: imported.name, roster: sprintParticipants(imported.tickets) }; }
    catch (error) { throw new WorkspaceError(422, error instanceof Error ? error.message : 'Participants Jira invalides.'); }
  }
}