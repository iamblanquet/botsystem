import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { costMicros, retrieve, publicWebsite, allowedOrigins } from '../lib/core.ts';

await mkdir('.sites-runtime', { recursive: true });
const compiled = await build({ entryPoints: ['lib/server.ts'], bundle: true, platform: 'node', format: 'esm', write: false, plugins: [{ name: 'test-bindings', setup(b) {
  b.onResolve({ filter: /^(cloudflare:workers|@\/app\/chatgpt-auth)$/ }, a => ({ path: a.path, namespace: 'test' }));
  b.onLoad({ filter: /.*/, namespace: 'test' }, a => ({ contents: a.path === 'cloudflare:workers' ? 'export const env = globalThis.__nexoTestEnv;' : 'export async function getChatGPTUser() { return globalThis.__nexoTestUser; }' }));
} }] });
globalThis.__nexoTestEnv = {};
await writeFile('.sites-runtime/test-server.mjs', compiled.outputFiles[0].text);
const server = await import('../.sites-runtime/test-server.mjs');
const realFetch = globalThis.fetch;
let sql;
function statement(query, args = []) {
  return {
    bind: (...values) => statement(query, values),
    async first() { return sql.prepare(query).get(...args) || null; },
    async all() { return { results: sql.prepare(query).all(...args) }; },
    async run() { const r = sql.prepare(query).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
  };
}
async function fixture() {
  sql?.close(); sql = new DatabaseSync(':memory:');
  sql.exec(await readFile('drizzle/0000_handy_serpent_society.sql', 'utf8'));
  const db = { prepare: statement, async batch(statements) { sql.exec('BEGIN'); try { const r = []; for (const s of statements) r.push(await s.run()); sql.exec('COMMIT'); return r; } catch (e) { sql.exec('ROLLBACK'); throw e; } } };
  globalThis.__nexoTestEnv.DB = db;
  globalThis.__nexoTestEnv.ENCRYPTION_KEY = 'only-a-test-encryption-value-never-used-in-production';
  globalThis.__nexoTestEnv.GEMINI_API_KEY = undefined;
  globalThis.__nexoTestUser = { userId: 'owner-a', displayName: 'Test owner', email: 'owner@example.com' };
  globalThis.fetch = async (url) => { if (String(url).includes('/api/catalog')) return Response.json({ products: [] }); throw new Error('Unexpected network request in test'); };
  await server.admin(req('/pilots', 'POST', {}), ['pilots']);
  return server.state('owner-a');
}
function req(path, method = 'GET', data) { return new Request('https://platform.example/api' + path, { method, ...(data != null ? { headers: { 'Content-Type': 'application/json', Origin: 'https://platform.example' }, body: JSON.stringify(data) } : {}) }); }
async function send(bot, extra = {}) { return server.chat(req('/chat', 'POST', { assistantId: bot.id, message: 'Quiero conocer los libros y el podcast', requestKey: crypto.randomUUID(), ...extra })); }
async function liveBot(s, budget = 1) {
  const bot = s.assistants[0], company = s.companies.find(c => c.id === bot.company_id);
  await server.admin(req('/providers/' + company.id, 'PUT', { apiKey: 'test-gemini-key', inputPrice: 1, outputPrice: 2 }), ['providers', company.id]);
  await server.admin(req('/assistants/' + bot.id, 'PATCH', { mode: 'live' }), ['assistants', bot.id]);
  await server.admin(req('/companies/' + company.id, 'PATCH', { budget }), ['companies', company.id]);
  return bot;
}
test('pilots initialize idempotently with isolated documents and no invented spend', async () => {
  const s = await fixture();
  await server.admin(req('/pilots', 'POST', {}), ['pilots']);
  const after = await server.state('owner-a');
  assert.equal(after.companies.length, 2); assert.equal(after.assistants.length, 2); assert.equal(after.sources.length, 2);
  assert.equal(after.companies.reduce((n, c) => n + c.spent, 0), 0);
  const bot = s.assistants.find(a => a.name === 'Asistente de Manuel');
  const reply = await (await send(bot)).json();
  assert.match(reply.answer, /Manuel/); assert.doesNotMatch(reply.answer, /La Cava/); assert.equal(reply.cost, 0);
  const stored = await server.state('owner-a'); assert.equal(stored.conversations.length, 1); assert.equal(stored.usage[0].mode, 'demo');
});
test('admin endpoints require identity and enforce owner boundary', async () => {
  const s = await fixture(); globalThis.__nexoTestUser = null;
  await assert.rejects(server.admin(req(''), []), e => e.status === 401);
  globalThis.__nexoTestUser = { userId: 'owner-b', email: 'b@example.com' };
  assert.equal((await server.state('owner-b')).companies.length, 0);
  await assert.rejects(server.admin(req('/companies/x', 'PATCH', { budget: 999 }), ['companies', s.companies[0].id]), e => e.status === 404);
  await assert.rejects(server.admin(req('/sources/x'), ['sources', s.sources[0].id]), e => e.status === 404);
});
test('anonymous visitors only see published public configuration', async () => {
  const s = await fixture(), bot = s.assistants[0]; globalThis.__nexoTestUser = null;
  await assert.rejects(server.publicBot(bot.id, req('/widget')), e => e.status === 404);
  sql.prepare('UPDATE assistants SET published=1 WHERE id=?').run(bot.id);
  const config = await server.publicBot(bot.id, req('/widget'));
  assert.equal(config.name, bot.name); assert.equal(config.instructions, undefined); assert.equal(config.company_id, undefined);
});
test('API keys are encrypted at rest and absent from state', async () => {
  const s = await fixture(); await liveBot(s);
  const row = sql.prepare('SELECT encrypted_key FROM providers WHERE company_id=?').get(s.assistants[0].company_id);
  assert.ok(row.encrypted_key); assert.doesNotMatch(row.encrypted_key, /test-gemini-key/);
  const state = JSON.stringify(await server.state('owner-a'));
  assert.doesNotMatch(state, /test-gemini-key|encrypted_key/);
});
test('Gemini ledger includes thinking tokens and settles reservation', async () => {
  const s = await fixture(), bot = await liveBot(s);
  let generated = 0;
  globalThis.fetch = async url => {
    if (String(url).endsWith(':countTokens')) return Response.json({ totalTokens: 100 });
    generated++; return Response.json({ candidates: [{ content: { parts: [{ text: 'Respuesta de prueba' }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 30 } });
  };
  const reply = await (await send(bot)).json();
  assert.equal(generated, 1); assert.equal(reply.inputTokens, 100); assert.equal(reply.outputTokens, 50); assert.equal(reply.cost, 200);
  const state = await server.state('owner-a'), company = state.companies.find(c => c.id === bot.company_id);
  assert.equal(company.spent, 200); assert.equal(company.reserved, 0);
});
test('concurrent generations cannot both consume the last available budget', async () => {
  const s = await fixture(), bot = await liveBot(s, .005);
  let finish, entered;
  const generating = new Promise(r => { entered = r; });
  const barrier = new Promise(r => { finish = r; });
  globalThis.fetch = async url => {
    if (String(url).endsWith(':countTokens')) return Response.json({ totalTokens: 100 });
    entered(); await barrier;
    return Response.json({ candidates: [{ content: { parts: [{ text: 'ok' }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 } });
  };
  const first = send(bot); await generating;
  await assert.rejects(send(bot), e => e.status === 402);
  finish(); await first;
  const company = (await server.state('owner-a')).companies.find(c => c.id === bot.company_id);
  assert.equal(company.reserved, 0); assert.ok(company.spent < company.budget);
});
test('zero budget prevents generation and uncertain timeouts preserve funds', async () => {
  const s = await fixture(), bot = await liveBot(s, 0); let generated = 0;
  globalThis.fetch = async url => { if (String(url).endsWith(':countTokens')) return Response.json({ totalTokens: 100 }); generated++; throw new Error('timeout'); };
  await assert.rejects(send(bot), e => e.status === 402); assert.equal(generated, 0);
  await server.admin(req('/companies/x', 'PATCH', { budget: 1 }), ['companies', bot.company_id]);
  await assert.rejects(send(bot), e => e.status === 504);
  const state = await server.state('owner-a'), company = state.companies.find(c => c.id === bot.company_id);
  assert.equal(company.spent, 0); assert.ok(company.reserved > 0); assert.equal(state.usage[0].status, 'uncertain');
});
test('TXT uploads persist, cannot cross tenants, and can be removed', async () => {
  const s = await fixture(), bot = s.assistants[0], form = new FormData();
  form.set('assistantId', bot.id); form.set('file', new File(['Horarios: lunes a viernes, de 9 a 18 horas.'], 'horarios.txt', { type: 'text/plain' }));
  const upload = new Request('https://platform.example/api/sources', { method: 'POST', headers: { Origin: 'https://platform.example' }, body: form });
  assert.equal((await server.admin(upload, ['sources'])).status, 201);
  const state = await server.state('owner-a'), source = state.sources.find(d => d.name === 'horarios.txt');
  assert.ok(source); const read = await (await server.admin(req('/sources/x'), ['sources', source.id])).json(); assert.match(read.content, /lunes/);
  await server.admin(req('/sources/x', 'DELETE'), ['sources', source.id]);
  assert.equal((await server.state('owner-a')).sources.length, 2);
});
test('reused request IDs and conversation IDs from another bot are rejected', async () => {
  const s = await fixture(), bot = s.assistants[0], key = crypto.randomUUID();
  const reply = await (await send(bot, { requestKey: key })).json();
  await assert.rejects(send(bot, { requestKey: key }), e => e.status === 409);
  await assert.rejects(send(s.assistants[1], { conversationId: reply.conversationId }), e => e.status === 404);
});
test('rejects foreign write origins and private catalog hosts', async () => {
  const s = await fixture();
  await assert.rejects(server.admin(new Request('https://platform.example/api/companies', { method: 'POST', headers: { Origin: 'https://foreign.example' } }), ['companies']), e => e.status === 403);
  assert.throws(() => publicWebsite('https://127.0.0.1/private'));
  assert.throws(() => publicWebsite('http://example.com'));
  assert.throws(() => allowedOrigins('javascript:alert(1)'));
  assert.deepEqual(allowedOrigins('https://example.com/a'), ['https://example.com']);
});
test('retrieval selects matching source and cost math rounds conservatively', () => {
  assert.deepEqual(retrieve('devoluciones', [{ name: 'A', content: 'Horario de atención' }, { name: 'B', content: 'Devoluciones dentro de 30 días' }]).map(x => x.name), ['B']);
  assert.equal(costMicros(1, 0, 1, 0), 1);
});
process.on('exit', () => { globalThis.fetch = realFetch; sql?.close(); });
