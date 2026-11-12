import { NextResponse, type NextRequest } from 'next/server';
import { env } from './lib/runtime-node';
import { allowedOrigins } from './lib/core';

export async function proxy(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  let ancestors = "'self'";
  const embed = request.nextUrl.pathname.match(/^\/embed\/([^/]+)$/);
  if (embed) {
    try {
      const bot = await env.DB?.prepare('SELECT origins FROM assistants WHERE id = ? AND published = 1').bind(decodeURIComponent(embed[1])).first<{ origins: string }>();
      if (bot) ancestors += ' ' + allowedOrigins(JSON.parse(bot.origins)).join(' ');
    } catch { /* Fail closed if storage or the origin configuration is unavailable. */ }
  }
  response.headers.set('Content-Security-Policy', `frame-ancestors ${ancestors}`);
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
