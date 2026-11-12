import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/admin-security.mjs';
import { requestOrigin } from '@/lib/request-origin';

export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL('/login', requestOrigin(request)));
  response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, secure: new URL(request.url).protocol === 'https:', sameSite: 'lax', path: '/', maxAge: 0 });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
