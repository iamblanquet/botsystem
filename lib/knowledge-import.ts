export type KnowledgeFormat = 'text' | 'txt' | 'md' | 'csv' | 'tsv' | 'json';
export type KnowledgeMatrix = { headers: string[]; rows: string[][]; label: string };
export type ParsedKnowledge = { content: string; format: KnowledgeFormat; matrices: KnowledgeMatrix[]; segments: string[]; rowCount: number };
export const KNOWLEDGE_MAX_BYTES = 1_000_000;
export const KNOWLEDGE_MAX_CHARS = 500_000;
export const KNOWLEDGE_MAX_ROWS = 1000;
export const KNOWLEDGE_MAX_COLUMNS = 32;

export function knowledgeFormat(value: unknown): KnowledgeFormat {
  const type = String(value || 'text').toLowerCase();
  if (type === 'markdown') return 'md';
  if (['text', 'txt', 'md', 'csv', 'tsv', 'json'].includes(type)) return type as KnowledgeFormat;
  throw new Error('Formatos admitidos: TXT, MD, MARKDOWN, CSV, TSV y JSON.');
}
export function knowledgeFileFormat(name: string) {
  const extension = name.split('.').pop()?.toLowerCase();
  if (!extension || !['txt', 'md', 'markdown', 'csv', 'tsv', 'json'].includes(extension)) throw new Error('Selecciona un archivo TXT, MD, MARKDOWN, CSV, TSV o JSON.');
  return knowledgeFormat(extension);
}
function splitText(text: string, prefix = '') {
  const clean = text.trim(), size = Math.max(400, 1300 - prefix.length), result: string[] = [];
  for (let start = 0; start < clean.length; start += size - 180) result.push(prefix + clean.slice(start, start + size));
  return result;
}
function validateMatrix(headers: string[], rows: string[][], label: string): KnowledgeMatrix {
  if (headers.length < 2 || headers.length > KNOWLEDGE_MAX_COLUMNS) throw new Error('La matriz debe tener entre 2 y 32 columnas.');
  const keys = headers.map(value => value.trim().toLocaleLowerCase());
  if (keys.some(value => !value) || new Set(keys).size !== keys.length) throw new Error('Cada columna necesita un encabezado único y no vacío.');
  if (headers.some(value => value.length > 120)) throw new Error('Los encabezados pueden tener hasta 120 caracteres.');
  if (!rows.length) throw new Error('Agrega al menos una fila de conocimiento debajo de los encabezados.');
  if (rows.length > KNOWLEDGE_MAX_ROWS) throw new Error('La matriz admite hasta 1000 filas. Divide el archivo en varias fuentes.');
  rows.forEach((row, index) => {
    if (row.length !== headers.length) throw new Error(`Fila ${index + 2}: se esperaban ${headers.length} columnas y hay ${row.length}. Revisa el separador y las comillas.`);
    if (row.some(cell => cell.length > 12_000)) throw new Error(`Fila ${index + 2}: cada celda admite hasta 12000 caracteres.`);
  });
  return { headers: headers.map(value => value.trim()), rows, label };
}
function delimiterFor(text: string) {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 }; let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') { if (quoted && text[index + 1] === '"') index++; else quoted = !quoted; }
    else if (!quoted && char === '\n') break;
    else if (!quoted && Object.hasOwn(counts, char)) counts[char]++;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}
function delimitedMatrix(text: string, format: 'csv' | 'tsv') {
  const separator = format === 'tsv' ? '\t' : delimiterFor(text), records: string[][] = [];
  let record: string[] = [], field = '', quoted = false, closedQuote = false;
  function cell() { record.push(field.trim()); field = ''; closedQuote = false; if (record.length > KNOWLEDGE_MAX_COLUMNS) throw new Error('La matriz admite hasta 32 columnas.'); }
  function row() { cell(); if (record.some(Boolean)) records.push(record); record = []; if (records.length > KNOWLEDGE_MAX_ROWS + 1) throw new Error('La matriz admite hasta 1000 filas de conocimiento.'); }
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) { if (char === '"') { if (text[index + 1] === '"') { field += '"'; index++; } else { quoted = false; closedQuote = true; } } else field += char; }
    else if (char === separator) cell();
    else if (char === '\n') row();
    else if (char === '"' && !field.trim() && !closedQuote) { quoted = true; field = ''; }
    else if (closedQuote && /\s/.test(char)) continue;
    else if (closedQuote || char === '"') throw new Error(`Fila ${records.length + 1}: revisa las comillas del archivo. Usa comillas dobles para celdas con separadores o saltos de línea.`);
    else field += char;
  }
  if (quoted) throw new Error('Hay una celda con comillas sin cerrar.');
  if (field || record.length || closedQuote) row();
  return validateMatrix(records[0] || [], records.slice(1), separator === '\t' ? 'Tabla TSV' : separator === ';' ? 'Tabla CSV · punto y coma' : 'Tabla CSV');
}
function pipeCells(line: string) {
  let value = line.trim();
  if (value.startsWith('|')) value = value.slice(1);
  if (value.endsWith('|') && !value.endsWith('\\|')) value = value.slice(0, -1);
  const cells: string[] = []; let cell = '';
  for (let index = 0; index < value.length; index++) {
    if (value[index] === '\\' && ['|', '\\'].includes(value[index + 1])) cell += value[++index];
    else if (value[index] === '|') { cells.push(cell.trim()); cell = ''; }
    else cell += value[index];
  }
  cells.push(cell.trim()); return cells;
}
function markdownParts(content: string) {
  const lines = content.split('\n'), matrices: KnowledgeMatrix[] = [], prose: string[] = []; let fence = '', heading = '';
  for (let index = 0; index < lines.length; index++) {
    const marker = lines[index].trim().match(/^(`{3,}|~{3,})/);
    if (marker) { if (!fence) fence = marker[1][0]; else if (fence === marker[1][0]) fence = ''; }
    if (!fence && /^#{1,6}\s/.test(lines[index])) heading = lines[index].replace(/^#{1,6}\s+/, '').trim();
    const delimiters = pipeCells(lines[index + 1] || '');
    if (!fence && lines[index].includes('|') && delimiters.length >= 2 && delimiters.every(value => /^:?-{3,}:?$/.test(value))) {
      const headers = pipeCells(lines[index]), rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) { rows.push(pipeCells(lines[index])); index++; }
      index--;
      matrices.push(validateMatrix(headers, rows, heading || 'Tabla Markdown ' + (matrices.length + 1)));
      prose.push('');
    } else prose.push(lines[index]);
  }
  return { matrices, prose: prose.join('\n') };
}
function matrixSegments(matrix: KnowledgeMatrix) {
  return matrix.rows.flatMap((row, index) => {
    const title = `${matrix.label} · fila ${index + 1}\n`;
    const values = matrix.headers.map((header, column) => row[column] ? `${header}: ${row[column]}` : '').filter(Boolean).join('\n');
    return splitText(values, title);
  });
}
export function parseKnowledge(raw: unknown, type: unknown = 'text'): ParsedKnowledge {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('Agrega contenido antes de guardar.');
  if (raw.length > KNOWLEDGE_MAX_CHARS || new TextEncoder().encode(raw).length > KNOWLEDGE_MAX_BYTES) throw new Error('La fuente admite hasta 1 MB y 500000 caracteres.');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(raw)) throw new Error('El archivo debe contener texto UTF-8, sin datos binarios.');
  const format = knowledgeFormat(type), content = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  let matrices: KnowledgeMatrix[] = [], prose = content;
  if (format === 'csv' || format === 'tsv') { matrices = [delimitedMatrix(content, format)]; prose = ''; }
  else if (format === 'md') ({ matrices, prose } = markdownParts(content));
  else if (format === 'json') { try { prose = JSON.stringify(JSON.parse(content), null, 2); } catch { throw new Error('El archivo JSON no es válido.'); } }
  const rowCount = matrices.reduce((sum, matrix) => sum + matrix.rows.length, 0);
  if (rowCount > KNOWLEDGE_MAX_ROWS) throw new Error('Cada fuente admite hasta 1000 filas entre todas sus tablas.');
  const segments = [...prose.split(/(?=^#{1,6}\s)/m).flatMap(section => splitText(section)), ...matrices.flatMap(matrixSegments)];
  return { content, format, matrices, segments, rowCount };
}
export function knowledgeSegments(content: string, type?: string) {
  // Old sources can predate validation; a malformed legacy table must not break its chat.
  try { return parseKnowledge(content, type || 'text').segments; } catch { return splitText(content); }
}
export function serializeMatrix(headers: string[], rows: string[][], format: 'csv' | 'tsv' = 'tsv') {
  const separator = format === 'csv' ? ',' : '\t';
  const quote = (value: string) => /[,;\t\n\r"]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
  return [headers, ...rows.filter(row => row.some(value => value.trim()))].map(row => row.map(quote).join(separator)).join('\n');
}
