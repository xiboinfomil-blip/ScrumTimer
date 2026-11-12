export type JiraDisplaySelection = { boardId: number; scope: 'board' | 'backlog' };
export type JiraSprintSelection = { cloudId: string; boardId: number; sprintId: number; display?: JiraDisplaySelection };
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
  if (Object.keys(input).some(key => !['boardId', 'cloudId', 'sprintId', 'display'].includes(key)) || typeof input.cloudId !== 'string' || !/^[a-f0-9-]{36}$/i.test(input.cloudId)
    || !Number.isSafeInteger(input.boardId) || Number(input.boardId) < 1 || Number(input.boardId) > 2_147_483_647
    || !Number.isSafeInteger(input.sprintId) || Number(input.sprintId) < 1 || Number(input.sprintId) > 2_147_483_647) throw new Error('Sprint Jira invalide.');
  return { cloudId: input.cloudId, boardId: Number(input.boardId), sprintId: Number(input.sprintId), ...(input.display === undefined ? {} : { display: validateJiraDisplay(input.display) }) };
}
export function validateJiraDisplay(value: unknown): JiraDisplaySelection {
  const input = jiraObject(value);
  if (Object.keys(input).sort().join(',') !== 'boardId,scope' || !Number.isSafeInteger(input.boardId) || Number(input.boardId) < 1 || Number(input.boardId) > 2_147_483_647 || typeof input.scope !== 'string' || !['board', 'backlog'].includes(input.scope)) throw new Error('Affichage Jira invalide.');
  return { boardId: Number(input.boardId), scope: input.scope as JiraDisplaySelection['scope'] };
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
  const escape = (value: string) => value.replace(/[\\`*_[\]<>~|]/g, '\\$&');
  const text = (value: unknown, depth = 0, literal = false): string => {
    if (++nodes > 4000 || depth > 30) throw new Error('Description Jira trop complexe.');
    if (value == null) return '';
    if (typeof value === 'string') {
      if (value.length > 40000) throw new Error('Description Jira trop longue.');
      return value;
    }
    const node = jiraObject(value);
    if (node.type === 'text') {
      const raw = text(node.text, depth + 1);
      if (literal) return raw;
      const leading = raw.match(/^\s*/)?.[0] ?? '';
      const trailing = raw.trim() ? raw.match(/\s*$/)?.[0] ?? '' : '';
      let result = escape(raw.trim());
      if (Array.isArray(node.marks) && node.marks.length > 20) throw new Error('Description Jira trop complexe.');
      if (Array.isArray(node.marks)) for (const markValue of node.marks) {
        const mark = jiraObject(markValue);
        if (mark.type === 'strong') result = `**${result}**`;
        if (mark.type === 'em') result = `*${result}*`;
        if (mark.type === 'strike') result = `~~${result}~~`;
        if (mark.type === 'code') {
          const fence = '`'.repeat(Math.max(0, ...(raw.match(/`+/g) ?? []).map(run => run.length)) + 1);
          result = `${fence} ${raw} ${fence}`;
        }
        if (mark.type === 'link') {
          const href = jiraObject(mark.attrs).href;
          if (typeof href === 'string' && /^https?:\/\//i.test(href)) result = `[${result}](<${href.replace(/[<>\s\\]/g, character => encodeURIComponent(character))}>)`;
        }
      }
      return leading + result + trailing;
    }
    if (node.type === 'hardBreak') return '\n';
    if (node.type === 'mention') return typeof jiraObject(node.attrs).text === 'string' ? escape(jiraText(jiraObject(node.attrs).text, 300)) : '';
    const children = Array.isArray(node.content) ? node.content.map(child => text(child, depth + 1, literal || node.type === 'codeBlock')) : [];
    const content = children.join('');
    if (content.length > 40000) throw new Error('Description Jira trop longue.');
    if (node.type === 'heading') {
      const level = Number(node.attrs && jiraObject(node.attrs).level);
      return `${'#'.repeat(Number.isInteger(level) && level >= 1 && level <= 6 ? level : 2)} ${content.trim()}\n\n`;
    }
    if (node.type === 'blockquote') return `${content.trim().split('\n').map(line => `> ${line}`).join('\n')}\n\n`;
    if (node.type === 'codeBlock') {
      const fence = '`'.repeat(Math.max(2, ...(content.match(/`+/g) ?? []).map(run => run.length)) + 1);
      return `${fence}\n${content}\n${fence}\n\n`;
    }
    if (node.type === 'bulletList' || node.type === 'orderedList') {
      const start = node.attrs && jiraObject(node.attrs).order;
      return children.map((child, index) => {
        const marker = node.type === 'bulletList' ? '-' : `${Number.isSafeInteger(start) && Number(start) > 0 ? Number(start) + index : index + 1}.`;
        return `${marker} ${child.trim().replace(/\n/g, `\n${' '.repeat(marker.length + 1)}`)}\n`;
      }).join('') + '\n';
    }
    if (node.type === 'tableRow') return `| ${children.map(child => child.trim().replace(/\n+/g, ' ')).join(' | ')} |\n`;
    if (node.type === 'table') {
      const firstRow = Array.isArray(node.content) && node.content.length ? jiraObject(node.content[0]).content : [];
      const separator = `| ${Array.from({ length: Array.isArray(firstRow) ? firstRow.length : 0 }, () => '---').join(' | ')} |\n`;
      return children.map((row, index) => index ? row : row + separator).join('') + '\n';
    }
    if (node.type === 'rule') return '\n---\n\n';
    return content + (node.type === 'paragraph' ? '\n\n' : '');
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