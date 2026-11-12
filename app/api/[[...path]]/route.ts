import { admin, chat, flowChat, HttpError, imageAsset, json, publicBot } from '@/lib/server';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;
async function handle(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  try {
    const { path = [] } = await context.params;
    if (path[0] === 'assets' && path[1] && path.length === 2 && request.method === 'GET') return await imageAsset(request, path[1]);
    if (path[0] === 'chat' && request.method === 'POST') return await chat(request);
    if (path[0] === 'flow' && request.method === 'POST') return await flowChat(request);
    if (path[0] === 'widget' && path[1] && request.method === 'GET') return json(await publicBot(path[1], request));
    return await admin(request, path);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    if (e instanceof Error && (e.message.includes('inválid') || e.message.includes('HTTPS') || e.message.includes('dominio') || e.message.includes('Importe'))) return json({ error: e.message }, 400);
    console.error('Nexo request failed', e instanceof Error ? e.name : 'unknown');
    return json({ error: 'No se pudo completar la operación. Intenta de nuevo.' }, 500);
  }
}
export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
