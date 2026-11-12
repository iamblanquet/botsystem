// Shared, versioned configuration. Only the server decides transitions and recommendations.
export type FlowOption = { id: string; label: string; tags: string[] };
export type FlowStep = { id: string; question: string; type: 'choice' | 'text' | 'number'; required: boolean; options: FlowOption[]; min: number; max: number; role: 'preference' | 'budget' | 'quantity'; match?: 'prefer' | 'require'; when: { stepId: string; optionId: string } | null };
export type Flow = { id: string; name: string; enabled: boolean; intro: string; source: 'local' | 'catalog'; category: string; steps: FlowStep[]; resultTitle: string; emptyMessage: string; closing: string; maxResults: number; requireMatch: boolean; budgetScope: 'item' | 'total' };
export type KnowledgeItem = { id: string; name: string; category: string; description: string; tags: string[]; price: number | null; url: string; available: boolean; externalId?: string };
export type Playbook = { profile: { summary: string; hours: string; contact: string; policies: string }; faqs: { id: string; question: string; answer: string }[]; items: KnowledgeItem[]; flows: Flow[] };
export type FlowState = { flowId: string; version: number; revision: number; stepId: string | null; answers: Record<string, string>; status: 'active' | 'completed' | 'cancelled' };
export type FlowView = { flowId: string; name: string; revision: number; status: FlowState['status']; progress: number; total: number; step: Pick<FlowStep, 'id' | 'question' | 'type' | 'required' | 'options' | 'min' | 'max'> | null; answers: { question: string; answer: string }[] };
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export const emptyPlaybook = (): Playbook => ({ profile: { summary: '', hours: '', contact: '', policies: '' }, faqs: [], items: [], flows: [] });
export function flowTemplate(kind: 'books' | 'wine' | 'custom', uid = crypto.randomUUID()): Flow {
  const choice = (id: string, question: string, labels: [string, string[]][]): FlowStep => ({ id, question, type: 'choice', required: true, options: labels.map(([label, tags], i) => ({ id: 'o' + i, label, tags })), min: 0, max: 100000, role: 'preference', when: null });
  const f: Flow = { id: uid, name: 'Mi recorrido', enabled: true, intro: 'Responde unas preguntas para explorar las opciones disponibles.', source: 'local', category: '', steps: [choice('preferencia', '¿Qué te interesa?', [['Explorar opciones', []]])], resultTitle: 'Opciones para ti', emptyMessage: 'No encontré opciones con estos criterios. Puedes ajustar tus respuestas o contactar al negocio.', closing: 'Puedes seguir conversando con el asistente para resolver tus dudas.', maxResults: 3, requireMatch: false, budgetScope: 'item' };
  if (kind === 'books') return { ...f, name: 'Encuentra tu próxima lectura', category: 'book', intro: 'Te ayudaré a explorar los libros con la información confirmada del autor.', steps: [choice('interes', '¿Qué te gustaría explorar?', [['Historia', ['historia']], ['Ideas y reflexión', ['reflexion']], ['Ver los títulos disponibles', []]]), choice('objetivo', '¿Para qué buscas un libro?', [['Lectura personal', ['personal']], ['Para regalar', ['regalo']], ['Para investigar', ['investigacion']]])], resultTitle: 'Tu selección de libros', closing: 'Las fichas piloto confirman los títulos. Cuando falte una sinopsis o un tema verificado, no asumiré su contenido. Consulta los detalles con el autor.' };
  if (kind === 'wine') return { ...f, name: 'Elige el vino para tu ocasión', source: 'catalog', category: 'wine', intro: 'Primero la ocasión, después el presupuesto. Los importes son en MXN.', steps: [choice('ocasion', '¿Para qué ocasión buscas vino?', [['Cena con amigos', ['cena', 'amigos']], ['Una celebración', ['celebracion', 'espumoso']], ['Un regalo', ['regalo']], ['Para disfrutar en casa', ['casa']]]), { ...choice('presupuesto', '¿Cuánto quieres gastar como máximo por botella? · MXN', []), type: 'number', role: 'budget', min: 1, max: 100000 }, { ...choice('estilo', '¿Qué estilo prefieres?', [['Tinto', ['tinto', 'red']], ['Blanco', ['blanco', 'white']], ['Espumoso', ['espumoso', 'sparkling']], ['Sorpréndeme', []]]), match: 'require' }], resultTitle: 'Vinos dentro de tu presupuesto', closing: 'La ocasión orienta la búsqueda; las coincidencias se basan en las fichas disponibles. El negocio confirma precio y disponibilidad antes de preparar tu solicitud.' };
  return f;
}
export function pilotPlaybook(kind: 'books' | 'wine'): Playbook {
  const p = emptyPlaybook(); p.flows = [flowTemplate(kind, kind)];
  if (kind === 'books') p.items = ['La Historia como Pacto', 'Los ciclos de la historia'].map((name, i) => ({ id: 'book-' + i, name, category: 'book', description: '', tags: [], price: null, url: 'https://www.mmartinez1122.com/books-es.html', available: true }));
  return p;
}
export function validatePlaybook(raw: unknown): Playbook {
  function fail(message: string): never { throw new Error('Configuración inválida: ' + message); }
  function str(v: any, label: string, max: number, required = false) { if (typeof v !== 'string' || v.length > max || (required && !v.trim())) fail(label); return v.trim(); }
  function arr(v: any, label: string, max: number): any[] { if (!Array.isArray(v) || v.length > max) fail(label); return v; }
  function key(v: any) { const s = str(v, 'Identificador', 80, true); if (!/^[a-zA-Z0-9_-]+$/.test(s)) fail('Identificador'); return s; }
  function unique<T extends { id: string }>(a: T[]): T[] { if (new Set(a.map(x => x.id)).size !== a.length) fail('Hay identificadores repetidos.'); return a; }
  function tags(v: any) { return arr(v, 'Máximo 20 etiquetas.', 20).map(x => norm(str(x, 'Etiqueta', 60, true))); }
  function num(v: any, min: number, max: number) { if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail('Valor numérico fuera de rango.'); return v; }
  const p = raw as Playbook;
  if (!p || typeof p !== 'object' || !p.profile) fail('Faltan los datos del negocio.');
  const result: Playbook = { profile: { summary: str(p.profile.summary, 'Resumen', 4000), hours: str(p.profile.hours, 'Horarios', 1000), contact: str(p.profile.contact, 'Contacto', 1000), policies: str(p.profile.policies, 'Políticas', 4000) }, faqs: [], items: [], flows: [] };
  result.faqs = unique(arr(p.faqs, 'Máximo 50 preguntas frecuentes.', 50).map(q => ({ id: key(q.id), question: str(q.question, 'Pregunta frecuente', 300, true), answer: str(q.answer, 'Respuesta frecuente', 3000, true) })));
  result.items = unique(arr(p.items, 'Máximo 100 fichas.', 100).map(x => {
    const url = str(x.url, 'Enlace', 1000); if (url) { let u: URL; try { u = new URL(url); } catch { return fail('Enlace de ficha'); } if (u.protocol !== 'https:' || u.username || u.password) fail('El enlace debe usar HTTPS sin credenciales.'); }
    return { id: key(x.id), name: str(x.name, 'Nombre de ficha', 180, true), category: str(x.category, 'Categoría', 80), description: str(x.description, 'Descripción', 3000), tags: tags(x.tags), price: x.price === null ? null : num(x.price, 0, 1000000), url, available: !!x.available, externalId: str(x.externalId || '', 'ID de producto del catálogo', 100) };
  }));
  result.flows = unique(arr(p.flows, 'Máximo 10 flujos por asistente.', 10).map(f => {
    const steps = unique(arr(f.steps, 'Usa entre 1 y 12 preguntas.', 12).map(s => ({ id: key(s.id), question: str(s.question, 'Pregunta del flujo', 500, true), type: s.type, required: !!s.required, options: unique(arr(s.options, 'Máximo 12 opciones por pregunta.', 12).map(o => ({ id: key(o.id), label: str(o.label, 'Opción', 120, true), tags: tags(o.tags) }))), min: num(s.min, 0, 1000000), max: num(s.max, 0, 1000000), role: s.role, match: s.match === 'require' ? 'require' : 'prefer', when: s.when ? { stepId: key(s.when.stepId), optionId: key(s.when.optionId) } : null })) as FlowStep[]);
    if (!steps.length) fail('Agrega al menos una pregunta.');
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i]; if (!['choice', 'text', 'number'].includes(s.type) || !['preference', 'budget', 'quantity'].includes(s.role) || s.max < s.min || (s.type === 'choice' && !s.options.length)) fail('Revisa el tipo, opciones y límites de las preguntas.');
      if (s.role !== 'preference' && s.type !== 'number') fail('Presupuesto y cantidad requieren una pregunta numérica.');
      if (s.role === 'quantity' && s.min < 1) fail('La cantidad mínima es 1.');
      if (s.when && !steps.slice(0, i).some(prev => prev.id === s.when!.stepId && prev.type === 'choice' && prev.options.some(o => o.id === s.when!.optionId))) fail('Las condiciones deben apuntar a una opción de una pregunta anterior.');
    }
    for (const role of ['budget', 'quantity']) if (steps.filter(s => s.role === role).length > 1) fail('Usa una sola pregunta de presupuesto y una de cantidad.');
    if (!['local', 'catalog'].includes(f.source) || !['item', 'total'].includes(f.budgetScope)) fail('Origen o presupuesto inválido.');
    return { id: key(f.id), name: str(f.name, 'Nombre del flujo', 120, true), enabled: !!f.enabled, intro: str(f.intro, 'Introducción', 1000), source: f.source, category: str(f.category, 'Categoría', 80), steps, resultTitle: str(f.resultTitle, 'Título de resultado', 200, true), emptyMessage: str(f.emptyMessage, 'Mensaje sin resultados', 1000, true), closing: str(f.closing, 'Cierre', 1200), maxResults: Math.trunc(num(f.maxResults, 1, 6)), requireMatch: !!f.requireMatch, budgetScope: f.budgetScope };
  }));
  const linked = result.items.filter(x => x.externalId);
  if (new Set(linked.map(x => x.externalId)).size !== linked.length) fail('Cada ID de catálogo debe tener una sola ficha complementaria.');
  if (JSON.stringify(result).length > 200000) fail('La configuración supera 200 KB.');
  return result;
}
export function visibleSteps(f: Flow, answers: Record<string, string>) { return f.steps.filter(s => !s.when || answers[s.when.stepId] === s.when.optionId); }
export function acceptAnswer(s: FlowStep, raw: unknown) {
  const v = String(raw ?? '').trim();
  if (!v) { if (s.required) throw new Error('Esta pregunta es obligatoria.'); return ''; }
  if (s.type === 'choice' && !s.options.some(o => o.id === v)) throw new Error('Elige una de las opciones disponibles.');
  if (s.type === 'number' && (!Number.isFinite(Number(v)) || Number(v) < s.min || Number(v) > s.max || (s.role === 'quantity' && !Number.isInteger(Number(v))))) throw new Error(`Ingresa ${s.role === 'quantity' ? 'un entero' : 'un número'} entre ${s.min} y ${s.max}.`);
  if (v.length > 500) throw new Error('Usa hasta 500 caracteres.');
  return v;
}
export function flowView(f: Flow, s: FlowState): FlowView {
  const visible = visibleSteps(f, s.answers), step = visible.find(x => x.id === s.stepId);
  return { flowId: f.id, name: f.name, revision: s.revision, status: s.status, progress: s.status === 'completed' ? visible.length : visible.findIndex(x => x.id === s.stepId) + 1, total: visible.length, step: step ? { id: step.id, question: step.question, type: step.type, required: step.required, options: step.options.map(o => ({ ...o, tags: [] })), min: step.min, max: step.max } : null, answers: visible.filter(x => Object.hasOwn(s.answers, x.id)).map(x => ({ question: x.question, answer: x.options.find(o => o.id === s.answers[x.id])?.label || s.answers[x.id] || 'Sin preferencia' })) };
}
export type Recommendation = KnowledgeItem & { matchedTags: string[] };
export function recommend(f: Flow, answers: Record<string, string>, items: KnowledgeItem[]): Recommendation[] {
  const steps = visibleSteps(f, answers);
  const preferences = steps.filter(s => s.role === 'preference').map(s => ({ match: s.match, tags: s.type === 'choice' ? s.options.find(o => o.id === answers[s.id])?.tags || [] : norm(answers[s.id] || '').split(/[,;\s]+/).filter(t => t.length > 2) }));
  const wanted = preferences.flatMap(s => s.tags);
  const b = steps.find(s => s.role === 'budget'), q = steps.find(s => s.role === 'quantity');
  const budget = b && answers[b.id] ? Number(answers[b.id]) : null, quantity = q && answers[q.id] ? Number(answers[q.id]) : 1;
  return items.filter(x => x.available && (!f.category || norm(x.category) === norm(f.category)) && (budget == null || (x.price != null && x.price * (f.budgetScope === 'total' ? quantity : 1) <= budget)))
    .filter(x => preferences.every(s => s.match !== 'require' || !s.tags.length || s.tags.some(t => x.tags.some(tag => norm(tag) === norm(t)))))
    .map(x => ({ ...x, matchedTags: [...new Set(wanted.filter(t => x.tags.some(tag => norm(tag) === norm(t))))] }))
    .filter(x => !f.requireMatch || !wanted.length || x.matchedTags.length > 0)
    .sort((a, b) => b.matchedTags.length - a.matchedTags.length || (a.price ?? Infinity) - (b.price ?? Infinity) || a.name.localeCompare(b.name)).slice(0, f.maxResults);
}
export function knowledgeDocuments(p: Playbook) {
  return [ { name: 'Datos del negocio', content: Object.entries(p.profile).map(([k, v]) => `${k}: ${v}`).join('\n') }, ...p.faqs.map(q => ({ name: q.question, content: `Pregunta: ${q.question}\nRespuesta aprobada: ${q.answer}` })), ...p.items.filter(x => x.available).map(x => ({ name: x.name, content: `Título / producto: ${x.name}\nCategoría: ${x.category}\nDescripción confirmada: ${x.description || 'No se ha proporcionado una descripción. No asumas temas ni contenido.'}\nEtiquetas confirmadas: ${x.tags.join(', ')}\nPrecio MXN: ${x.externalId ? 'Consulta siempre el catálogo vigente; esta ficha solo complementa sus atributos.' : x.price ?? 'Por confirmar'}\nEnlace: ${x.url}` })) ];
}
