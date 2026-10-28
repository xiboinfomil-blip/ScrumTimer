import { NextResponse } from 'next/server';
import { database } from '@/lib/persistence/database';
import { endJiraLogin, finishJiraLogin, jiraConfiguration, jiraCookie, jiraSessionSeconds, jiraStateCookie } from '@/lib/jira/jira-auth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const config = jiraConfiguration();
    const cookie = await finishJiraLogin(database(), request);
    await endJiraLogin(database(), request);
    const response = NextResponse.redirect(new URL('/teams?jira=connected', config.callback.origin), 303);
    response.cookies.set(jiraCookie, cookie, { httpOnly: true, secure: config.callback.protocol === 'https:', sameSite: 'lax', path: '/', maxAge: jiraSessionSeconds });
    response.cookies.set(jiraStateCookie, '', { httpOnly: true, secure: config.callback.protocol === 'https:', sameSite: 'lax', path: '/api/jira/callback', maxAge: 0 });
    response.headers.set('Cache-Control', 'no-store'); response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  } catch {
    const response = NextResponse.redirect(new URL('/teams?jira=error', request.url), 303);
    response.cookies.set(jiraStateCookie, '', { httpOnly: true, sameSite: 'lax', path: '/api/jira/callback', maxAge: 0 });
    response.headers.set('Cache-Control', 'no-store'); response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  }
}