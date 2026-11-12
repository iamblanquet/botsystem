import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { createClient } from '@libsql/client';
import { build } from 'esbuild';
import { createDatabaseAdapter } from '../lib/database-adapter.mjs';
import { migrate } from '../scripts/migrate-vercel.mjs';
import { hashPassword, verifyPassword, createSession, sessionUser, safeReturnPath, SESSION_SECONDS } from '../lib/admin-security.mjs';
import { requestOrigin, clientAddress } from '../lib/request-origin.ts';

test('Node request origins retain the public host and protocol behind a serving proxy', () => {
  assert.equal(requestOrigin(new Request('http://localhost:5174/api', { headers: { Host: '127.0.0.1:5174' } })), 'http://127.0.0.1:5174');
  assert.equal(requestOrigin(new Request('http://localhost:3000/api', { headers: { Host: 'bots.example.com', 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'evil.example' } })), 'https://bots.example.com');
  assert.equal(requestOrigin(new Request('https://bots.example.com/api')), 'https://bots.example.com');
  const request = new Request('https://bots.example.com/api', { headers: { 'x-vercel-forwarded-for': '198.51.100.2', 'cf-connecting-ip': '203.0.113.8' } });
  assert.equal(clientAddress(request, true), '198.51.100.2');
  assert.equal(clientAddress(request, false), '203.0.113.8');
});

async function fixture(fn) {
  const client = createClient({ url: 'file::memory:' });
  try { await fn(client, createDatabaseAdapter(client)); }
  finally { client.close(); }
}

test('Vercel migrations are repeatable and preserve existing company records', () => fixture(async (client, db) => {
  assert.equal((await migrate(client)).length, 4);
  await db.prepare("INSERT INTO companies (id, owner, name, website, created_at) VALUES (?, ?, ?, ?, ?)").bind('c', 'admin', 'Empresa', 'https://example.com', '2026-01-01').run();
  assert.deepEqual(await migrate(client), []);
  assert.equal((await db.prepare('SELECT name FROM companies WHERE id = ?').bind('c').first()).name, 'Empresa');
  assert.equal((await db.prepare('SELECT * FROM nexo_migrations').all()).results.length, 4);
}));

test('libSQL batches roll back all statements on failure and report CAS changes', () => fixture(async (client, db) => {
  await client.execute('CREATE TABLE ledger (id TEXT PRIMARY KEY, reserved INTEGER NOT NULL CHECK(reserved >= 0))');
  await db.prepare('INSERT INTO ledger VALUES (?, ?)').bind('c', 0).run();
  await assert.rejects(db.batch([
    db.prepare('UPDATE ledger SET reserved = reserved + 10 WHERE id = ?').bind('c'),
    db.prepare('INSERT INTO ledger VALUES (?, ?)').bind('c', 5),
  ]));
  assert.equal((await db.prepare('SELECT reserved FROM ledger').first()).reserved, 0);
  const result = await db.batch([
    db.prepare('UPDATE ledger SET reserved = reserved + 10 WHERE id = ? AND reserved = ?').bind('c', 0),
    db.prepare('UPDATE ledger SET reserved = 5 WHERE id = ? AND reserved = ?').bind('c', 0),
  ]);
  assert.deepEqual(result.map(r => r.meta.changes), [1, 0]);
  assert.equal((await db.prepare('SELECT reserved FROM ledger').first()).reserved, 10);
}));

test('admin passwords are salted and sessions reject tampering, expiry and changed identity', async () => {
  const password = 'a-test-password-123!';
  const hash = await hashPassword(password);
  assert.notEqual(await hashPassword(password), hash);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword('incorrect', hash), false);
  assert.equal(await verifyPassword(password, 'invalid-hash'), false);
  const config = { userId: 'admin', email: 'test@example.com', secret: 'test-secret-at-least-32-characters-long' };
  const now = Date.now(), token = createSession(config, now);
  assert.equal(sessionUser(token, config, now).userId, 'admin');
  assert.equal(sessionUser(token + 'x', config, now), null);
  assert.equal(sessionUser(token, config, now + SESSION_SECONDS * 1000), null);
  assert.equal(sessionUser(token, { ...config, secret: 'another-secret' }, now), null);
  assert.equal(sessionUser(token, { ...config, userId: 'other-owner' }, now), null);
  assert.equal(sessionUser(undefined, config, now), null);
  for (const url of ['https://evil.example', '//evil.example', '/\\evil.example', '/login', '/signout-with-chatgpt']) assert.equal(safeReturnPath(url), '/');
  assert.equal(safeReturnPath('/demos?test=1'), '/demos?test=1');
});

test('admin login signs a private cookie, limits attempts and preserves pilot initialization locks', () => fixture(async (client, db) => {
  await migrate(client);
  await db.prepare('INSERT INTO rate_limits (id, count, expires) VALUES (?, 1, 0)').bind('seed:admin').run();
  const saved = Object.fromEntries(['ADMIN_EMAIL', 'ADMIN_PASSWORD_HASH', 'AUTH_SESSION_SECRET', 'ADMIN_USER_ID'].map(key => [key, process.env[key]]));
  const password = 'fake-password-for-tests-only';
  const config = { email: 'admin@example.invalid', userId: 'admin', secret: 'test-session-secret-with-at-least-32-characters' };
  Object.assign(process.env, { ADMIN_EMAIL: config.email, ADMIN_PASSWORD_HASH: await hashPassword(password), AUTH_SESSION_SECRET: config.secret, ADMIN_USER_ID: config.userId });
  globalThis.__nexoAuthEnv = { DB: db };
  try {
    const compiled = await build({ entryPoints: ['app/api/auth/login/route.ts'], bundle: true, platform: 'node', format: 'esm', write: false, plugins: [{ name: 'login-fixture', setup(b) {
      b.onResolve({ filter: /^@\/lib\/runtime-node$/ }, () => ({ path: 'runtime', namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const env = globalThis.__nexoAuthEnv;' }));
      b.onResolve({ filter: /^next\/server$/ }, () => ({ path: 'next/server.js', external: true }));
    } }] });
    await mkdir('.sites-runtime', { recursive: true });
    await writeFile('.sites-runtime/test-login.mjs', compiled.outputFiles[0].text);
    const { POST } = await import('../.sites-runtime/test-login.mjs');
    const request = (origin, value = password) => new Request('http://localhost:3000/api/auth/login', { method: 'POST', headers: { Host: 'platform.example', 'X-Forwarded-Proto': 'https', Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: config.email, password: value }) });
    assert.equal((await POST(request('https://evil.example'))).status, 403);
    const success = await POST(request('https://platform.example'));
    assert.equal(success.status, 200);
    const cookie = success.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=lax/);
    const token = cookie.split(';')[0].slice(cookie.indexOf('=') + 1);
    assert.equal(sessionUser(token, config).userId, 'admin');
    for (let i = 1; i < 20; i++) assert.equal((await POST(request('https://platform.example', 'wrong'))).status, 401);
    assert.equal((await POST(request('https://platform.example'))).status, 429);
    assert.equal((await db.prepare('SELECT count FROM rate_limits WHERE id = ?').bind('seed:admin').first()).count, 1);
  } finally {
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
}));

test('platform pilots, knowledge isolation and chat work through the production SQL adapter', { timeout: 30_000 }, () => fixture(async (client, db) => {
  await migrate(client);
  const compiled = await build({ entryPoints: ['lib/server.ts'], bundle: true, platform: 'node', format: 'esm', write: false, plugins: [{ name: 'deployment-fixture', setup(b) {
    b.onResolve({ filter: /^(@\/lib\/runtime|@\/app\/chatgpt-auth)$/ }, a => ({ path: a.path, namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: a.path === '@/lib/runtime' ? 'export const env = globalThis.__nexoDeploymentEnv;' : 'export async function getChatGPTUser() { return globalThis.__nexoDeploymentUser; }' }));
  } }] });
  await mkdir('.sites-runtime', { recursive: true });
  await writeFile('.sites-runtime/deployment-server.mjs', compiled.outputFiles[0].text);
  globalThis.__nexoDeploymentEnv = { DB: db, ENCRYPTION_KEY: 'test-encryption-key-only-for-adapter-tests' };
  globalThis.__nexoDeploymentUser = { userId: 'admin', email: 'test@example.com', displayName: 'Admin' };
  const server = await import('../.sites-runtime/deployment-server.mjs');
  const request = (route, data, method = 'POST') => new Request('https://platform.example/api' + route, { method, headers: { Origin: 'https://platform.example', 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  await server.admin(request('/pilots', {}), ['pilots']);
  await server.admin(request('/playbooks/initialize', {}), ['playbooks', 'initialize']);
  const state = await server.state('admin');
  assert.equal(state.companies.length, 2);
  assert.equal((await server.state('another-owner')).companies.length, 0);
  const bot = state.assistants.find(a => a.name === 'Asistente de Manuel');
  const response = await (await server.chat(request('/chat', { assistantId: bot.id, message: 'Recomiéndame un libro de Manuel', requestKey: crypto.randomUUID() }))).json();
  assert.equal(response.cost, 0);
  assert.match(response.answer, /Manuel/);
  const after = await server.state('admin');
  assert.equal(after.conversations.length, 1);
  assert.equal(after.usage[0].mode, 'demo');
  assert.equal(after.companies.reduce((n, company) => n + company.spent, 0), 0);
  await server.admin(request('/providers/' + bot.company_id, { apiKey: 'only-a-fake-test-key', inputPrice: 1, outputPrice: 2 }, 'PUT'), ['providers', bot.company_id]);
  await server.admin(request('/assistants/' + bot.id, { mode: 'live' }, 'PATCH'), ['assistants', bot.id]);
  await server.admin(request('/companies/' + bot.company_id, { budget: .01 }, 'PATCH'), ['companies', bot.company_id]);
  const realFetch = globalThis.fetch;
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const barrier = new Promise(resolve => { release = resolve; });
  globalThis.fetch = async url => {
    if (String(url).endsWith(':countTokens')) return Response.json({ totalTokens: 100 });
    entered(); await barrier;
    return Response.json({ candidates: [{ content: { parts: [{ text: 'Respuesta de prueba.' }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 } });
  };
  try {
    const send = () => server.chat(request('/chat', { assistantId: bot.id, message: 'Recomiéndame un libro', requestKey: crypto.randomUUID() }));
    const first = send();
    await Promise.race([started, first.then(() => { throw new Error('The test provider was never called.'); })]);
    await assert.rejects(send(), error => error.status === 402);
    release();
    await first;
    const company = (await server.state('admin')).companies.find(c => c.id === bot.company_id);
    assert.equal(company.reserved, 0);
    assert.ok(company.spent > 0 && company.spent < company.budget);
  } finally { release?.(); globalThis.fetch = realFetch; }
  globalThis.__nexoDeploymentUser = null;
  await assert.rejects(server.admin(new Request('https://platform.example/api'), []), error => error.status === 401);
}));
