'use client';
import { useEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import { FileText, LoaderCircle, Plus, Table2, Trash2, Upload } from 'lucide-react';
import { retrieve } from '@/lib/core';
import { knowledgeFileFormat, knowledgeFormat, parseKnowledge, serializeMatrix, type KnowledgeFormat } from '@/lib/knowledge-import';
import { type Assistant, type Company, type KnowledgeSource } from '@/lib/types';
import { Button } from './platform-ui';

export default function KnowledgeImportForm({ assistantId, assistants, companyFor, defaultCompany, working = false, save, close, source, onBusy }: { assistantId?: string; assistants?: Assistant[]; companyFor?: (id: string) => Company | undefined; defaultCompany?: string; working?: boolean; save: (input: FormData | Record<string, unknown>) => Promise<void>; close: () => void; source?: KnowledgeSource; onBusy?: (busy: boolean) => void }) {
  const [initial] = useState(() => {
    let format: KnowledgeFormat = 'md';
    try { if (source) format = knowledgeFormat(source.type); } catch { format = 'text'; }
    let matrix;
    try { if (source && (format === 'csv' || format === 'tsv')) matrix = parseKnowledge(source.content, format).matrices[0]; } catch { /* Repair legacy malformed tables in the text editor. */ }
    return { format, matrix };
  });
  const [selectedAssistant, setSelectedAssistant] = useState(assistantId || assistants?.find(item => item.company_id === defaultCompany)?.id || assistants?.[0]?.id || '');
  const [mode, setMode] = useState<'text' | 'file' | 'matrix'>(source ? initial.matrix ? 'matrix' : 'text' : 'file'), [name, setName] = useState(source?.name || ''), [type, setType] = useState<KnowledgeFormat>(initial.format), [text, setText] = useState(source?.content || '');
  const [file, setFile] = useState<File | null>(null), [fileText, setFileText] = useState(''), [fileType, setFileType] = useState<KnowledgeFormat>('md'), [reading, setReading] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const [headers, setHeaders] = useState(initial.matrix?.headers || ['Tema', 'Pregunta', 'Respuesta', 'Etiquetas']), [rows, setRows] = useState(initial.matrix?.rows || [['', '', '', '']]);
  const [matrixFormat, setMatrixFormat] = useState<'csv' | 'tsv'>(initial.format === 'csv' ? 'csv' : 'tsv'), [matrixOriginal, setMatrixOriginal] = useState<string | null>(initial.matrix ? source!.content : null);
  const [query, setQuery] = useState(''), [probe, setProbe] = useState('');
  const readingVersion = useRef(0);
  const content = mode === 'file' && file ? fileText : mode === 'matrix' ? matrixOriginal ?? serializeMatrix(headers, rows, matrixFormat) : text;
  const format = mode === 'file' && file ? fileType : mode === 'matrix' ? matrixFormat : type;
  const parsed = useMemo(() => { try { return { value: parseKnowledge(content, format), error: '' }; } catch (e) { return { value: null, error: (e as Error).message }; } }, [content, format]);
  const busy = working || saving || reading;
  const changed = !source || name.trim() !== source.name || parsed.value?.content !== source.content || format !== source.type;
  useEffect(() => { onBusy?.(busy); }, [busy, onBusy]);
  useEffect(() => () => { onBusy?.(false); }, [onBusy]);
  const matches = probe && parsed.value ? retrieve(probe, [{ name: name || 'Fuente en preparación', content, type: format }]) : [];
  function editHeaders(update: SetStateAction<string[]>) { setMatrixOriginal(null); setHeaders(update); }
  function editRows(update: SetStateAction<string[][]>) { setMatrixOriginal(null); setRows(update); }
  function switchMode(next: 'text' | 'file' | 'matrix') {
    if (next === mode) return;
    if (next === 'text' || next === 'file') { setText(content); setType(format); }
    if (next === 'matrix' && (format === 'csv' || format === 'tsv')) {
      if (!parsed.value) { setError(parsed.error); return; }
      const matrix = parsed.value.matrices[0];
      setHeaders(matrix.headers); setRows(matrix.rows); setMatrixFormat(format); setMatrixOriginal(content);
    }
    if (next === 'file') { setFile(null); setFileText(''); }
    setMode(next); setError(''); setProbe('');
  }
  async function selectFile(next?: File) {
    const version = ++readingVersion.current;
    setFile(null); setFileText(''); setError(''); setProbe('');
    if (!next) return;
    setReading(true);
    try {
      if (next.size > 1_000_000) throw new Error('El archivo supera 1 MB. Divide la información en varias fuentes.');
      const nextType = knowledgeFileFormat(next.name);
      let value: string;
      try { value = new TextDecoder('utf-8', { fatal: true }).decode(await next.arrayBuffer()); } catch { throw new Error('Guarda el archivo como texto UTF-8 e intenta de nuevo.'); }
      parseKnowledge(value, nextType);
      if (version !== readingVersion.current) return;
      setFile(next); setFileText(value); setFileType(nextType); if (!source) setName(next.name);
    } catch (e) { if (version === readingVersion.current) setError((e as Error).message); }
    finally { if (version === readingVersion.current) setReading(false); }
  }
  return <form className="form-stack knowledge-import" onSubmit={async event => {
    event.preventDefault(); setError('');
    if (!parsed.value) { setError(parsed.error); return; }
    setSaving(true);
    try {
      if (mode === 'file') { if (!file) throw new Error('Selecciona un archivo.'); const form = new FormData(); form.set('assistantId', selectedAssistant); form.set('name', name.trim()); form.set('file', file); if (source) form.set('revision', source.revision); await save(form); }
      else await save({ assistantId: selectedAssistant, name: name.trim(), type: format, content, ...(source ? { revision: source.revision } : {}) });
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  }}>
    {!assistantId && <label>Asistente<select value={selectedAssistant} onChange={event => setSelectedAssistant(event.target.value)} disabled={busy}>{assistants?.map(item => <option key={item.id} value={item.id}>{companyFor?.(item.company_id)?.name} · {item.name}</option>)}</select></label>}
    <div className="segmented knowledge-import-modes" role="group" aria-label="Cómo agregar conocimiento">{([{ id: 'file', title: source ? 'Reemplazar archivo' : 'Subir archivo', icon: Upload }, { id: 'text', title: source ? 'Editar texto o MD' : 'Pegar texto o MD', icon: FileText }, { id: 'matrix', title: source ? 'Editar matriz' : 'Crear matriz', icon: Table2 }] as const).filter(item => item.id !== 'matrix' || !source || format === 'csv' || format === 'tsv').map(item => <button key={item.id} type="button" disabled={busy} className={mode === item.id ? 'selected' : ''} aria-pressed={mode === item.id} onClick={() => switchMode(item.id)}><item.icon size={15} />{item.title}</button>)}</div>
    {mode === 'file' && <label className="upload-zone"><Upload size={26} /><strong>{reading ? 'Leyendo archivo local…' : file?.name || 'Elige un documento o una matriz'}</strong><span>MD, MARKDOWN, TXT, CSV, TSV o JSON · UTF-8 · hasta 1 MB</span><input type="file" aria-label="Archivo de conocimiento" accept=".md,.markdown,.txt,.csv,.tsv,.json" disabled={busy} onChange={event => selectFile(event.target.files?.[0])} /></label>}
    <label>Título de la fuente<input required value={name} disabled={busy} maxLength={160} placeholder="Ej. Matriz de atención o preguntas frecuentes" onChange={event => setName(event.target.value)} /></label>
    {source && <section className="knowledge-edit-comparison form-stack" aria-label="Comparación de cambios"><div><h4>{changed ? 'Cambios pendientes de guardar' : 'Sin cambios en esta fuente'}</h4><p>Se actualizará esta misma fuente en su empresa y asistente. Cancelar conserva la versión guardada.</p></div><div className="knowledge-version-meta"><span><strong>Guardado</strong>{source.name} · {source.type.toUpperCase()}</span><span><strong>Borrador</strong>{name || 'Sin título'} · {format.toUpperCase()}</span></div><details><summary>Comparar contenido guardado y borrador</summary><div className="knowledge-version-columns"><section><h4>Versión guardada</h4><pre>{source.content}</pre></section><section><h4>Vista previa de cambios</h4><pre>{content}</pre></section></div></details>{source.type === 'md' && <small>Las tablas Markdown se editan en el texto para conservar el documento completo.</small>}</section>}
    {mode === 'text' && <><label>Formato del contenido<select value={type} onChange={event => { setType(event.target.value as KnowledgeFormat); setProbe(''); }} disabled={busy}><option value="md">Markdown · texto y tablas</option><option value="text">Texto simple</option><option value="txt">Archivo TXT</option><option value="csv">Matriz CSV</option><option value="tsv">Matriz TSV</option><option value="json">JSON</option></select></label><label>Contenido de conocimiento<textarea required value={text} rows={8} maxLength={500000} disabled={busy} onChange={event => { setText(event.target.value); setProbe(''); }} placeholder={'# Conocimiento de tu empresa\n\n## Preguntas frecuentes\n\n| Pregunta | Respuesta |\n| --- | --- |\n| ¿Cómo contacto al negocio? | Escribe aquí la respuesta aprobada. |'} /></label></>}
    {mode === 'matrix' && <section className="knowledge-matrix-editor form-stack" aria-label="Editor de matriz de conocimiento"><p className="field-help">Escribe un encabezado por columna y una idea por fila. Puedes adaptar los nombres a tu negocio.</p><div className="table-scroll"><table><thead><tr>{headers.map((header, column) => <th key={column}><input value={header} aria-label={'Nombre de columna ' + (column + 1)} maxLength={120} disabled={busy} onChange={event => editHeaders(current => current.map((value, index) => index === column ? event.target.value : value))} /><button type="button" className="icon-button danger" disabled={busy || headers.length <= 2} aria-label={'Quitar columna ' + (column + 1)} onClick={() => { editHeaders(current => current.filter((_, index) => index !== column)); editRows(current => current.map(row => row.filter((_, index) => index !== column))); }}><Trash2 size={12} /></button></th>)}<th /></tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, column) => <td key={column}><textarea value={cell} aria-label={`Fila ${rowIndex + 1}, ${headers[column] || 'columna ' + (column + 1)}`} disabled={busy} rows={2} maxLength={12000} onChange={event => editRows(current => current.map((value, index) => index === rowIndex ? value.map((text, col) => col === column ? event.target.value : text) : value))} /></td>)}<td><button type="button" className="icon-button danger" disabled={busy || rows.length === 1} aria-label={'Quitar fila ' + (rowIndex + 1)} onClick={() => editRows(current => current.filter((_, index) => index !== rowIndex))}><Trash2 size={14} /></button></td></tr>)}</tbody></table></div><div className="knowledge-actions"><Button disabled={busy || rows.length >= 1000} onClick={() => editRows(current => [...current, headers.map(() => '')])}><Plus size={13} />Fila</Button><Button disabled={busy || headers.length >= 32} onClick={() => { let index = headers.length + 1; while (headers.includes('Columna ' + index)) index++; editHeaders(current => [...current, 'Columna ' + index]); editRows(current => current.map(row => [...row, ''])); }}><Plus size={13} />Columna</Button></div></section>}
    <div className="knowledge-template-links"><a href="/templates/matriz-conocimiento.tsv" download>Plantilla TSV</a><a href="/templates/conocimiento.md" download>Plantilla Markdown</a><span>Hasta 1000 filas y 32 columnas por fuente. CSV admite coma o punto y coma.</span></div>
    {error && <div className="notice error" role="alert">{error}</div>}
    {content && !parsed.value && !error && <p className="notice error" role="status">{parsed.error}</p>}
    {parsed.value && <section className="knowledge-import-preview form-stack" aria-label="Vista previa del conocimiento"><div><h4>Vista previa antes de guardar</h4><p>{parsed.value.format.toUpperCase()} · {parsed.value.matrices.length} {parsed.value.matrices.length === 1 ? 'tabla' : 'tablas'} · {parsed.value.rowCount} {parsed.value.rowCount === 1 ? 'fila' : 'filas'} · {parsed.value.segments.length} {parsed.value.segments.length === 1 ? 'fragmento' : 'fragmentos'} para consulta</p></div>{parsed.value.matrices.map((matrix, index) => <div key={index}><strong>{matrix.label}</strong><div className="table-scroll"><table><thead><tr>{matrix.headers.map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{matrix.rows.slice(0, 8).map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, column) => <td key={column}>{cell}</td>)}</tr>)}</tbody></table></div>{matrix.rows.length > 8 && <small>Se muestran 8 de {matrix.rows.length} filas. Se guardarán todas.</small>}</div>)}<details><summary>Ver fragmentos que consultará el chat</summary>{parsed.value.segments.slice(0, 4).map((segment, index) => <pre key={index}>{segment}</pre>)}{parsed.value.segments.length > 4 && <small>Se muestran los primeros cuatro fragmentos.</small>}</details><label>Probar una consulta sin IA<input value={query} onChange={event => setQuery(event.target.value)} maxLength={500} placeholder="Ej. ¿Cómo puedo contactar al negocio?" /></label><Button disabled={!query.trim()} onClick={() => setProbe(query.trim())}>Buscar en esta vista previa</Button>{probe && <div className="knowledge-probe-results" role="status">{matches.length ? matches.map((match, index) => <article key={index}><strong>{match.name}</strong><pre>{match.content}</pre></article>) : <p>No se encontraron coincidencias. Ajusta el contenido o la consulta.</p>}</div>}</section>}
    <p className="field-help">Se guardará únicamente en el asistente elegido. Las celdas, enlaces y Markdown se tratan como texto. Importar y buscar no consumen IA.</p>
    <div className="form-actions"><Button disabled={busy} onClick={close}>Cancelar</Button><Button kind="primary" type="submit" disabled={busy || !parsed.value || !selectedAssistant || !name.trim() || !changed || (mode === 'file' && !file)}>{busy ? <LoaderCircle size={15} className="spin" /> : <Plus size={15} />}{source ? 'Actualizar conocimiento' : 'Guardar conocimiento'}</Button></div>
  </form>;
}
