// End-to-end checks against localhost. Two live Gemini generations use the existing keys/budgets.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const base = 'http://127.0.0.1:5173';
const login = await fetch(base + '/signin-with-chatgpt?return_to=/', { redirect: 'manual' });
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!cookie) throw new Error('No se pudo abrir la sesión local.');
async function api(path, method = 'GET', data) {
  const r = await fetch(base + '/api' + path, { method, headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(115000) });
  const result = await r.json(); if (!r.ok) throw new Error(result.error); return result;
}
const before = await api(''), report = { testedAt: new Date().toISOString(), localOnly: true, guided: [], live: [], totals: null };
await mkdir('outputs', { recursive: true });
const persist = () => writeFile('outputs/pilot-recommendations-test.json', JSON.stringify(report, null, 2));
const botFor = host => {
  const company = before.companies.find(c => new URL(c.website).hostname === host);
  const bot = before.assistants.find(a => a.company_id === company?.id);
  assert.ok(bot, 'Falta el piloto ' + host); return { company, bot };
};
const author = botFor('www.mmartinez1122.com'), wine = botFor('winetalia.vercel.app');
const authorConfig = await api('/assistants/' + author.bot.id + '/playbook');
const wineConfig = await api('/assistants/' + wine.bot.id + '/playbook');
const publicData = JSON.parse(await readFile(new URL('../lib/data/manuel-books.json', import.meta.url), 'utf8'));
for (const b of publicData.books) {
  const stored = authorConfig.config.items.find(x => x.url === b.sourceUrl);
  assert.ok(stored?.description && stored?.tags.length, 'Falta completar ' + b.name);
}
async function guided(pilot, config, choices, check) {
  const f = config.config.flows.find(x => x.enabled);
  let r = await api('/flow', 'POST', { action: 'start', assistantId: pilot.bot.id, flowId: f.id, requestKey: crypto.randomUUID() });
  const answers = [];
  while (r.flow.status === 'active') {
    const s = r.flow.step, label = choices[s.id];
    const value = s.type === 'choice' ? s.options.find(o => o.label === label)?.id || s.options[0].id : String(label);
    answers.push({ question: s.question, answer: label || s.options[0].label });
    r = await api('/flow', 'POST', { action: 'answer', assistantId: pilot.bot.id, conversationId: r.conversationId, revision: r.flow.revision, stepId: s.id, value, requestKey: crypto.randomUUID() });
    assert.equal(r.cost, 0);
  }
  check(r);
  report.guided.push({ company: pilot.company.name, conversationId: r.conversationId, answers, recommendations: r.recommendations.map(x => ({ id: x.id, name: x.name, price: x.price, url: x.url })), cost: r.cost, success: true });
  await persist(); return r;
}
await guided(author, authorConfig, { interes: 'Teatro' }, r => {
  assert.deepEqual(new Set(r.recommendations.map(x => x.name)), new Set(['La comedia maldita', 'Nostradamus: Amor, poder, redención']));
});
const graphic = await guided(author, authorConfig, { interes: 'Novela gráfica' }, r => {
  assert.deepEqual(new Set(r.recommendations.map(x => x.name)), new Set(['Recuerdos de una vida pasada · Parte II', 'La Guerra de los Dioses · Parte III']));
});
await guided(author, authorConfig, { interes: 'Suspenso existencial' }, r => assert.deepEqual(r.recommendations.map(x => x.name), ['Fila 47']));
await guided(wine, wineConfig, { ocasion: 'Cena con amigos', presupuesto: '500', estilo: 'Tinto' }, r => {
  assert.ok(r.recommendations.length); assert.ok(r.products.every(p => p.price <= 500));
});
const sparkling = await guided(wine, wineConfig, { ocasion: 'Una celebración', presupuesto: '500', estilo: 'Espumoso' }, r => {
  assert.ok(r.recommendations.length); assert.ok(r.recommendations.every(x => x.matchedTags.includes('espumoso') || x.matchedTags.includes('sparkling')));
  assert.ok(r.products.every(p => p.price <= 500));
});
await guided(wine, wineConfig, { ocasion: 'Una celebración', presupuesto: '1', estilo: 'Espumoso' }, r => assert.equal(r.recommendations.length, 0));
const afterGuided = await api('');
for (const c of before.companies) {
  const current = afterGuided.companies.find(x => x.id === c.id);
  assert.equal(current.spent, c.spent); assert.equal(current.reserved, c.reserved);
}
console.log('Seis recorridos verificados en local: teatro, novela gráfica, suspenso y tres casos de vinos. Consumo de IA: 0.');
for (const [pilot, conversationId, prompt, check] of [
  [author, graphic.conversationId, 'De las novelas gráficas que acabas de recomendarme, ¿cuáles son las partes II y III y qué debo comprobar sobre el idioma antes de comprar? Usa las reseñas públicas, no inventes precios y comparte sus enlaces.', r => {
    assert.match(r.answer, /Recuerdos de una vida pasada/i); assert.match(r.answer, /Guerra de los Dioses/i); assert.match(r.answer, /ingl[eé]s/i);
    assert.match(r.answer, /mmartinez1122\.com/);
  }],
  [wine, sparkling.conversationId, 'De la selección para mi celebración, recomienda solo un vino espumoso de hasta 500 MXN por botella. Dame su nombre y precio del catálogo. Recuerda que el negocio debe confirmar disponibilidad.', r => {
    assert.equal(r.products.length, 1); assert.ok(r.products[0].price <= 500);
    assert.ok(sparkling.products.some(p => p.id === r.products[0].id));
  }],
]) {
  const entry = { company: pilot.company.name, prompt, success: false };
  try {
    assert.equal(pilot.bot.mode, 'live', 'La prueba no cambia el modo del asistente.');
    const r = await api('/chat', 'POST', { assistantId: pilot.bot.id, conversationId, message: prompt, requestKey: crypto.randomUUID() });
    Object.assign(entry, r); assert.equal(r.mode, 'live'); assert.ok(r.inputTokens > 0); assert.equal(r.truncated, false); check(r); entry.success = true;
    console.log(JSON.stringify({ company: pilot.company.name, success: true, costUSD: r.cost / 1e6, answer: r.answer }));
  } catch (e) { entry.error = e.message; process.exitCode = 1; console.error(pilot.company.name + ': ' + e.message); }
  report.live.push(entry); await persist();
}
const after = await api('');
assert.deepEqual(after.assistants.map(a => [a.id, a.published, a.mode]), before.assistants.map(a => [a.id, a.published, a.mode]));
assert.deepEqual(after.providers, before.providers);
for (const c of before.companies) assert.equal(after.companies.find(x => x.id === c.id).reserved, c.reserved);
report.totals = { guidedCostUSD: 0, liveCostUSD: report.live.reduce((n, r) => n + (r.cost || 0), 0) / 1e6, generated: report.live.filter(x => x.mode === 'live').length, successful: report.live.filter(x => x.success).length };
await persist(); console.log(JSON.stringify(report.totals));
