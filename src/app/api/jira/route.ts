import { NextResponse } from 'next/server';
import { database, databaseFailure, readJson, sameOrigin, selectedTeam } from '@/lib/database';
import { endJiraLogin, jiraConfigured, jiraCookie, jiraSession } from '@/lib/jira-auth';
import { jiraService, jiraTeamSprint, syncJiraRoster } from '@/lib/jira-store';
import { validateJiraSelection } from '@/lib/jira';
import { strictObject, WorkspaceError } from '@/lib/workspace-store';
import { teamReadCache } from '@/lib/shared-read-cache';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const response = (body: unknown) => NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, X-Team-Id' } });
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const action = query.get('action') ?? 'status';
    if (action === 'status') {
      if (!jiraConfigured()) return response({ configured: false, connected: false });
      const session = await jiraSession(database(), request, false);
      return response({ configured: true, connected: !!session, ...(session ? { name: session.name } : {}) });
    }
    if (action === 'team') {
      const id = await selectedTeam(request);
      return response({ sprint: await jiraTeamSprint(database(), id) });
    }
    const service = await jiraService(database(), request);
    if (action === 'sites') return response({ options: (await service.sites()).map(({ id, name }) => ({ id, name })) });
    const cloudId = query.get('cloudId') ?? '';
    if (!/^[a-f0-9-]{36}$/i.test(cloudId) && action !== 'tickets') throw new WorkspaceError(400, 'Site Jira invalide.');
    if (action === 'boards') return response({ options: await service.boards(cloudId) });
    const boardId = Number(query.get('boardId'));
    if (action === 'sprints' && Number.isSafeInteger(boardId) && boardId > 0 && boardId <= 2_147_483_647) return response({ options: await service.sprints(cloudId, boardId) });
    if (action === 'tickets') {
      const id = await selectedTeam(request); const sprint = await jiraTeamSprint(database(), id);
      if (!sprint) throw new WorkspaceError(400, 'Cette équipe n’est pas liée à un sprint Jira.');
      const participantId = query.get('participantId');
      if (!participantId?.startsWith('jira:') || participantId.length > 100) throw new WorkspaceError(400, 'Participant Jira invalide.');
      const imported = await service.tickets(sprint, false, request.headers.get('X-Jira-Refresh') === '1');
      return response({ name: imported.name, tickets: imported.tickets.filter(ticket => `jira:${ticket.assigneeId}` === participantId) });
    }
    throw new WorkspaceError(400, 'Requête Jira invalide.');
  } catch (error) { return databaseFailure(error); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  try {
    const body = await readJson(request);
    if (body?.action === 'logout') {
      strictObject(body, ['action']); await endJiraLogin(database(), request);
      const result = response({ connected: false });
      result.cookies.set(jiraCookie, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
      return result;
    }
    const input = strictObject(body, ['action', 'revision', 'sprint']);
    if (input.action !== 'sync' || !Number.isSafeInteger(input.revision) || Number(input.revision) < 0) throw new WorkspaceError(400, 'Synchronisation Jira invalide.');
    let sprint;
    try { sprint = validateJiraSelection(input.sprint); } catch { throw new WorkspaceError(400, 'Sprint Jira invalide.'); }
    const id = await selectedTeam(request);
    return response(await teamReadCache.mutate(() => syncJiraRoster(database(), request, id, Number(input.revision), sprint)));
  } catch (error) { return databaseFailure(error instanceof SyntaxError ? new WorkspaceError(400, 'Requête Jira invalide.') : error); }
}