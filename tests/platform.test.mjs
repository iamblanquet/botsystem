import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { deflateSync, crc32 } from 'node:zlib';
import { validateAvatarPng } from '../lib/avatar-image.ts';
import { avatarDrawRect, defaultAvatarCrop } from '../lib/avatar-crop.ts';
import { parseKnowledge, serializeMatrix } from '../lib/knowledge-import.ts';
import { emptyPlaybook, flowTemplate, pilotPlaybook, validatePlaybook, recommend } from '../lib/flows.ts';

await mkdir('.sites-runtime', { recursive: true });
const coreBundle = await build({ entryPoints: ['lib/core.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { costMicros, retrieve, publicWebsite, allowedOrigins, geminiGenerationConfig, mentionedProducts } = await import('data:text/javascript;base64,' + Buffer.from(coreBundle.outputFiles[0].text).toString('base64'));
const compiled = await build({ entryPoints: ['lib/server.ts'], bundle: true, platform: 'node', format: 'esm', write: false, plugins: [{ name: 'test-bindings', setup(b) {
  b.onResolve({ filter: /^(@\/lib\/runtime|@\/app\/chatgpt-auth)$/ }, a => ({ path: a.path, namespace: 'test' }));
  b.onLoad({ filter: /.*/, namespace: 'test' }, a => ({ contents: a.path === '@/lib/runtime' ? 'export const env = globalThis.__nexoTestEnv;' : 'export async function getChatGPTUser() { return globalThis.__nexoTestUser; }' }));
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
  for (const migration of (await readdir('drizzle')).filter(f => f.endsWith('.sql')).sort()) sql.exec(await readFile('drizzle/' + migration, 'utf8'));
  const db = { prepare: statement, async batch(statements) { sql.exec('BEGIN'); try { const r = []; for (const s of statements) r.push(await s.run()); sql.exec('COMMIT'); return r; } catch (e) { sql.exec('ROLLBACK'); throw e; } } };
  globalThis.__nexoTestEnv.DB = db;
  globalThis.__nexoTestEnv.ENCRYPTION_KEY = 'only-a-test-encryption-value-never-used-in-production';
  globalThis.__nexoTestEnv.GEMINI_API_KEY = undefined;
  globalThis.__nexoTestEnv.BUCKET = undefined;
  globalThis.__nexoTestUser = { userId: 'owner-a', displayName: 'Test owner', email: 'owner@example.com' };
  globalThis.fetch = async (url) => { if (String(url).includes('/api/catalog')) return Response.json({ products: [] }); throw new Error('Unexpected network request in test'); };
  await server.admin(req('/pilots', 'POST', {}), ['pilots']);
  await server.admin(req('/playbooks/initialize', 'POST', {}), ['playbooks', 'initialize']);
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
test('pilot demo data is scoped to the owner and excludes internal assistant instructions', async () => {
  await fixture();
  const author = await server.demoPilot('owner-a', 'manuel');
  assert.equal(author.company.name, 'Manuel Martínez');
  assert.equal(author.assistant.name, 'Asistente de Manuel');
  assert.equal(author.assistant.instructions, undefined);
  assert.deepEqual(author.products, []);
  assert.equal(await server.demoPilot('another-owner', 'manuel'), null);
});
test('API keys are encrypted at rest and absent from state', async () => {
  const s = await fixture(); await liveBot(s);
  const row = sql.prepare('SELECT encrypted_key FROM providers WHERE company_id=?').get(s.assistants[0].company_id);
  assert.ok(row.encrypted_key); assert.doesNotMatch(row.encrypted_key, /test-gemini-key/);
  const state = JSON.stringify(await server.state('owner-a'));
  assert.doesNotMatch(state, /test-gemini-key|encrypted_key/);
});
test('connection check requires a key and validates Gemini without generating content', async () => {
  const s = await fixture(), company = s.companies[0];
  await assert.rejects(server.admin(req('/providers/x/check', 'POST', {}), ['providers', company.id, 'check']), e => e.status === 400);
  await liveBot(s);
  let requests = 0;
  globalThis.fetch = async (url, options) => {
    requests++;
    assert.ok(String(url).endsWith(':countTokens'));
    assert.equal(options.headers['x-goog-api-key'], 'test-gemini-key');
    assert.doesNotMatch(options.body, /test-gemini-key/);
    return Response.json({ totalTokens: 7 });
  };
  const result = await (await server.admin(req('/providers/x/check', 'POST', {}), ['providers', company.id, 'check'])).json();
  assert.equal(requests, 1); assert.equal(result.ok, true); assert.equal(result.generationPerformed, false);
  assert.equal((await server.state('owner-a')).usage.length, 0);
  globalThis.__nexoTestUser = { userId: 'another-owner', email: 'other@example.com' };
  await assert.rejects(server.admin(req('/providers/x/check', 'POST', {}), ['providers', company.id, 'check']), e => e.status === 404);
});
test('connection errors are useful without exposing provider payloads', async () => {
  const s = await fixture(); await liveBot(s);
  globalThis.fetch = async () => Response.json({ error: { message: 'test-gemini-key' } }, { status: 403 });
  await assert.rejects(server.admin(req('/providers/x/check', 'POST', {}), ['providers', s.companies[0].id, 'check']), e => e.status === 400 && !e.message.includes('test-gemini-key'));
  globalThis.fetch = async () => Response.json({}, { status: 429 });
  await assert.rejects(server.admin(req('/providers/x/check', 'POST', {}), ['providers', s.companies[0].id, 'check']), e => e.status === 429);
});
test('catalog integration uses Worker-compatible redirect handling and excludes unavailable products', async () => {
  const s = await fixture(), bot = s.assistants.find(a => a.name === 'Sofía');
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, 'https://winetalia.vercel.app/api/catalog');
    assert.equal(options.redirect, 'manual');
    return Response.json({ products: [
      { id: 'available', name: 'Vino disponible', price_cents: 63400, available: true },
      { id: 'unavailable', name: 'Vino agotado', price_cents: 50000, available: false },
    ] });
  };
  const result = await (await server.admin(req('/assistants/x/catalog-check', 'POST', {}), ['assistants', bot.id, 'catalog-check'])).json();
  assert.equal(result.count, 1); assert.equal(result.products[0].price, 634); assert.equal(calls, 1);
  globalThis.fetch = async () => new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/private' } });
  const redirect = await (await server.admin(req('/assistants/x/catalog-check', 'POST', {}), ['assistants', bot.id, 'catalog-check'])).json();
  assert.equal(redirect.count, 0);
  globalThis.__nexoTestUser = { userId: 'another-owner', email: 'other@example.com' };
  await assert.rejects(server.admin(req('/assistants/x/catalog-check', 'POST', {}), ['assistants', bot.id, 'catalog-check']), e => e.status === 404);
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
  const s = await fixture(), bot = await liveBot(s, .01);
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
test('Gemini 3 chat requests select low thinking and omit deprecated sampling parameters', () => {
  const config = geminiGenerationConfig('gemini-3.8-flash');
  assert.equal(config.thinkingConfig.thinkingLevel, 'LOW');
  assert.equal(config.temperature, undefined);
  assert.equal(config.maxOutputTokens, 4096);
  const legacy = geminiGenerationConfig('gemini-2.5-flash');
  assert.equal(legacy.thinkingConfig, undefined);
  assert.equal(legacy.temperature, .3);
});
test('product cards correspond to products in the answer rather than unrelated catalog entries', () => {
  const products = [{ name: 'Tabla Cosecha' }, { name: 'Queso de cabra' }, { name: '281 Rosé 2014' }];
  assert.deepEqual(mentionedProducts('Te sugiero **281 Rosé 2014** para esta cena.', products), [products[2]]);
  assert.deepEqual(mentionedProducts('No tengo datos suficientes para recomendar.', products), []);
});
async function playbook(bot) { return (await server.admin(req('/assistants/x/playbook'), ['assistants', bot.id, 'playbook'])).json(); }
async function savePlaybook(bot, config, version) { const p = version === undefined ? await playbook(bot) : { version }; return (await server.admin(req('/assistants/x/playbook', 'PUT', { config, version: p.version }), ['assistants', bot.id, 'playbook'])).json(); }
async function flow(bot, data) { return (await server.flowChat(req('/flow', 'POST', { assistantId: bot.id, requestKey: crypto.randomUUID(), ...data }))).json(); }
async function answerFlow(bot, result, value) { return flow(bot, { action: 'answer', conversationId: result.conversationId, revision: result.flow.revision, stepId: result.flow.step.id, value }); }

test('playbook initialization preserves local customizations and rejects stale saves and foreign owners', async () => {
  const s = await fixture(), bot = s.assistants[0], p = await playbook(bot);
  p.config.profile.contact = 'Contacto privado de configuración para este asistente';
  const saved = await savePlaybook(bot, p.config);
  await server.admin(req('/playbooks/initialize', 'POST', {}), ['playbooks', 'initialize']);
  assert.equal((await playbook(bot)).config.profile.contact, p.config.profile.contact);
  await assert.rejects(savePlaybook(bot, p.config, p.version), e => e.status === 409);
  assert.equal((await playbook(bot)).version, saved.version);
  const publicConfig = JSON.stringify(await server.publicBot(bot.id, req('/widget')));
  assert.doesNotMatch(publicConfig, /Contacto privado|resultTitle|instructions/);
  globalThis.__nexoTestUser = { userId: 'owner-b' };
  await assert.rejects(playbook(bot), e => e.status === 404);
  await assert.rejects(savePlaybook(bot, p.config, saved.version), e => e.status === 404);
});

test('configuration validation rejects circular branches, malformed numbers, duplicate IDs and unsafe links', () => {
  const p = pilotPlaybook('books');
  assert.doesNotThrow(() => validatePlaybook(p));
  const branch = structuredClone(p); branch.flows[0].steps[0].when = { stepId: 'objetivo', optionId: 'o0' };
  assert.throws(() => validatePlaybook(branch), /pregunta anterior/);
  const dup = structuredClone(p); dup.items.push({ ...dup.items[0] }); assert.throws(() => validatePlaybook(dup), /repetidos/);
  const unsafe = structuredClone(p); unsafe.items[0].url = 'javascript:alert(1)'; assert.throws(() => validatePlaybook(unsafe), /HTTPS/);
  const amount = structuredClone(p); amount.items[0].price = '500'; assert.throws(() => validatePlaybook(amount), /numérico/);
});

test('book flow uses only approved local item metadata, never calls Gemini and records a retry once', async () => {
  const s = await fixture(), bot = s.assistants.find(a => a.name.includes('Manuel')), p = await playbook(bot);
  p.config.items[0].tags = ['historia']; p.config.items[0].description = 'Descripción aprobada de prueba'; p.config.flows[0].maxResults = 1;
  await savePlaybook(bot, p.config);
  globalThis.fetch = () => { throw new Error('Guided books must not call an external service'); };
  const key = crypto.randomUUID(), startData = { action: 'start', flowId: 'books', requestKey: key };
  let r = await flow(bot, startData), replay = await flow(bot, startData);
  assert.deepEqual(replay, r);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM messages WHERE conversation_id=?').get(r.conversationId).n, 2);
  await assert.rejects(answerFlow(bot, r, 'invalid-option'), e => e.status === 400);
  const old = r; r = await answerFlow(bot, r, 'o0');
  await assert.rejects(answerFlow(bot, old, 'o0'), e => e.status === 409);
  r = await answerFlow(bot, r, 'o0');
  assert.equal(r.flow.status, 'completed'); assert.equal(r.cost, 0); assert.equal(r.mode, 'guided');
  assert.deepEqual(r.recommendations.map(x => x.name), ['La Historia como Pacto']);
  assert.match(r.answer, /Descripción aprobada/); assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM usage').get().n, 0);
  await assert.rejects(flow(s.assistants.find(a => a.id !== bot.id), { action: 'answer', conversationId: r.conversationId, value: 'o0' }), e => e.status === 404);
});

test('conditional questions, optional answers and going back discard answers from the previous branch', async () => {
  const s = await fixture(), bot = s.assistants[0], p = await playbook(bot), f = p.config.flows[0];
  const condition = { id: 'detalle', question: 'Detalle de historia', type: 'text', required: false, options: [], min: 0, max: 1000, role: 'preference', when: { stepId: 'interes', optionId: 'o0' } };
  f.steps.splice(1, 0, condition); await savePlaybook(bot, p.config);
  let r = await flow(bot, { action: 'start', flowId: f.id });
  r = await answerFlow(bot, r, 'o0'); assert.equal(r.flow.step.id, 'detalle');
  r = await answerFlow(bot, r, ''); assert.equal(r.flow.step.id, 'objetivo');
  r = await flow(bot, { action: 'back', conversationId: r.conversationId, revision: r.flow.revision });
  assert.equal(r.flow.step.id, 'detalle');
  r = await flow(bot, { action: 'back', conversationId: r.conversationId, revision: r.flow.revision });
  r = await answerFlow(bot, r, 'o2'); assert.equal(r.flow.step.id, 'objetivo');
  const stored = JSON.parse(sql.prepare('SELECT state FROM flow_sessions WHERE conversation_id=?').get(r.conversationId).state);
  assert.deepEqual(stored.answers, { interes: 'o2' });
});

test('wine flow enforces numeric budget and live catalog authority while allowing local occasion tags', async () => {
  const s = await fixture(), bot = s.assistants.find(a => a.name === 'Sofía'), p = await playbook(bot);
  p.config.items.push({ id: 'extra-wine', externalId: 'wine-1', name: 'Stale name', category: 'wine', description: 'Para una cena especial según el negocio', tags: ['cena', 'amigos'], price: 1, url: '', available: true });
  await savePlaybook(bot, p.config);
  let calls = 0;
  globalThis.fetch = async (url) => { calls++; assert.ok(String(url).includes('/api/catalog')); return Response.json({ products: [
    { id: 'wine-1', name: 'Tinto actual', kind: 'wine', wine_type: 'red', price_cents: 45000 },
    { id: 'wine-2', name: 'Fuera de presupuesto', kind: 'wine', price_cents: 90000 },
    { id: 'cheese', name: 'Queso', kind: 'cheese', price_cents: 5000 },
    { id: 'missing', name: 'Sin precio', kind: 'wine', price: 'not-a-number' },
    { id: 'null-price', name: 'Precio pendiente', kind: 'wine', wine_type: 'red', price: null },
    { id: 'sold-out', name: 'Agotado', kind: 'wine', price_cents: 10000, available: false },
  ] }); };
  let r = await flow(bot, { action: 'start', flowId: 'wine' }); r = await answerFlow(bot, r, 'o0');
  await assert.rejects(answerFlow(bot, r, '-10'), e => e.status === 400);
  await assert.rejects(answerFlow(bot, r, 'Infinity'), e => e.status === 400);
  r = await answerFlow(bot, r, '500'); r = await answerFlow(bot, r, 'o0');
  assert.equal(calls, 1); assert.deepEqual(r.products.map(x => [x.id, x.price]), [['wine-1', 450]]);
  assert.match(r.answer, /Tinto actual/); assert.match(r.answer, /cena/); assert.doesNotMatch(r.answer, /Stale name/);
  r = await flow(bot, { action: 'back', conversationId: r.conversationId, revision: r.flow.revision });
  r = await flow(bot, { action: 'back', conversationId: r.conversationId, revision: r.flow.revision });
  r = await answerFlow(bot, r, '100'); r = await answerFlow(bot, r, 'o0');
  assert.equal(r.recommendations.length, 0); assert.match(r.answer, /No encontré/);
});

test('total budgets, strict affinity, inactive items and unknown prices are respected', () => {
  const f = flowTemplate('wine'); f.source = 'local'; f.budgetScope = 'total'; f.requireMatch = true;
  f.steps.push({ ...f.steps[1], id: 'cantidad', role: 'quantity', min: 1 });
  const base = { category: 'wine', description: '', price: 200, url: '', available: true, tags: ['tinto'] };
  const items = [ { ...base, id: 'ok', name: 'A' }, { ...base, id: 'expensive', name: 'B', price: 300 }, { ...base, id: 'missing', name: 'C', price: null }, { ...base, id: 'inactive', name: 'D', available: false }, { ...base, id: 'mismatch', name: 'E', tags: ['blanco'] } ];
  assert.deepEqual(recommend(f, { ocasion: 'o2', presupuesto: '500', estilo: 'o0', cantidad: '2' }, items).map(x => x.id), ['ok']);
});

test('an obligatory style filter cannot be overridden by occasion affinity or a cheaper product', () => {
  const f = flowTemplate('wine');
  const base = { category: 'wine', description: '', price: 100, url: '', available: true };
  const items = [{ ...base, id: 'red', name: 'Tinto', tags: ['tinto', 'celebracion'] }, { ...base, id: 'sparkling', name: 'Espumoso', tags: ['espumoso'], price: 400 }];
  assert.deepEqual(recommend(f, { ocasion: 'o1', presupuesto: '500', estilo: 'o2' }, items).map(x => x.id), ['sparkling']);
  assert.deepEqual(recommend(f, { ocasion: 'o1', presupuesto: '200', estilo: 'o2' }, items), []);
  assert.equal(recommend(f, { ocasion: 'o1', presupuesto: '500', estilo: 'o3' }, items).length, 2);
});

test('guided endpoints reject unavailable assistants and foreign write origins before recording data', async () => {
  const s = await fixture(), bot = s.assistants[0];
  const forged = new Request('https://platform.example/api/flow', { method: 'POST', headers: { Origin: 'https://foreign.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ assistantId: bot.id, requestKey: crypto.randomUUID(), action: 'start', flowId: 'books' }) });
  await assert.rejects(server.flowChat(forged), e => e.status === 403);
  globalThis.__nexoTestUser = null;
  await assert.rejects(flow(bot, { action: 'start', flowId: 'books' }), e => e.status === 404);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM conversations').get().n, 0);
});

test('configuration changes invalidate active sessions; cancelling keeps free chat and budgets intact', async () => {
  const s = await fixture(), bot = s.assistants[0]; let r = await flow(bot, { action: 'start', flowId: 'books' });
  const p = await playbook(bot); p.config.flows[0].name = 'Recorrido nuevo'; await savePlaybook(bot, p.config);
  await assert.rejects(answerFlow(bot, r, 'o0'), e => e.status === 409);
  r = await flow(bot, { action: 'start', flowId: 'books', conversationId: r.conversationId, revision: r.flow.revision });
  r = await flow(bot, { action: 'cancel', conversationId: r.conversationId, revision: r.flow.revision });
  assert.equal(r.flow.status, 'cancelled');
  const reply = await (await send(bot, { conversationId: r.conversationId })).json();
  assert.equal(reply.conversationId, r.conversationId); assert.equal(reply.cost, 0);
  assert.equal((await server.state('owner-a')).companies[0].reserved, 0);
});

test('easy-entry FAQ knowledge reaches Gemini only for its own assistant', async () => {
  const s = await fixture(), bot = await liveBot(s), p = await playbook(bot);
  p.config.faqs.push({ id: 'faq-test', question: '¿Cuál es el canal para manuscritos?', answer: 'Canal aprobado de prueba: contacto editorial Alfa.' }); await savePlaybook(bot, p.config);
  let captured = '';
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith(':countTokens')) return Response.json({ totalTokens: 200 });
    captured = JSON.parse(options.body).systemInstruction.parts[0].text;
    return Response.json({ candidates: [{ content: { parts: [{ text: 'Canal editorial Alfa' }] } }], usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 10 } });
  };
  await send(bot, { message: '¿Cuál es el canal para manuscritos?' }); assert.match(captured, /contacto editorial Alfa/);
  const other = await (await send(s.assistants.find(a => a.id !== bot.id), { message: '¿Cuál es el canal para manuscritos?' })).json();
  assert.doesNotMatch(other.answer, /editorial Alfa/);
});
test('appearance persists per assistant and is exposed consistently to its iframe and demo', async () => {
  const s = await fixture(), a = s.assistants[0], other = s.assistants[1], originalOther = other.theme;
  const theme = { background: '#121212', surface: '#222222', text: '#eeeeee', font: 'serif', fontSize: 16, radius: 0, avatar: 'book', avatarSize: 64, showSuggestions: false, position: 'left', width: 440, height: 720 };
  await server.admin(req('/assistants/x', 'PATCH', { color: '#ccaa77', theme }), ['assistants', a.id]);
  const state = await server.state('owner-a'), stored = state.assistants.find(x => x.id === a.id);
  assert.equal(stored.theme.font, 'serif'); assert.equal(stored.theme.radius, 0);
  assert.equal(stored.theme.avatarSize, 64);
  assert.deepEqual(state.assistants.find(x => x.id === other.id).theme, originalOther);
  const config = await server.publicBot(a.id, req('/widget'));
  assert.deepEqual(config.theme, stored.theme); assert.equal(config.instructions, undefined);
  const demo = await server.demoPilot('owner-a', 'manuel'); assert.deepEqual(demo.assistant.theme, stored.theme);
  await server.admin(req('/assistants/x', 'PATCH', { name: 'Nombre nuevo' }), ['assistants', a.id]);
  assert.deepEqual((await server.publicBot(a.id, req('/widget'))).theme, stored.theme);
  globalThis.__nexoTestUser = { userId: 'another-owner' };
  await assert.rejects(server.admin(req('/assistants/x', 'PATCH', { theme }), ['assistants', a.id]), e => e.status === 404);
});

test('appearance rejects CSS injection, private avatar URLs and unsupported values without partial writes', async () => {
  const s = await fixture(), bot = s.assistants[0], original = (await server.publicBot(bot.id, req('/widget'))).theme;
  for (const theme of [{ launcherShape: 'star' }, { launcherRadius: 49 }, { launcherBorderWidth: 9 }, { launcherBorderWidth: -1 }, { launcherBorderWidth: 1.5 }, { launcherBorderStyle: 'url(evil)' }, { launcherBorderColor: 'red;display:none' }, { launcherLogoMode: 'html' }, { launcherIcon: 'none' }, { launcherColor: 'red;display:none' }, { launcherTextColor: 'url(evil)' }, { launcherVertical: 'center' }, { launcherSize: 39 }, { launcherSize: 97 }, { launcherSize: 58.5 }, { launcherOffsetX: 7 }, { launcherOffsetY: 121 }, { launcherLogoUrl: 'javascript:alert(1)' }, { launcherLogoUrl: 'https://127.0.0.1/private' }, { launcherLogoUrl: 'blob:http://localhost/preview' }, null, [], { css: 'body {display:none}' }, { background: 'url(https://bad.example)' }, { font: 'evil-font' }, { fontSize: 3 }, { radius: -1 }, { width: 9999999 }, { avatarSize: 27 }, { avatarSize: 73 }, { avatarShape: 'star' }, { avatarRadius: 29 }, { avatarBorderWidth: -1 }, { avatarBorderWidth: 7 }, { avatarBorderWidth: 1.5 }, { avatarBorderStyle: 'url(evil)' }, { avatarBorderColor: 'red;display:none' }, { avatarUrl: 'blob:http://localhost/preview-only' }, { avatarUrl: 'javascript:alert(1)' }, { avatarUrl: 'https://127.0.0.1/private' }, { avatarUrl: '//external.example/logo.png' }, { showDay: 'yes' }]) {
    await assert.rejects(server.admin(req('/assistants/x', 'PATCH', { color: '#123456', theme }), ['assistants', bot.id]), e => e.status === 400);
    assert.deepEqual((await server.publicBot(bot.id, req('/widget'))).theme, original);
  }
  await server.admin(req('/assistants/x', 'PATCH', { theme: { avatarUrl: '/demo-assets/manuel-portrait.png' } }), ['assistants', bot.id]);
  assert.equal((await server.publicBot(bot.id, req('/widget'))).theme.avatarUrl, '/demo-assets/manuel-portrait.png');
});

test('widget loader applies trusted appearance to the launcher and bounds iframe dimensions', async () => {
  const bundled = await build({ entryPoints: ['app/widget.js/route.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
  const loader = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
  const script = await (await loader.GET(new Request('https://platform.example/widget.js'))).text();
  const elements = [], listeners = {};
  function element(tag) { const e = { tag, style: {}, dataset: {}, children: [], setAttribute(k, v) { this[k] = v; }, appendChild(child) { this.children.push(child); }, contentWindow: { postMessage() {} } }; Object.defineProperty(e, 'textContent', { set() { this.children = []; } }); elements.push(e); return e; }
  const document = { currentScript: { dataset: { assistantId: 'bot-test' } }, createElement: element, createElementNS: (_, tag) => element(tag), body: element('body') };
  const window = { addEventListener(name, fn) { listeners[name] = fn; }, dispatchEvent() {} };
  runInNewContext(script, { document, window, CustomEvent: class {} });
  const iframe = elements.find(x => x.tag === 'iframe'), panel = elements.find(x => x.tag === 'div'), button = elements.find(x => x.tag === 'button');
  const appearance = { color: '#123456', name: 'Marca propia', theme: { radius: 8, background: '#222222', border: '#333333', buttonText: '#ffffff', height: 720, width: 440, position: 'left', avatar: 'book' } };
  const event = { origin: 'https://platform.example', source: iframe.contentWindow, data: { type: 'nexo:connected', assistantId: 'bot-test', appearance } };
  listeners.message({ ...event, origin: 'https://foreign.example' }); assert.equal(panel.style.left, 'auto');
  listeners.message({ ...event, source: {} }); assert.equal(button.style.background, undefined);
  listeners.message({ ...event, data: { ...event.data, assistantId: 'other-company' } }); assert.equal(button.style.background, undefined);
  listeners.message(event); assert.match(panel.style.left, /16px/); assert.equal(panel.style.right, 'auto'); assert.match(panel.style.width, /440px/); assert.equal(button.style.background, '#123456'); assert.equal(iframe.title, 'Marca propia');
  listeners.message({ ...event, data: { ...event.data, appearance: { ...appearance, theme: { ...appearance.theme, width: 99999999 } } } });
  assert.match(panel.style.width, /390px/);
  const themed = { ...appearance, theme: { ...appearance.theme, launcherLogoMode: 'custom', launcherLogoUrl: '/api/assets/test-image', launcherColor: '#773355', launcherTextColor: '#ffeedd', launcherSize: 84, launcherVertical: 'top', launcherOffsetX: 32, launcherOffsetY: 40 } };
  listeners.message({ ...event, data: { ...event.data, appearance: themed } });
  assert.equal(button.style.width, '84px'); assert.equal(button.style.height, '84px'); assert.equal(button.style.background, '#773355'); assert.equal(button.style.color, '#ffeedd');
  assert.equal(button.style.bottom, 'auto'); assert.match(button.style.top, /40px/); assert.match(panel.style.top, /96px/); assert.equal(panel.style.bottom, 'auto');
  assert.equal(button.children[0].src, 'https://platform.example/api/assets/test-image');
  button.onclick(); assert.equal(button['aria-expanded'], 'true'); assert.equal(panel.style.display, 'block'); assert.equal(button.children[0].tag, 'svg');
  button.onclick(); assert.equal(button['aria-expanded'], 'false'); assert.equal(button.children[0].tag, 'img');
  button.children[0].onerror(); assert.equal(button.children[0].tag, 'svg');
  listeners.message({ ...event, data: { ...event.data, appearance: { ...themed, theme: { ...themed.theme, launcherLogoUrl: 'javascript:alert(1)', launcherSize: 999 } } } });
  assert.equal(button.style.width, '58px'); assert.equal(button.children[0].tag, 'svg');
  for (const [shape, radius, style] of [['circle', '50%', 'solid'], ['square', '0px', 'dashed'], ['rounded', '18px', 'dotted']]) {
    listeners.message({ ...event, data: { ...event.data, appearance: { ...themed, theme: { ...themed.theme, launcherShape: shape, launcherRadius: 18, launcherBorderWidth: 4, launcherBorderColor: '#abcdef', launcherBorderStyle: style } } } });
    assert.equal(button.style.borderRadius, radius); assert.equal(button.style.borderWidth, '4px'); assert.equal(button.style.borderColor, '#abcdef'); assert.equal(button.style.borderStyle, style);
    button.onclick(); assert.equal(button.style.borderRadius, radius); assert.equal(button.style.width, '84px'); button.onclick();
  }
});
function avatarPng(width = 2, height = 1, rgba = [180, 130, 70, 128], compressedOverride) {
  function chunk(type, bytes) { const name = Buffer.from(type), size = Buffer.alloc(4), checksum = Buffer.alloc(4); size.writeUInt32BE(bytes.length); checksum.writeUInt32BE(crc32(Buffer.concat([name, bytes]))); return Buffer.concat([size, name, bytes, checksum]); }
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const pixels = Buffer.alloc((width * 4 + 1) * height);
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) pixels.set(rgba, row * (width * 4 + 1) + 1 + col * 4);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', compressedOverride || deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
function imageBucket() {
  const objects = new Map();
  globalThis.__nexoTestEnv.BUCKET = { async put(key, bytes) { objects.set(key, new Uint8Array(bytes)); }, async get(key) { const body = objects.get(key); return body ? { body } : null; }, async delete(key) { objects.delete(key); } };
  return objects;
}
async function uploadAvatar(bot, bytes = avatarPng(), options = {}) {
  const form = new FormData(); form.set('file', new File([bytes], options.name || 'mi-logo.png', { type: options.mime || 'image/png' }));
  const request = new Request('https://platform.example/api/assistants/' + bot.id + '/avatar', { method: 'POST', headers: { Origin: options.origin || 'https://platform.example' }, body: form });
  return server.admin(request, ['assistants', bot.id, 'avatar']);
}
test('CSV and TSV matrices keep headers, quoted multiline cells and row context in retrieval', () => {
  const csv = '\uFEFFTema;Pregunta;Respuesta\r\nBruma;"¿Maridaje, para Bruma?";"Cena con setas; notas de \"\"bosque\"\".\nServir fresco."\r\nLumbre;¿Con qué va?;Ensalada cítrica.';
  const parsed = parseKnowledge(csv, 'csv');
  assert.equal(parsed.rowCount, 2); assert.equal(parsed.matrices[0].headers[0], 'Tema');
  assert.equal(parsed.matrices[0].rows[0][2], 'Cena con setas; notas de "bosque".\nServir fresco.');
  const match = retrieve('Bruma', [{ name: 'Maridajes', content: csv, type: 'csv' }]);
  assert.equal(match.length, 1); assert.match(match[0].content, /Pregunta: ¿Maridaje, para Bruma/); assert.match(match[0].content, /Respuesta: Cena con setas/); assert.doesNotMatch(match[0].content, /Lumbre/);
  const tsv = serializeMatrix(['Tema', 'Respuesta'], [['Una pregunta', 'Con tabulador\t y "comillas"\nNueva línea'], ['', '']]);
  assert.deepEqual(parseKnowledge(tsv, 'tsv').matrices[0].rows, [['Una pregunta', 'Con tabulador\t y "comillas"\nNueva línea']]);
});

test('Markdown imports retain prose and multiple tables without parsing fenced examples as tables', () => {
  const md = '# Atención\nLa palabra brújula identifica este documento.\n\n## Horarios\n| Pregunta | Respuesta |\n| --- | --- |\n| ¿Cuándo abre? | De 9 a 18, lunes a viernes. |\n| Opciones | Uno \\| dos |\n\n## Libros\n| Nombre | Autor |\n| :--- | ---: |\n| Obra de prueba | Autor de ejemplo |\n\n```md\n| Ejemplo | Ignorar como tabla |\n| --- | --- |\n```';
  const parsed = parseKnowledge(md, 'markdown');
  assert.equal(parsed.format, 'md'); assert.equal(parsed.matrices.length, 2); assert.equal(parsed.rowCount, 3);
  assert.equal(parsed.matrices[0].rows[1][1], 'Uno | dos'); assert.ok(parsed.segments.some(text => text.includes('brújula')));
  const result = retrieve('Cuándo abre', [{ name: 'Atención.md', content: md, type: 'md' }]);
  assert.match(result[0].content, /Pregunta: ¿Cuándo abre/); assert.match(result[0].content, /Respuesta: De 9 a 18/);
});

test('knowledge import rejects broken tables, duplicate headings, binary text and oversized matrices', () => {
  for (const [content, type] of [['Pregunta,Respuesta\na,b,c', 'csv'], ['Tema,Tema\na,b', 'csv'], ['Tema,\na,b', 'csv'], ['Tema,Respuesta\n"sin cerrar,b', 'csv'], ['Tema,Respuesta', 'csv'], ['abc\u0000def', 'md'], ['not JSON', 'json'], ['text', 'exe'], ['A\tB\n' + Array(1001).fill('a\tb').join('\n'), 'tsv'], [Array.from({ length: 33 }, (_, i) => 'C' + i).join(',') + '\n' + Array(33).fill('a').join(','), 'csv']]) assert.throws(() => parseKnowledge(content, type));
  const legacy = retrieve('legacy', [{ name: 'Antigua.csv', content: 'legacy,table\nmalformed', type: 'csv' }]);
  assert.equal(legacy.length, 1);
});

test('knowledge imports preview independently, deduplicate and search only their own assistant without AI usage', async () => {
  const initial = await fixture(), bot = initial.assistants[0], other = initial.assistants[1];
  const first = await server.admin(req('/sources', 'POST', { assistantId: bot.id, name: 'Matriz del autor', type: 'tsv', content: 'Tema\tPregunta\tRespuesta\nBrújula\t¿Quién publica brújula?\tEditorial de prueba del autor.' }), ['sources']);
  assert.equal(first.status, 201); const created = await first.json(); assert.equal(created.rows, 1);
  const retry = await (await server.admin(req('/sources', 'POST', { assistantId: bot.id, name: 'Matriz del autor', type: 'tsv', content: 'Tema\tPregunta\tRespuesta\nBrújula\t¿Quién publica brújula?\tEditorial de prueba del autor.' }), ['sources'])).json();
  assert.equal(retry.id, created.id); assert.equal(retry.reused, true);
  await server.admin(req('/sources', 'POST', { assistantId: other.id, name: 'Vinos internos', type: 'md', content: '# Brújula\nRespuesta exclusiva de la bodega de prueba.' }), ['sources']);
  const response = await (await server.admin(req('/assistants/x/knowledge-search', 'POST', { query: 'brújula' }), ['assistants', bot.id, 'knowledge-search'])).json();
  assert.equal(response.cost, 0); assert.equal(response.generationPerformed, false); assert.match(response.results[0].content, /Pregunta: ¿Quién publica brújula/); assert.doesNotMatch(JSON.stringify(response), /exclusiva de la bodega/);
  const list = await (await server.admin(req('/assistants/x/sources'), ['assistants', bot.id, 'sources'])).json();
  assert.ok(list.sources.some(source => source.id === created.id)); assert.equal(list.sources.some(source => source.name === 'Vinos internos'), false);
  const after = await server.state('owner-a'); assert.deepEqual(after.usage, initial.usage); assert.deepEqual(after.conversations, initial.conversations); assert.deepEqual(after.providers, initial.providers);
  for (const company of after.companies) assert.equal(company.spent, 0);
  globalThis.__nexoTestUser = { userId: 'foreign-owner' };
  await assert.rejects(server.admin(req('/assistants/x/knowledge-search', 'POST', { query: 'brújula' }), ['assistants', bot.id, 'knowledge-search']), error => error.status === 404);
  await assert.rejects(server.admin(req('/assistants/x/sources'), ['assistants', bot.id, 'sources']), error => error.status === 404);
});

test('uploaded Markdown and TSV reach the chat context; malformed files never add a source', async () => {
  const initial = await fixture(), bot = await liveBot(initial);
  async function upload(name, bytes) {
    const form = new FormData(); form.set('assistantId', bot.id); form.set('file', new File([bytes], name));
    return server.admin(new Request('https://platform.example/api/sources', { method: 'POST', headers: { Origin: 'https://platform.example' }, body: form }), ['sources']);
  }
  await upload('contacto.markdown', '# Contacto\nLa clave de consulta es alondra. La atención del ejemplo es por correo.');
  await upload('matriz.tsv', 'Tema\tPregunta\tRespuesta\nAlondra\t¿Cuál es el canal alondra?\tCanal de ejemplo por correo.');
  const beforeInvalid = (await server.state('owner-a')).sources.length;
  for (const [name, bytes] of [['matriz.csv', 'A,B\nx,y,z'], ['file.tsv', Buffer.from([0xff, 0xfe, 0, 1])], ['archivo.exe', 'not allowed']]) await assert.rejects(upload(name, bytes), error => error.status === 400);
  assert.equal((await server.state('owner-a')).sources.length, beforeInvalid);
  let generations = 0;
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith(':countTokens')) return Response.json({ totalTokens: 20 });
    generations++;
    const payload = JSON.parse(options.body), serialized = JSON.stringify(payload);
    assert.match(serialized, /Pregunta: ¿Cuál es el canal alondra/); assert.match(serialized, /Respuesta: Canal de ejemplo por correo/); assert.match(serialized, /contacto.markdown/);
    return Response.json({ candidates: [{ content: { parts: [{ text: 'El canal de ejemplo es el correo.' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 12, totalTokenCount: 32 } });
  };
  const answer = await (await send(bot, { message: '¿Cuál es el canal alondra?' })).json();
  assert.match(answer.answer, /correo/); assert.equal(generations, 1);
});

async function readKnowledgeSource(sourceId) { return (await server.admin(req('/sources/' + sourceId), ['sources', sourceId])).json(); }
async function updateKnowledgeSource(source, patch = {}) { return server.admin(req('/sources/' + source.id, 'PATCH', { assistantId: source.assistant_id, name: source.name, type: source.type, content: source.content, revision: source.revision, ...patch }), ['sources', source.id]); }
async function createKnowledgeSource(bot, name, type, content) {
  const created = await (await server.admin(req('/sources', 'POST', { assistantId: bot.id, name, type, content }), ['sources'])).json();
  return readKnowledgeSource(created.id);
}
async function uploadKnowledgeFile(bot, name, content, source) {
  const form = new FormData(); form.set('assistantId', bot.id); form.set('file', new File([content], name));
  if (source) { form.set('name', source.name); form.set('revision', source.revision); }
  return server.admin(new Request('https://platform.example/api/sources' + (source ? '/' + source.id : ''), { method: source ? 'PATCH' : 'POST', headers: { Origin: 'https://platform.example' }, body: form }), source ? ['sources', source.id] : ['sources']);
}

test('knowledge updates preserve identity, creation date and other companies while replacing retrieval context', async () => {
  const initial = await fixture(), bot = initial.assistants[0], other = initial.assistants[1];
  const source = await createKnowledgeSource(bot, 'Documento editable', 'md', '# Heliotropo\nLa respuesta anterior es AMBAR-VIEJO.');
  assert.match(source.revision, /^[a-f0-9]{64}$/); assert.equal(source.storage_key, undefined);
  const noChange = await (await updateKnowledgeSource(source)).json(); assert.equal(noChange.unchanged, true); assert.equal(noChange.source.revision, source.revision);
  const before = await server.state('owner-a');
  const result = await (await updateKnowledgeSource(source, { name: 'Documento actualizado', content: '# Heliotropo\nLa respuesta actual es AMBAR-NUEVO.' })).json();
  assert.equal(result.source.id, source.id); assert.equal(result.source.created_at, source.created_at); assert.equal(result.source.assistant_id, bot.id); assert.notEqual(result.source.revision, source.revision);
  const search = await (await server.admin(req('/assistants/x/knowledge-search', 'POST', { query: 'heliotropo' }), ['assistants', bot.id, 'knowledge-search'])).json();
  assert.match(JSON.stringify(search), /AMBAR-NUEVO/); assert.doesNotMatch(JSON.stringify(search), /AMBAR-VIEJO/); assert.equal(search.generationPerformed, false);
  const after = await server.state('owner-a'); assert.equal(after.sources.length, before.sources.length); assert.deepEqual(after.sources.filter(item => item.assistant_id === other.id), before.sources.filter(item => item.assistant_id === other.id));
  assert.deepEqual(after.usage, before.usage); assert.deepEqual(after.conversations, before.conversations); assert.deepEqual(after.providers, before.providers); assert.deepEqual(after.companies, before.companies);
});

test('matrix updates keep cell values, reject malformed drafts and cannot overwrite a newer revision', async () => {
  const initial = await fixture(), bot = initial.assistants[0];
  const source = await createKnowledgeSource(bot, 'Matriz', 'csv', 'Tema;Respuesta\nSándalo;Texto anterior.');
  const nextContent = serializeMatrix(['Tema; etiqueta', 'Respuesta'], [['Sándalo', 'Texto con coma, comillas "citadas" y\nsalto de línea.']], 'csv');
  const updated = (await (await updateKnowledgeSource(source, { content: nextContent })).json()).source;
  const matrix = parseKnowledge(updated.content, 'csv').matrices[0];
  assert.deepEqual(matrix.headers, ['Tema; etiqueta', 'Respuesta']); assert.equal(matrix.rows[0][1], 'Texto con coma, comillas "citadas" y\nsalto de línea.');
  await assert.rejects(updateKnowledgeSource(source, { content: 'Tema,Respuesta\nAnterior,No sobrescribir' }), error => error.status === 409);
  await assert.rejects(updateKnowledgeSource(updated, { content: 'Tema,Respuesta\nUna,Otra,Sobra' }), error => error.status === 400);
  await assert.rejects(updateKnowledgeSource(updated, { content: 'not JSON', type: 'json' }), error => error.status === 400);
  assert.deepEqual(await readKnowledgeSource(source.id), updated);
  const tsv = (await (await updateKnowledgeSource(updated, { type: 'tsv', content: serializeMatrix(matrix.headers, matrix.rows) })).json()).source;
  assert.equal(tsv.type, 'tsv'); assert.deepEqual(parseKnowledge(tsv.content, 'tsv').matrices[0].rows, matrix.rows);
});

test('source editing requires ownership, a revision and the original company and assistant', async () => {
  const initial = await fixture(), bot = initial.assistants[0], other = initial.assistants[1];
  const source = await createKnowledgeSource(bot, 'Información privada', 'text', 'Un texto que pertenece a la empresa original.');
  await assert.rejects(updateKnowledgeSource(source, { revision: undefined }), error => error.status === 400);
  await assert.rejects(updateKnowledgeSource(source, { assistantId: other.id }), error => error.status === 400);
  await assert.rejects(updateKnowledgeSource(source, { companyId: other.company_id }), error => error.status === 400);
  await assert.rejects(server.admin(new Request('https://platform.example/api/sources/' + source.id, { method: 'PATCH', headers: { Origin: 'https://foreign.example', 'Content-Type': 'application/json' }, body: JSON.stringify(source) }), ['sources', source.id]), error => error.status === 403);
  globalThis.__nexoTestUser = { userId: 'another-owner' };
  await assert.rejects(readKnowledgeSource(source.id), error => error.status === 404);
  await assert.rejects(updateKnowledgeSource(source, { content: 'No autorizado' }), error => error.status === 404);
  globalThis.__nexoTestUser = null;
  await assert.rejects(updateKnowledgeSource(source), error => error.status === 401);
  globalThis.__nexoTestUser = { userId: 'owner-a' };
  assert.deepEqual(await readKnowledgeSource(source.id), source);
});

test('updating a source works at the source limit and rejects duplicates without merging records', async () => {
  const initial = await fixture(), bot = initial.assistants[0];
  const source = await createKnowledgeSource(bot, 'Primera', 'text', 'Contenido uno.');
  await createKnowledgeSource(bot, 'Segunda', 'text', 'Contenido dos.');
  await assert.rejects(updateKnowledgeSource(source, { name: 'Segunda', content: 'Contenido dos.' }), error => error.status === 409);
  let count = sql.prepare('SELECT COUNT(*) AS n FROM sources WHERE assistant_id=?').get(bot.id).n;
  while (count++ < 50) sql.prepare('INSERT INTO sources (id,company_id,assistant_id,name,type,content,bytes,created_at) VALUES (?,?,?,?,?,?,?,?)').run(crypto.randomUUID(), bot.company_id, bot.id, 'Relleno ' + count, 'text', 'Dato de prueba.', 15, new Date().toISOString());
  const result = await (await updateKnowledgeSource(source, { content: 'Contenido editado sin duplicar.' })).json();
  assert.equal(result.source.id, source.id); assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM sources WHERE assistant_id=?').get(bot.id).n, 50);
});

test('file replacement and text edits update the stored copy and clean the old file only after saving', async () => {
  const initial = await fixture(), bot = initial.assistants[0], objects = new Map();
  globalThis.__nexoTestEnv.BUCKET = { async put(key, body) { objects.set(key, Buffer.from(await new Response(body).arrayBuffer())); }, async get(key) { return objects.has(key) ? { body: objects.get(key) } : null; }, async delete(key) { objects.delete(key); } };
  const created = await (await uploadKnowledgeFile(bot, 'manual.md', '# Manual\nContenido original.')).json(), source = await readKnowledgeSource(created.id);
  const firstKey = sql.prepare('SELECT storage_key FROM sources WHERE id=?').get(source.id).storage_key;
  const replacement = await (await uploadKnowledgeFile(bot, 'nueva-matriz.tsv', 'Tema\tRespuesta\nÁmbar\tRespuesta nueva.', source)).json();
  assert.equal(replacement.source.id, source.id); assert.equal(replacement.source.type, 'tsv'); assert.equal(replacement.source.name, 'manual.md'); assert.equal(replacement.source.created_at, source.created_at);
  const nextKey = sql.prepare('SELECT storage_key FROM sources WHERE id=?').get(source.id).storage_key;
  assert.notEqual(nextKey, firstKey); assert.equal(objects.has(firstKey), false); assert.equal(objects.size, 1); assert.match(objects.get(nextKey).toString(), /Respuesta nueva/);
  const edited = await (await updateKnowledgeSource(replacement.source, { content: 'Tema\tRespuesta\nÁmbar\tRespuesta revisada.' })).json();
  const finalKey = sql.prepare('SELECT storage_key FROM sources WHERE id=?').get(source.id).storage_key;
  assert.equal(objects.has(nextKey), false); assert.equal(objects.size, 1); assert.match(objects.get(finalKey).toString(), /Respuesta revisada/);
  await assert.rejects(uploadKnowledgeFile(bot, 'rota.csv', 'A,B\nx,y,z', edited.source), error => error.status === 400);
  assert.equal(objects.size, 1); assert.deepEqual(await readKnowledgeSource(source.id), edited.source);
});

test('a failed or raced source update retains the original metadata and file and removes staged copies', async () => {
  const initial = await fixture(), bot = initial.assistants[0], objects = new Map(); let failWrite = false;
  globalThis.__nexoTestEnv.BUCKET = { async put(key, body) { objects.set(key, Buffer.from(await new Response(body).arrayBuffer())); if (failWrite) throw new Error('bucket-write-failed'); }, async delete(key) { objects.delete(key); } };
  const created = await (await uploadKnowledgeFile(bot, 'manual.md', '# Original\nEl archivo debe conservarse.')).json(), source = await readKnowledgeSource(created.id);
  const originalKey = sql.prepare('SELECT storage_key FROM sources WHERE id=?').get(source.id).storage_key;
  sql.exec('CREATE TRIGGER skip_source_update BEFORE UPDATE ON sources BEGIN SELECT RAISE(IGNORE); END;');
  await assert.rejects(updateKnowledgeSource(source, { content: '# Nuevo\nEste contenido no debe guardarse.' }), error => error.status === 409);
  assert.equal(objects.size, 1); assert.equal(objects.has(originalKey), true); assert.deepEqual(await readKnowledgeSource(source.id), source);
  sql.exec('DROP TRIGGER skip_source_update;'); failWrite = true;
  await assert.rejects(updateKnowledgeSource(source, { content: '# Fallo de archivo\nNo guardar.' }), /bucket-write-failed/);
  assert.equal(objects.size, 1); assert.equal(objects.has(originalKey), true); assert.deepEqual(await readKnowledgeSource(source.id), source);
});

test('launcher shapes persist without changing the avatar, window or other company', async () => {
  const initial = await fixture(), bot = initial.assistants[0], other = initial.assistants[1];
  assert.equal(bot.theme.launcherShape, 'circle'); assert.equal(bot.theme.launcherBorderWidth, 0);
  for (const [shape, style] of [['circle', 'solid'], ['square', 'dashed'], ['rounded', 'dotted'], ['rounded', 'none']]) {
    await server.admin(req('/assistants/x', 'PATCH', { theme: { ...bot.theme, launcherShape: shape, launcherRadius: 18, launcherBorderWidth: 4, launcherBorderStyle: style, launcherBorderColor: '#123456' } }), ['assistants', bot.id]);
    const state = await server.state('owner-a'), saved = state.assistants.find(item => item.id === bot.id).theme;
    assert.equal(saved.launcherShape, shape); assert.equal(saved.launcherBorderStyle, style); assert.equal(saved.launcherBorderWidth, 4); assert.equal(saved.launcherBorderColor, '#123456');
    assert.equal(saved.avatarShape, bot.theme.avatarShape); assert.equal(saved.radius, bot.theme.radius); assert.deepEqual(state.assistants.find(item => item.id === other.id).theme, other.theme);
  }
});

test('avatar upload preserves pixels and transparency, stays in draft and reuses the company library', async () => {
  const s = await fixture(), bot = s.assistants[0], objects = imageBucket(), png = avatarPng();
  const originalTheme = (await server.publicBot(bot.id, req('/widget'))).theme;
  const upload = await uploadAvatar(bot, png); assert.equal(upload.status, 201);
  const data = await upload.json(); assert.equal(data.image.width, 2); assert.equal(data.image.height, 1); assert.equal(data.image.mime, 'image/png'); assert.equal(objects.size, 1);
  const response = await server.imageAsset(req('/assets'), data.image.id); assert.equal(response.headers.get('Content-Type'), 'image/png'); assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  assert.deepEqual((await server.publicBot(bot.id, req('/widget'))).theme, originalTheme);
  const retry = await (await uploadAvatar(bot, png)).json(); assert.equal(retry.image.id, data.image.id); assert.equal(retry.reused, true); assert.equal(objects.size, 1);
  const library = await (await server.admin(req('/assistants/x/avatar'), ['assistants', bot.id, 'avatar'])).json(); assert.equal(library.images.length, 1); assert.equal(library.images[0].storage_key, undefined);
  await server.admin(req('/assistants/x', 'PATCH', { theme: { ...originalTheme, avatarUrl: data.image.url } }), ['assistants', bot.id]);
  assert.equal((await server.publicBot(bot.id, req('/widget'))).theme.avatarUrl, data.image.url);
  assert.equal((await server.state('owner-a')).usage.length, 0);
});

test('company image ownership and publication govern both linking and image reads', async () => {
  const s = await fixture(), bot = s.assistants[0], other = s.assistants[1]; imageBucket();
  const data = await (await uploadAvatar(bot)).json();
  await assert.rejects(server.admin(req('/assistants/x', 'PATCH', { theme: { avatarUrl: data.image.url } }), ['assistants', other.id]), e => e.status === 400);
  globalThis.__nexoTestUser = { userId: 'owner-b' };
  await assert.rejects(uploadAvatar(bot), e => e.status === 404);
  await assert.rejects(server.admin(req('/assistants/x/avatar'), ['assistants', bot.id, 'avatar']), e => e.status === 404);
  await assert.rejects(server.imageAsset(req('/assets'), data.image.id), e => e.status === 404);
  globalThis.__nexoTestUser = null;
  await assert.rejects(uploadAvatar(bot), e => e.status === 401);
  await assert.rejects(server.imageAsset(req('/assets'), data.image.id), e => e.status === 404);
  sql.prepare('UPDATE assistants SET published=1 WHERE id=?').run(bot.id);
  await assert.rejects(server.imageAsset(req('/assets'), data.image.id), e => e.status === 404);
  sql.prepare('UPDATE assistants SET theme=? WHERE id=?').run(JSON.stringify({ avatarUrl: data.image.url }), bot.id);
  assert.equal((await server.imageAsset(req('/assets'), data.image.id)).status, 200);
  sql.prepare('UPDATE assistants SET published=0 WHERE id=?').run(bot.id);
  await assert.rejects(server.imageAsset(req('/assets'), data.image.id), e => e.status === 404);
});

test('launcher logos stay company scoped, save independently and only expose active published links', async () => {
  const s = await fixture(), bot = s.assistants[0], other = s.assistants[1]; imageBucket();
  const uploaded = await (await uploadAvatar(bot)).json(), initial = (await server.publicBot(bot.id, req('/widget'))).theme;
  assert.equal(initial.launcherSize, 58); assert.equal(initial.launcherColor, bot.color); assert.equal(initial.launcherVertical, 'bottom');
  await assert.rejects(server.admin(req('/assistants/x', 'PATCH', { theme: { launcherLogoUrl: uploaded.image.url } }), ['assistants', other.id]), e => e.status === 400);
  const theme = { ...initial, launcherLogoMode: 'custom', launcherLogoUrl: uploaded.image.url, launcherSize: 76, launcherColor: '#70334c', launcherTextColor: '#fff5dd', launcherVertical: 'top', position: 'left', launcherOffsetX: 30, launcherOffsetY: 42 };
  await server.admin(req('/assistants/x', 'PATCH', { theme }), ['assistants', bot.id]);
  const saved = await server.state('owner-a');
  assert.deepEqual(saved.assistants.find(item => item.id === other.id).theme, other.theme);
  assert.equal(saved.assistants.find(item => item.id === bot.id).theme.avatarUrl, initial.avatarUrl);
  assert.deepEqual((await server.publicBot(bot.id, req('/widget'))).theme, theme);
  assert.equal(saved.usage.length, 0);
  assert.equal((await server.imageAsset(req('/assets'), uploaded.image.id)).headers.get('Cross-Origin-Resource-Policy'), 'same-origin');
  globalThis.__nexoTestUser = null;
  await assert.rejects(server.imageAsset(req('/assets'), uploaded.image.id), e => e.status === 404);
  sql.prepare('UPDATE assistants SET published=1 WHERE id=?').run(bot.id);
  const publicImage = await server.imageAsset(req('/assets'), uploaded.image.id);
  assert.equal(publicImage.status, 200); assert.equal(publicImage.headers.get('Cross-Origin-Resource-Policy'), 'cross-origin');
  assert.deepEqual(Buffer.from(await publicImage.arrayBuffer()), avatarPng());
  sql.prepare('UPDATE companies SET status=? WHERE id=?').run('paused', bot.company_id);
  await assert.rejects(server.imageAsset(req('/assets'), uploaded.image.id), e => e.status === 404);
  sql.prepare('UPDATE companies SET status=? WHERE id=?').run('active', bot.company_id);
  sql.prepare('UPDATE assistants SET theme=? WHERE id=?').run(JSON.stringify({ ...theme, launcherLogoMode: 'icon' }), bot.id);
  await assert.rejects(server.imageAsset(req('/assets'), uploaded.image.id), e => e.status === 404);
  sql.prepare('UPDATE assistants SET published=0,theme=? WHERE id=?').run(JSON.stringify(theme), bot.id);
  await assert.rejects(server.imageAsset(req('/assets'), uploaded.image.id), e => e.status === 404);
});

test('PNG validation rejects corrupted files, forged types, oversized dimensions and decompression overflow', async () => {
  const s = await fixture(), bot = s.assistants[0], objects = imageBucket();
  const broken = Buffer.from(avatarPng()); broken[42] ^= 1;
  for (const bytes of [Buffer.from('<svg onload="alert(1)"></svg>'), broken, Buffer.concat([avatarPng(), Buffer.from('extra')]), avatarPng(513,1), avatarPng(1,1,[0,0,0,0],deflateSync(Buffer.alloc(100000))), avatarPng(1,1,[0,0,0,0],Buffer.from('not-deflate'))]) {
    await assert.rejects(uploadAvatar(bot, bytes), e => e.status === 400);
  }
  await assert.rejects(uploadAvatar(bot, avatarPng(), { mime: 'image/svg+xml' }), e => e.status === 415);
  await assert.rejects(uploadAvatar(bot, Buffer.alloc(2_200_000)), e => e.status === 413);
  await assert.rejects(uploadAvatar(bot, avatarPng(), { origin: 'https://foreign.example' }), e => e.status === 403);
  assert.equal(objects.size, 0); assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM image_assets').get().n, 0);
  assert.deepEqual(await validateAvatarPng(avatarPng()), { width: 2, height: 1, mime: 'image/png' });
});

test('image persistence failures clean storage and company library limits do not leave orphans', async () => {
  const s = await fixture(), bot = s.assistants[0], objects = imageBucket();
  sql.exec("CREATE TRIGGER image_insert_failure BEFORE INSERT ON image_assets BEGIN SELECT RAISE(ABORT, 'disk failure'); END");
  await assert.rejects(uploadAvatar(bot)); assert.equal(objects.size, 0);
  sql.exec('DROP TRIGGER image_insert_failure');
  for (let i = 0; i < 50; i++) sql.prepare('INSERT INTO image_assets (id,company_id,name,mime,bytes,width,height,sha256,storage_key,created_at) VALUES (?,?,?, ?,1,1,1,?,?,?)').run('image-'+i,bot.company_id,'Logo','image/png','hash-'+i,'key-'+i,new Date().toISOString());
  await assert.rejects(uploadAvatar(bot), e => e.status === 400); assert.equal(objects.size, 0);
});
test('logo fitting preserves the full image, square cropping fills the canvas and zoom adds transparent margins', () => {
  const initial = defaultAvatarCrop();
  assert.deepEqual(avatarDrawRect(1000, 500, initial), { left: 0, top: 128, width: 512, height: 256 });
  assert.deepEqual(avatarDrawRect(1000, 500, { ...initial, mode: 'cover' }), { left: -256, top: 0, width: 1024, height: 512 });
  assert.deepEqual(avatarDrawRect(500, 1000, { ...initial, mode: 'cover' }), { left: 0, top: -256, width: 512, height: 1024 });
  assert.deepEqual(avatarDrawRect(1000, 500, { ...initial, zoom: 50 }), { left: 128, top: 192, width: 256, height: 128 });
  const moved = avatarDrawRect(1000, 500, { ...initial, mode: 'cover', x: 25, y: -10 });
  assert.equal(moved.left, -128); assert.equal(moved.top, -51.2);
});

test('crop panning keeps a visible part in frame and rejects non-finite image geometry', () => {
  for (const x of [-10000, 10000]) for (const y of [-10000, 10000]) {
    const r = avatarDrawRect(1000, 100, { mode: 'contain', zoom: 25, x, y });
    assert.ok(r.left < 512 && r.left + r.width > 0); assert.ok(r.top < 512 && r.top + r.height > 0);
  }
  for (const crop of [{ ...defaultAvatarCrop(), x: NaN }, { ...defaultAvatarCrop(), zoom: Infinity }, { ...defaultAvatarCrop(), mode: 'invalid' }]) assert.throws(() => avatarDrawRect(512, 512, crop), /encuadre/);
  assert.throws(() => avatarDrawRect(0, 512, defaultAvatarCrop()), /encuadre/);
});
test('avatar shapes and borders preserve legacy styling, company isolation and original image bytes', async () => {
  const s = await fixture(), bot = s.assistants[0], other = s.assistants[1]; imageBucket();
  // Existing saved themes do not need a database migration to gain avatar-specific controls.
  sql.prepare('UPDATE assistants SET theme=? WHERE id=?').run(JSON.stringify({ radius: 6, border: '#223344' }), bot.id);
  const initial = (await server.publicBot(bot.id, req('/widget'))).theme;
  assert.equal(initial.avatarShape, 'rounded'); assert.equal(initial.avatarRadius, 6); assert.equal(initial.avatarBorderColor, '#223344');
  const png = avatarPng(), uploaded = await (await uploadAvatar(bot, png)).json();
  for (const [shape, style, width] of [['circle', 'solid', 3], ['square', 'dashed', 4], ['rounded', 'dotted', 2], ['rounded', 'none', 0]]) {
    await server.admin(req('/assistants/x', 'PATCH', { theme: { ...initial, avatarUrl: uploaded.image.url, avatarShape: shape, avatarRadius: 14, avatarBorderStyle: style, avatarBorderWidth: width, avatarBorderColor: '#a78bfa' } }), ['assistants', bot.id]);
    const theme = (await server.publicBot(bot.id, req('/widget'))).theme;
    assert.equal(theme.avatarShape, shape); assert.equal(theme.avatarRadius, 14); assert.equal(theme.avatarBorderStyle, style); assert.equal(theme.avatarBorderWidth, width); assert.equal(theme.avatarBorderColor, '#a78bfa'); assert.equal(theme.radius, 6);
    assert.deepEqual((await server.state('owner-a')).assistants.find(x => x.id === other.id).theme, other.theme);
    const bytes = Buffer.from(await (await server.imageAsset(req('/assets'), uploaded.image.id)).arrayBuffer()); assert.deepEqual(bytes, png);
  }
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM image_assets').get().n, 1);
});
process.on('exit', () => { globalThis.fetch = realFetch; sql?.close(); });
