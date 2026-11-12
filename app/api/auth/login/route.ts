import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { env } from '@/lib/runtime-node';
import { requestOrigin, clientAddress } from '@/lib/request-origin';
import { adminConfig, createSession, SESSION_COOKIE, SESSION_SECONDS, verifyPassword } from '@/lib/admin-security.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const reply = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  if (request.headers.get('origin') !== requestOrigin(request)) return reply('Origen no autorizado.', 403);
  if (Number(request.headers.get('content-length') || 0) > 8192) return reply('Solicitud demasiado grande.', 413);
  const config = adminConfig();
  if (!config || !env.DB) return reply('El administrador debe completar las variables de acceso y la base de datos del despliegue.', 503);
  try {
    // Persist limits in the database so separate serverless invocations share them.
    const window = Math.floor(Date.now() / 900_000);
    const ip = clientAddress(request);
    const key = 'login:' + window + ':' + createHash('sha256').update(ip).digest('hex');
    const limit = await env.DB.prepare('INSERT INTO rate_limits (id, count, expires) VALUES (?, 1, ?) ON CONFLICT(id) DO UPDATE SET count = count + 1 RETURNING count').bind(key, (window + 1) * 900_000).first<{ count: number }>();
    if (!limit || limit.count > 20) return reply('Demasiados intentos. Espera 15 minutos y vuelve a intentar.', 429);
    await env.DB.prepare('DELETE FROM rate_limits WHERE expires > 0 AND expires < ?').bind(Date.now()).run();
    const text = await request.text();
    if (text.length > 8192) return reply('Solicitud demasiado grande.', 413);
    let data;
    try { data = JSON.parse(text); } catch { return reply('Solicitud inválida.', 400); }
    const email = typeof data?.email === 'string' ? data.email.trim().toLowerCase() : '';
    const password = typeof data?.password === 'string' ? data.password : '';
    // Always verify the hash, even if the email is incorrect.
    const valid = await verifyPassword(password, config.hash);
    if (!valid || email !== config.email) return reply('Correo o contraseña incorrectos.', 401);
    const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(SESSION_COOKIE, createSession(config), { httpOnly: true, secure: process.env.VERCEL === '1' || requestOrigin(request).startsWith('https:'), sameSite: 'lax', path: '/', maxAge: SESSION_SECONDS });
    return response;
  } catch {
    console.error('Admin login failed: verify database configuration and migrations.');
    return reply('No se pudo iniciar sesión. Verifica la configuración del despliegue.', 503);
  }
}
