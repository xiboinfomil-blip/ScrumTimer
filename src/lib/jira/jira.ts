export type JiraSprintSelection = { cloudId: string; boardId: number; sprintId: number };
export type JiraOption = { id: string; name: string };
export type JiraStatusCategory = 'new' | 'indeterminate' | 'done';
export type JiraTicket = { id: string; key: string; summary: string; status: string; statusCategory?: JiraStatusCategory; issueType?: string; priority: string | null; assigneeId: string | null; assigneeName: string | null; url: string };
export type JiraTicketDetails = JiraTicket & { description: string; estimate: { label: string; value: number } | null; estimateUnavailable?: boolean; reporter: string | null; labels: string[]; components: string[]; updated: string | null; dueDate: string | null; parent: string | null };
export type JiraParticipant = { id: string; name: string; present: boolean; mood: null; moodUpdatedAt: null; moodSlide: null };
export type JiraConnection = { configured: boolean; connected: boolean; name?: string };

export function jiraObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Réponse Jira invalide.');
  return value as Record<string, unknown>;
}
export function jiraText(value: unknown, maximum = 1000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /\p{Cc}/u.test(value)) throw new Error('Réponse Jira invalide.');
  return value.trim();
}
export function validateJiraSelection(value: unknown): JiraSprintSelection {
  const input = jiraObject(value);
  if (Object.keys(input).sort().join(',') !== 'boardId,cloudId,sprintId' || typeof input.cloudId !== 'string' || !/^[a-f0-9-]{36}$/i.test(input.cloudId)
    || !Number.isSafeInteger(input.boardId) || Number(input.boardId) < 1 || Number(input.boardId) > 2_147_483_647
    || !Number.isSafeInteger(input.sprintId) || Number(input.sprintId) < 1 || Number(input.sprintId) > 2_147_483_647) throw new Error('Sprint Jira invalide.');
  return { cloudId: input.cloudId, boardId: Number(input.boardId), sprintId: Number(input.sprintId) };
}
export function jiraTickets(value: unknown, siteUrl: string): JiraTicket[] {
  const origin = new URL(siteUrl);
  if (origin.protocol !== 'https:' || origin.username || origin.password || !origin.hostname.endsWith('.atlassian.net')) throw new Error('Site Jira invalide.');
  if (!Array.isArray(value)) throw new Error('Tickets Jira invalides.');
  return value.map(item => {
    const issue = jiraObject(item); const fields = jiraObject(issue.fields);
    const assignee = fields.assignee == null ? null : jiraObject(fields.assignee);
    const status = jiraObject(fields.status);
    const category = status.statusCategory == null ? undefined : jiraObject(status.statusCategory).key;
    const key = jiraText(issue.key, 100);
    if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(key)) throw new Error('Clé Jira invalide.');
    return { id: jiraText(issue.id, 100), key, summary: jiraText(fields.summary), status: jiraText(status.name, 100),
      ...(category === 'new' || category === 'indeterminate' || category === 'done' ? { statusCategory: category } : {}),
      ...(fields.issuetype == null ? {} : { issueType: jiraText(jiraObject(fields.issuetype).name, 100) }),
      priority: fields.priority == null ? null : jiraText(jiraObject(fields.priority).name, 100),
      assigneeId: assignee ? jiraText(assignee.accountId, 100) : null, assigneeName: assignee ? jiraText(assignee.displayName, 300) : null,
      url: new URL(`/browse/${encodeURIComponent(key)}`, origin.origin).href };
  });
}
export function sprintParticipants(tickets: readonly JiraTicket[]): JiraParticipant[] {
  const people = new Map<string, JiraParticipant>();
  for (const ticket of tickets) {
    if (!ticket.assigneeId || !ticket.assigneeName) continue;
    const id = `jira:${ticket.assigneeId}`;
    if (id.length > 100 || [...ticket.assigneeName].length > 60) throw new Error('Un compte Jira dépasse les limites des participants.');
    people.set(id, { id, name: ticket.assigneeName, present: true, mood: null, moodUpdatedAt: null, moodSlide: null });
  }
  if (!people.size) throw new Error('Ce sprint ne contient aucun ticket attribué.');
  if (people.size > 100) throw new Error('Ce sprint dépasse la limite de 100 participants.');
  return [...people.values()].sort((left, right) => left.name.localeCompare(right.name, 'fr'));
}

export function jiraTicketDetails(value: unknown, siteUrl: string, estimateField?: { id: string; name: string }): JiraTicketDetails {
  const fields = jiraObject(jiraObject(value).fields);
  let nodes = 0;
  const text = (value: unknown, depth = 0): string => {
    if (++nodes > 4000 || depth > 30) throw new Error('Description Jira trop complexe.');
    if (value == null) return '';
    if (typeof value === 'string') {
      if (value.length > 40000) throw new Error('Description Jira trop longue.');
      return value;
    }
    const node = jiraObject(value);
    if (node.type === 'text') return text(node.text, depth + 1);
    if (node.type === 'hardBreak') return '\n';
    if (node.type === 'mention') return typeof jiraObject(node.attrs).text === 'string' ? jiraText(jiraObject(node.attrs).text, 300) : '';
    const content = Array.isArray(node.content) ? node.content.map(child => text(child, depth + 1)).join('') : '';
    return node.type === 'listItem' ? `• ${content.trim()}\n` : content + (['paragraph', 'heading', 'blockquote', 'codeBlock', 'bulletList', 'orderedList', 'tableRow'].includes(String(node.type)) ? '\n' : '');
  };
  const description = text(fields.description).trim();
  if (description.length > 40000) throw new Error('Description Jira trop longue.');
  const rawEstimate = estimateField ? fields[estimateField.id] : null;
  const labels = fields.labels ?? [];
  const components = fields.components ?? [];
  if (!Array.isArray(labels) || !Array.isArray(components) || labels.length > 100 || components.length > 100) throw new Error('Métadonnées Jira invalides.');
  return { ...jiraTickets([value], siteUrl)[0], description,
    estimate: estimateField && typeof rawEstimate === 'number' && Number.isFinite(rawEstimate) && rawEstimate >= 0 ? { label: estimateField.name, value: rawEstimate } : null,
    reporter: fields.reporter == null ? null : jiraText(jiraObject(fields.reporter).displayName, 300),
    labels: labels.map(label => jiraText(label, 200)), components: components.map(component => jiraText(jiraObject(component).name, 200)),
    updated: fields.updated == null ? null : jiraText(fields.updated, 50), dueDate: fields.duedate == null ? null : jiraText(fields.duedate, 50),
    parent: fields.parent == null ? null : jiraText(jiraObject(fields.parent).key, 100) };
}