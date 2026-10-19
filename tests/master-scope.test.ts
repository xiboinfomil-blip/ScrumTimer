import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

// Source contracts only: HTTP 404s and actual rendering belong to browser smoke tests.
const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('master has no standalone notes/statistics route entries or navbar references', () => {
  for (const route of ['daily-notes', 'statistics']) {
    assert.equal(existsSync(new URL(`../src/app/${route}/page.tsx`, import.meta.url)), false, route);
  }
  const navbar = source('src/components/layout/navbar.tsx');
  assert.doesNotMatch(navbar, /daily-notes|statistics|Notes|Statistiques/i);
  for (const route of ['/participants', '/mood', '/timer', '/help']) {
    assert.ok(navbar.includes(`'${route}'`) || navbar.includes(`"${route}"`), route);
  }
});

test('master timer still wires active-speaker notes and the read-only full-note dialog', () => {
  assert.match(source('src/app/timer/page.tsx'), /return <TimerPage\s*\/>/);
  const timer = source('src/app/timer/_components/timer-page.tsx');
  assert.match(timer, /<TimerPanel notes=\{notes\} timer=/);
  assert.match(timer, /useDailyHints\(activeTeamId\)/);
  assert.match(timer, /refreshNotes\(\);.*\[timer\.activeId, refreshNotes\]/);
  assert.match(timer, /<DailyPrompts speakerId=\{timer\.activeId\}.*note=\{note\?\.hint\}/);
  const panel = source('src/app/timer/_components/timer-panel.tsx');
  assert.match(panel, /hints\.find\(hint => hint\.participantId === person\?\.id\)/);
  assert.doesNotMatch(panel, /data-speaker-hint/);
  const sidebar = source('src/app/timer/_components/daily-prompts.tsx');
  assert.match(sidebar, /data-speaker-hint[^>]*><ParticipantNote hint=\{note\}/);
  assert.match(sidebar, /key=\{`\$\{speakerId/);
  assert.match(sidebar, /initial=\{reduced \? false : \{ x: '100%' \}\}/);
  assert.match(sidebar, /\{note \? <>/);
  assert.match(panel, /Pense-bête/);
  assert.match(panel, /<Dialog open=\{readingNote\}/);
  assert.match(panel, /Le pense-bête de \{person\?\.name/);
  assert.match(panel, /<ParticipantNote hint=\{note\?\.hint \?\?/);
  assert.doesNotMatch(panel, /<textarea|contentEditable|dangerouslySetInnerHTML/);
});

test('master keeps DailyRound and SessionResults summary interfaces and wiring', () => {
  const shell = source('src/components/layout/app-shell.tsx');
  assert.match(shell, /todayRound && \(pathname === '\/mood' \|\| pathname === '\/timer'\)/);
  assert.match(shell, /<DailyRound key=\{todayRound\.id\}\s*\/>/);
  const daily = source('src/components/layout/daily-round.tsx');
  assert.match(daily, /export function DailyRound\(\)/);
  assert.match(daily, /<DailyDashboard round=\{round\} expanded=\{view\}\s*\/>/);
  assert.match(daily, /await resetToday\(\)/);
  const timer = source('src/app/timer/_components/timer-page.tsx');
  assert.match(timer, /people\.every\(person => person\.done\)\) return <SessionResults timer=\{\{ \.\.\.timer, people: roundSpeakers\(timer\.people\) \}\}\s*\/>/);
  const results = source('src/app/timer/_components/session-results.tsx');
  assert.match(results, /export function SessionResults\(\{ timer \}: \{ timer: StandupTimer \}\)/);
  assert.match(results, /sessionLeaderboard\(timer\.people\)/);
  assert.match(results, /sessionStatistics\(timer\.people\)/);
  assert.match(results, /<ScoreBreakdown person=\{person\}\s*\/>/);
  assert.match(results, /<MoodSlideSummary people=\{timer\.people\}\s*\/>/);
});

test('removing master full views preserves notes, history and participant bridge API exports', () => {
  const endpoints: [string, string[]][] = [
    ['daily-hints', ['GET', 'PUT']],
    ['history', ['GET', 'POST', 'DELETE']],
    ['participant-link', ['POST']],
    ['participant-portal', ['GET', 'PUT']],
  ];
  for (const [endpoint, methods] of endpoints) {
    const route = source(`src/app/api/${endpoint}/route.ts`);
    for (const method of methods) {
      assert.match(route, new RegExp(`export async function ${method}\\(request: Request\\)`));
    }
  }
});

test('shared paginated lists retain navigation without an overview feature', () => {
  const list = source('src/components/ui/paginated-list.tsx');
  assert.match(list, /Page précédente/);
  assert.match(list, /Page suivante/);
  assert.doesNotMatch(list, /Vue d’ensemble|overviewOpen|<Dialog|Aller à une personne/);
});