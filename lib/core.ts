import { knowledgeSegments } from './knowledge-import';
export const MICRO = 1_000_000;
export const GEMINI_MAX_OUTPUT_TOKENS = 4096;
export function geminiGenerationConfig(model: string) {
  const major = Number(model.match(/^gemini-(\d+)/)?.[1] || 0);
  // Gemini 3+ uses thinking levels; sampling controls are deprecated for these models.
  return major >= 3
    ? { maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS, thinkingConfig: { thinkingLevel: 'LOW' } }
    : { maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS, temperature: 0.3 };
}
export function moneyToMicros(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) throw new Error('Importe inválido.');
  return Math.round(n * MICRO);
}
export function costMicros(input: number, output: number, inputPrice: number, outputPrice: number) {
  return Math.ceil((input * inputPrice + output * outputPrice) / MICRO);
}
export function mentionedProducts<T extends { name: string }>(answer: string, products: T[]) {
  const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const haystack = ' ' + normalize(answer) + ' ';
  return products.filter(p => normalize(p.name).length >= 3 && haystack.includes(' ' + normalize(p.name) + ' ')).slice(0, 3);
}
export function chunks(text: string, size = 1300) {
  const clean = text.replace(/\r/g, '').trim();
  const out: string[] = [];
  for (let i = 0; i < clean.length; i += size - 180) out.push(clean.slice(i, i + size));
  return out;
}
export function retrieve(query: string, docs: { name: string; content: string; type?: string }[]) {
  const tokens = [...new Set(query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]{3,}/g) || [])];
  const ranked = docs.flatMap(d => knowledgeSegments(d.content, d.type).map(content => {
    const normalized = content.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return { name: d.name, content, score: tokens.reduce((s, t) => s + (normalized.includes(t) ? t.length : 0), 0) };
  })).sort((a, b) => b.score - a.score);
  return ranked.filter(x => x.score > 0).slice(0, 5);
}
export function allowedOrigins(value: unknown) {
  const list = String(value || '').split(/[\n,]/).map(x => x.trim()).filter(Boolean);
  if (list.length > 12) throw new Error('Puedes autorizar hasta 12 dominios.');
  return list.map(x => {
    const u = new URL(x);
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) throw new Error('Usa dominios HTTPS.');
    if (u.username || u.password) throw new Error('Dominio inválido.');
    return u.origin;
  });
}
export function publicWebsite(value: unknown) {
  const url = new URL(String(value));
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.') || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname) || url.hostname.includes(':') || /\.(local|internal|test)$/.test(url.hostname)) throw new Error('Ingresa una URL pública HTTPS válida.');
  return url;
}
export function template(kind: string, company: string) {
  if (kind === 'commerce') return {
    name: 'Sofía', subtitle: `Asesora de ${company}`, color: '#7f304b',
    welcome: '¡Hola! Vamos a encontrar algo para tu mesa. ¿Qué ocasión tienes y cuál es tu presupuesto?',
    instructions: 'Ayuda a elegir productos según la ocasión, el número de personas y el presupuesto. Usa únicamente los productos consultados en el catálogo. No inventes precios, existencias, ingredientes ni atributos. Si falta información, indícalo. La selección es una propuesta: el negocio confirma disponibilidad y precio. Nunca garantices seguridad ante alergias.',
    suggestions: ['Una cena para dos', 'Vinos para una reunión', 'Tengo un presupuesto'],
  };
  return {
    name: kind === 'author' && company === 'Manuel Martínez' ? 'Asistente de Manuel' : `Asistente de ${company}`,
    subtitle: kind === 'author' ? 'Libros, ideas y conversaciones' : 'Estamos aquí para ayudarte',
    color: kind === 'author' ? '#ad744d' : '#6b59df',
    welcome: kind === 'author' ? `Hola, soy el asistente de ${company}. Puedo orientarte sobre sus libros y contenidos. ¿Qué te gustaría conocer?` : `¡Hola! Bienvenido a ${company}. ¿En qué puedo ayudarte?`,
    instructions: kind === 'author' ? `Presenta los libros y contenidos de ${company} basándote en las fuentes. No te hagas pasar por el autor ni atribuyas citas o ideas que no estén documentadas. Ayuda a encontrar libros, podcast y contacto. No des asesoramiento financiero personalizado.` : 'Responde en español de forma clara y amable, usando únicamente la información proporcionada. Si no tienes una respuesta, dilo y ofrece contactar al negocio.',
    suggestions: kind === 'author' ? ['Conocer sus libros', 'Escuchar el podcast', 'Contactar a Manuel'] : ['¿Qué servicios ofrecen?', 'Quiero más información', '¿Cómo los contacto?'],
  };
}
