// Local-only smoke test. Uses saved server-side credentials; never reads API keys.
import { mkdir, writeFile } from 'node:fs/promises';

const base = 'http://127.0.0.1:5173';
const login = await fetch(base + '/signin-with-chatgpt?return_to=/', { redirect: 'manual' });
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!cookie) throw new Error('No se pudo abrir la sesión de desarrollo local.');
const headers = { Cookie: cookie, Origin: base, 'Content-Type': 'application/json' };
async function local(path, method = 'GET', data) {
  const response = await fetch(base + '/api' + path, {
    method, headers, ...(data != null ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(120000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Error local ${response.status}`);
  return result;
}
const state = await local('');
const pilots = [
  { host: 'www.mmartinez1122.com', prompt: '¿Qué libros de Manuel Martínez aparecen en tus fuentes? Dame dos títulos y el enlace para ver sus obras.' },
  { host: 'winetalia.vercel.app', prompt: 'Somos cuatro personas y tenemos un presupuesto de 1200 MXN para una cena. ¿Qué vinos disponibles podrías sugerir de tu catálogo? Si no hay información suficiente, indícalo.' },
].map(p => {
  const company = state.companies.find(c => new URL(c.website).hostname === p.host);
  if (!company) throw new Error(`Falta el piloto local ${p.host}.`);
  const assistant = state.assistants.find(a => a.company_id === company.id);
  const provider = state.providers.find(x => x.company_id === company.id);
  if (!assistant) throw new Error(`Falta el asistente de ${company.name}.`);
  return { ...p, company, assistant, provider };
});
const missing = pilots.filter(p => !p.provider?.configured || !p.provider.input_price || !p.provider.output_price);
if (missing.length) {
  console.log('Pendiente de clave y tarifas en Configuración: ' + missing.map(p => p.company.name).join(', '));
  console.log('No se activó IA real ni se generaron respuestas.');
  process.exitCode = 2;
} else {
const results = [];
await mkdir('outputs', { recursive: true });
for (const p of pilots) {
  try {
    const checked = await local('/providers/' + p.company.id + '/check', 'POST', {});
    console.log(`${p.company.name}: clave y modelo ${checked.model} verificados.`);
    await local('/assistants/' + p.assistant.id, 'PATCH', { mode: 'live' });
    const result = await local('/chat', 'POST', { assistantId: p.assistant.id, message: p.prompt, requestKey: crypto.randomUUID() });
    if (result.mode !== 'live' || result.inputTokens < 1) throw new Error(`La respuesta de ${p.company.name} no reportó una generación real.`);
    if (result.truncated) throw new Error(`La respuesta de ${p.company.name} alcanzó el límite de salida y quedó incompleta.`);
    results.push({ company: p.company.name, assistant: p.assistant.name, model: p.assistant.model, prompt: p.prompt, success: true, ...result });
    console.log(JSON.stringify({ company: p.company.name, mode: result.mode, inputTokens: result.inputTokens, outputTokens: result.outputTokens, costUSD: result.cost / 1e6, sources: result.sources, products: result.products?.length, answer: result.answer }));
  } catch (error) {
    results.push({ company: p.company.name, assistant: p.assistant.name, model: p.assistant.model, success: false, error: error.message });
    console.error(`${p.company.name}: ${error.message}`);
    process.exitCode = 1;
  }
  await writeFile('outputs/gemini-pilots-test.json', JSON.stringify({ localUrl: base, testedAt: new Date().toISOString(), results }, null, 2));
}
console.log('Pruebas reales guardadas localmente en outputs/gemini-pilots-test.json.');
}
