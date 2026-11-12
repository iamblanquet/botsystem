'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Crop, ImagePlus, LoaderCircle, Upload, UserRound, X } from 'lucide-react';
import { api } from '@/lib/types';
import { readAvatar } from '@/lib/prepare-avatar';
import AvatarCropEditor, { type AvatarSource } from './avatar-crop-editor';
type ImageAsset = { id: string; name: string; url: string; bytes: number; width: number; height: number };
const editableUrl = (url: string) => /^\/api\/assets\/[a-f\d-]{36}$/i.test(url) || (/^\/demo-assets\/[a-zA-Z0-9_./-]+$/.test(url) && !url.includes('..'));
export default function AvatarUpload({ assistantId, selectedUrl, savedUrl, choose, onBusy, onPreview, target = 'avatar', disabled = false }: { assistantId: string; selectedUrl: string; savedUrl: string; choose: (url: string) => void; onBusy: (busy: boolean) => void; onPreview: (url: string | null) => void; target?: 'avatar' | 'launcher'; disabled?: boolean }) {
  const [images, setImages] = useState<ImageAsset[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [source, setSource] = useState<AvatarSource | null>(null), [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null), controller = useRef<AbortController | null>(null), mounted = useRef(true), sourceRef = useRef<AvatarSource | null>(null);
  const showPreview = useCallback((url: string | null) => { setPreviewUrl(url); onPreview(url); }, [onPreview]);
  function closeEditor() {
    controller.current?.abort(); controller.current = null;
    sourceRef.current?.bitmap.close(); sourceRef.current = null;
    setSource(null); setBusy(false); showPreview(null); onBusy(false);
  }
  useEffect(() => {
    mounted.current = true;
    api('/assistants/' + assistantId + '/avatar').then(data => { if (mounted.current) setImages(data.images); }).catch(e => { if (mounted.current) setError(e.message); });
    return () => { mounted.current = false; controller.current?.abort(); sourceRef.current?.bitmap.close(); sourceRef.current = null; onPreview(null); onBusy(false); };
  }, [assistantId, onBusy, onPreview]);
  async function openEditor(file?: File, localUrl?: string) {
    if ((!file && !localUrl) || busy || sourceRef.current || disabled) return;
    const operation = new AbortController(); controller.current = operation;
    setBusy(true); onBusy(true); setError(''); setMessage('');
    try {
      if (localUrl) {
        if (!editableUrl(localUrl)) throw new Error('Para recortar una imagen externa, súbela desde tu equipo.');
        const response = await fetch(localUrl, { redirect: 'error', cache: 'no-store', signal: AbortSignal.any([operation.signal, AbortSignal.timeout(15000)]) });
        if (!response.ok) throw new Error('No se pudo abrir la imagen local.');
        const blob = await response.blob();
        const name = images.find(x => x.url === localUrl)?.name || 'avatar.png';
        file = new File([blob], /\.(png|jpe?g|webp)$/i.test(name) ? name : name + '.png', { type: blob.type });
      }
      const bitmap = await readAvatar(file!);
      if (operation.signal.aborted || !mounted.current) { bitmap.close(); return; }
      const next = { bitmap, name: file!.name }; sourceRef.current = next; setSource(next);
    } catch (e) {
      if (mounted.current && !operation.signal.aborted) setError((e as Error).message);
    } finally {
      if (mounted.current && controller.current === operation) { setBusy(false); onBusy(!!sourceRef.current); }
      if (input.current) input.current.value = '';
    }
  }
  async function applyCrop(file: File) {
    if (!sourceRef.current || busy) return;
    const operation = new AbortController(); controller.current = operation;
    const name = sourceRef.current.name.replace(/ · recorte(?:\.png)?$/, '') + ' · recorte';
    setBusy(true); setError('');
    try {
      const form = new FormData(); form.set('file', file); form.set('name', name);
      const response = await fetch('/api/assistants/' + assistantId + '/avatar', { method: 'POST', body: form, signal: AbortSignal.any([operation.signal, AbortSignal.timeout(25000)]) });
      const data = await response.json() as { image: ImageAsset; error?: string };
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar la imagen local.');
      if (!mounted.current || operation.signal.aborted) return;
      setImages(current => [data.image, ...current.filter(x => x.id !== data.image.id)]);
      choose(data.image.url); closeEditor();
      setMessage('Recorte listo en la vista previa. Pulsa «Guardar cambios» para aplicarlo al chat.');
    } catch (e) {
      if (mounted.current && !operation.signal.aborted) setError((e as Error).name === 'TimeoutError' ? 'La carga tardó demasiado. Intenta de nuevo.' : (e as Error).message);
    } finally {
      if (mounted.current && controller.current === operation) { setBusy(false); onBusy(!!sourceRef.current); }
    }
  }
  const selected = images.find(x => x.url === selectedUrl), locked = busy || !!source || disabled, launcher = target === 'launcher';
  const statusMessage = message && selectedUrl === savedUrl ? selectedUrl ? launcher ? 'Logo aplicado al botón guardado.' : 'Imagen aplicada al chat guardado.' : launcher ? 'El botón guardado usa el icono elegido.' : 'El chat guardado usa el icono del asistente.' : message;
  const canEdit = editableUrl(selectedUrl);
  return <section className="avatar-upload" aria-label={launcher ? 'Cargar logo del botón flotante' : 'Cargar logo o avatar'}>
    <div className="avatar-upload-current"><span className="avatar-upload-thumb">{previewUrl || selectedUrl ? <img src={previewUrl || selectedUrl} alt="Logo o avatar seleccionado" referrerPolicy="no-referrer" /> : <UserRound size={27} />}</span><div><strong>{source?.name || selected?.name || (selectedUrl ? 'Imagen seleccionada' : 'Logo o avatar de tu empresa')}</strong><p>{source ? 'Edición local · encuadre de 512 × 512 px' : selected ? `${selected.width} × ${selected.height} px · ${(selected.bytes / 1024).toFixed(1)} KB` : 'Selecciona una imagen de tu equipo para verla en el chat.'}</p></div></div>
    <div className="avatar-upload-actions"><input ref={input} type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" aria-label={launcher ? 'Archivo de logo del botón flotante' : 'Archivo de logo o avatar'} hidden onChange={e => openEditor(e.target.files?.[0])} /><button type="button" className="button" disabled={locked} onClick={() => input.current?.click()}>{busy ? <LoaderCircle size={15} className="spin" /> : <Upload size={15} />}{busy ? 'Preparando imagen…' : launcher ? 'Subir logo del botón' : 'Subir desde mi equipo'}</button>{!source && busy ? <button type="button" className="button ghost" onClick={closeEditor}><X size={14} />Cancelar carga</button> : selectedUrl && !source && <><button type="button" className="button" disabled={!canEdit || locked} onClick={() => openEditor(undefined, selectedUrl)}><Crop size={14} />Editar recorte</button><button type="button" className="button ghost" disabled={locked} onClick={() => { choose(''); setMessage('Imagen retirada de la vista previa. Guarda para aplicar el cambio.'); setError(''); }}>{launcher ? 'Quitar logo del botón' : 'Usar solo el icono'}</button></>}</div>
    <p className="avatar-upload-help">PNG, JPG o WebP · hasta 2 MB. Recorta, centra y ajusta el zoom antes de guardar la copia local. La transparencia se conserva.</p>
    {source && <AvatarCropEditor source={source} busy={busy} preview={showPreview} apply={applyCrop} cancel={() => { closeEditor(); setError(''); setMessage('Edición cancelada. Se conserva la imagen anterior.'); }} />}
    {!source && busy && <p role="status" className="avatar-upload-status">Preparando la imagen local…</p>}{error && <div className="notice error" role="alert">{error}</div>}{!source && statusMessage && <div className="notice success" role="status"><Check size={14} />{statusMessage}</div>}
    {images.length > 0 && <details className="avatar-library"><summary><ImagePlus size={14} />Imágenes de esta empresa ({images.length})</summary><div>{images.map(image => <button key={image.id} type="button" disabled={locked} onClick={() => { choose(image.url); setMessage('Imagen seleccionada. Guarda para aplicarla al chat.'); setError(''); }} aria-label={'Usar ' + image.name} aria-pressed={image.url === selectedUrl} title={image.name}><img src={image.url} alt="" loading="lazy" />{image.url === selectedUrl && <Check size={13} />}<span>{image.name}</span></button>)}</div></details>}
  </section>;
}
