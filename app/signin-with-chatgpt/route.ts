import { NextResponse } from 'next/server';
import { safeReturnPath } from '@/lib/admin-security.mjs';
import { requestOrigin } from '@/lib/request-origin';

export async function GET(request: Request) {
  const url = new URL('/login', requestOrigin(request));
  url.searchParams.set('return_to', safeReturnPath(new URL(request.url).searchParams.get('return_to') || '/'));
  return NextResponse.redirect(url);
}
