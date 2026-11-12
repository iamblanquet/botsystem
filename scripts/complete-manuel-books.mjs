// Updates only the local pilot through its authenticated API. No deployment or remote writes.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { validatePlaybook } from '../lib/flows.ts';
const base = 'http://127.0.0.1:5173';
const catalog = JSON.parse(await readFile(new URL('../lib/data/manuel-books.json', import.meta.url), 'utf8'));
const login = await fetch(base + '/signin-with-chatgpt?return_to=/', { redirect: 'manual' });
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!cookie) throw new Error('No se pudo abrir la sesión local.');
async function api(path, method = 'GET', data) {
  const r = await fetch(base + '/api' + path, { method, headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}) });
  const result = await r.json(); if (!r.ok) throw new Error(result.error); return result;
}
const before = await api('');
const company = before.companies.find(c => new URL(c.website).hostname === 'www.mmartinez1122.com');
const bot = before.assistants.find(a => a.company_id === company?.id);
if (!bot) throw new Error('No se encontró el piloto local de Manuel.');
const original = await api('/assistants/' + bot.id + '/playbook');
await mkdir('outputs/book-research', { recursive: true });
const backup = `outputs/book-research/manuel-before-v${original.version}.json`;
await writeFile(backup, JSON.stringify(original, null, 2), { flag: 'wx' }).catch(e => { if (e.code !== 'EEXIST') throw e; });
const config = structuredClone(original.config), changes = [];
for (const b of catalog.books) {
  assert.equal(new URL(b.sourceUrl).hostname, 'www.mmartinez1122.com');
  const existing = config.items.find(x => x.url === b.sourceUrl || x.name.toLocaleLowerCase('es') === b.name.toLocaleLowerCase('es'));
  const item = {
    id: existing?.id || 'public-' + b.slug,
    name: b.name, category: 'book',
    description: `${b.description}\n\n${b.format}\n${b.languageNote}\nResumen de la reseña pública del autor, consultada el ${catalog.checkedAt}. No incluye el texto completo. Precio y disponibilidad comercial por confirmar.`,
    tags: [...new Set([...(existing?.tags || []), ...b.tags])].slice(0, 20),
    price: existing?.price ?? null, url: b.sourceUrl, available: existing?.available ?? true,
  };
  if (existing) config.items[config.items.indexOf(existing)] = item; else config.items.push(item);
  changes.push({ name: item.name, action: existing ? 'updated' : 'added', sourceUrl: item.url });
}
config.profile.policies = `Las fichas de libros resumen reseñas públicas del autor consultadas el ${catalog.checkedAt}; no incluyen los textos completos. Las etiquetas clasifican temas descritos en esas reseñas. No inventar precios, disponibilidad o contenido adicional. Numerología, profecías y escenarios alternativos deben presentarse como propuestas literarias o creencias del autor, no como hechos comprobados. Algunas páginas declaran inglés mientras sus títulos y reseñas están en español: confirmar el idioma de la edición y consultar siempre su ficha específica.`;
const faqs = [
  { id: 'public-books-theatre', question: '¿Qué obras de teatro aparecen en el catálogo?', answer: 'La comedia maldita es una obra teatral en cuatro actos y epílogo: https://www.mmartinez1122.com/la-comedia-maldita.html . Nostradamus: Amor, poder, redención también se presenta como obra teatral: https://www.mmartinez1122.com/nostradamus-amor-poder-redencion.html . La maldita comedia es una novela distinta, pese al título parecido.' },
  { id: 'public-books-graphic', question: '¿Qué novelas gráficas puedo explorar?', answer: 'Recuerdos de una vida pasada es la parte II de El soñador que descubrió los secretos del Universo: https://www.mmartinez1122.com/el-sonador-que-descubrio-los-secretos-del-universo.html . La Guerra de los Dioses – Parte III continúa esa serie: https://www.mmartinez1122.com/la-guerra-de-los-dioses-parte-iii.html . Ambas fichas mencionan ilustraciones de Mark Golding y declaran inglés con reseñas en español; confirma la edición.' },
  { id: 'public-books-editions', question: '¿Las versiones de 11: El Código Secreto son la misma ficha?', answer: 'El autor mantiene dos entradas separadas. La primera se consulta en https://www.mmartinez1122.com/codigo-secreto.html . La segunda versión tiene portada y referencia comercial propias: https://www.mmartinez1122.com/11-codigo-secreto-otra-edicion.html . No se ha confirmado que ambas versiones tengan idéntico contenido. Revisa idioma y edición antes de comprar. Las reseñas no confirman precios actuales.' },
];
for (const q of faqs) { const idx = config.faqs.findIndex(x => x.id === q.id); if (idx >= 0) config.faqs[idx] = q; else config.faqs.push(q); }
const f = config.flows.find(f => f.id === 'books' && f.source === 'local');
if (f) {
  const interest = f.steps.find(s => s.id === 'interes' && s.type === 'choice');
  if (interest) {
    interest.match = 'require';
    const additions = [
      { id: 'public-numerology', label: 'Numerología y misterio', tags: ['numerologia', 'karma'] },
      { id: 'public-graphic', label: 'Novela gráfica', tags: ['novela grafica'] },
      { id: 'public-theatre', label: 'Teatro', tags: ['teatro'] },
      { id: 'public-suspense', label: 'Suspenso existencial', tags: ['suspenso existencial'] },
    ];
    for (const o of additions) if (!interest.options.some(x => x.id === o.id)) interest.options.push(o);
    if (interest.options.length > 12) throw new Error('El paso de intereses supera doce opciones. No se guardó ningún cambio.');
  }
  f.intro = 'Exploremos las obras a partir de las reseñas públicas del autor. Elige el tema o formato que más te interese.';
  f.closing = 'Selección basada en las reseñas públicas del autor. Puedes consultar cada ficha para más información. Confirma idioma, edición, precio y disponibilidad antes de comprar.';
}
const saved = await api('/assistants/' + bot.id + '/playbook', 'PUT', { version: original.version, config: validatePlaybook(config) });
const after = await api('');
assert.deepEqual(after.assistants, before.assistants);
assert.deepEqual(after.providers, before.providers);
assert.deepEqual(after.companies, before.companies);
await writeFile('outputs/book-research/manuel-import-report.json', JSON.stringify({ checkedAt: catalog.checkedAt, localOnly: true, assistantId: bot.id, version: saved.version, backup, changes, sourceNote: catalog.note }, null, 2));
console.log(JSON.stringify({ ok: true, localOnly: true, company: company.name, books: changes.length, added: changes.filter(x => x.action === 'added').length, updated: changes.filter(x => x.action === 'updated').length, version: saved.version, aiCalls: 0 }, null, 2));
