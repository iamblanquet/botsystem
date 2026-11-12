import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const base = 'http://127.0.0.1:5173';
const login = await fetch(base + '/signin-with-chatgpt?return_to=/', { redirect: 'manual' });
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!cookie) throw new Error('No se pudo abrir la sesión local de prueba.');
async function api(path, data) {
  const r = await fetch(base + '/api' + path, { method: data ? 'POST' : 'GET', headers: { Cookie: cookie, Origin: base, ...(data ? { 'Content-Type': 'application/json' } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
  const result = await r.json(); if (!r.ok) throw new Error(result.error); return result;
}
await api('/playbooks/initialize', {});
const before = await api(''), report = [];
for (const pilot of ['mmartinez1122.com', 'winetalia.vercel.app']) {
  const company = before.companies.find(c => c.website.includes(pilot));
  const bot = before.assistants.find(a => a.company_id === company?.id);
  assert.ok(bot, 'Falta el piloto ' + pilot);
  const publicBot = await api('/widget/' + bot.id), f = publicBot.flows[0]; assert.ok(f, 'Falta el recorrido piloto.');
  let reply = await api('/flow', { assistantId: bot.id, flowId: f.id, action: 'start', requestKey: crypto.randomUUID() });
  const answers = [];
  while (reply.flow.status === 'active') {
    const s = reply.flow.step;
    const value = s.type === 'choice' ? s.options[0].id : s.type === 'number' ? '500' : 'Explorar opciones';
    answers.push({ question: s.question, value: s.options.find(o => o.id === value)?.label || value });
    reply = await api('/flow', { assistantId: bot.id, conversationId: reply.conversationId, action: 'answer', revision: reply.flow.revision, stepId: s.id, value, requestKey: crypto.randomUUID() });
    assert.equal(reply.cost, 0);
  }
  assert.equal(reply.flow.status, 'completed'); assert.ok(reply.recommendations.length);
  if (pilot.includes('winetalia')) assert.ok(reply.products.every(p => p.price !== null && p.price <= 500));
  report.push({ company: company.name, flow: f.name, conversationId: reply.conversationId, answers, recommendations: reply.recommendations.map(x => ({ name: x.name, price: x.price })), cost: reply.cost });
}
const after = await api('');
for (const c of before.companies) {
  const current = after.companies.find(x => x.id === c.id);
  assert.equal(current.spent, c.spent); assert.equal(current.reserved, c.reserved);
}
assert.equal(after.usage.length, before.usage.length);
assert.deepEqual(after.assistants.map(a => [a.id, a.published, a.mode]), before.assistants.map(a => [a.id, a.published, a.mode]));
await mkdir('outputs', { recursive: true });
await writeFile('outputs/local-flows-test.json', JSON.stringify({ testedAt: new Date().toISOString(), localOnly: true, aiCalls: 0, report }, null, 2));
console.log(JSON.stringify({ ok: true, localOnly: true, aiCalls: 0, pilots: report.map(x => ({ company: x.company, recommendations: x.recommendations.length, cost: x.cost })) }, null, 2));
