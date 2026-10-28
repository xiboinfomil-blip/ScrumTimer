import { NextResponse } from 'next/server';
import { database, databaseFailure, sameOrigin } from '@/lib/persistence/database';
import { beginJiraLogin, jiraConfiguration, jiraStateCookie } from '@/lib/jira/jira-auth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  try {
    const { state, url } = await beginJiraLogin(database(), new URL(request.url).origin);
    const response = NextResponse.redirect(url, 303);
    response.headers.set('Cache-Control', 'no-store'); response.headers.set('Referrer-Policy', 'no-referrer');
    response.cookies.set(jiraStateCookie, state, { httpOnly: true, secure: jiraConfiguration().callback.protocol === 'https:', sameSite: 'lax', path: '/api/jira/callback', maxAge: 600 });
    return response;
  } catch (error) { return databaseFailure(error); }
}