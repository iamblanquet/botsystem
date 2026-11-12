'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, Focus, LoaderCircle, Minus, Move, Plus, RotateCcw, X } from 'lucide-react';
import { clamp, defaultAvatarCrop, type AvatarCrop } from '@/lib/avatar-crop';
import { drawAvatar, prepareAvatar } from '@/lib/prepare-avatar';
export type AvatarSource = { bitmap: ImageBitmap; name: string };
export default function AvatarCropEditor({ source, busy, preview, apply, cancel }: { source: AvatarSource; busy: boolean; preview: (url: string | null) => void; apply: (file: File) => Promise<void>; cancel: () => void }) {
  const [crop, setCrop] = useState<AvatarCrop>(defaultAvatarCrop), [exporting, setExporting] = useState(false), [error, setError] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null), drag = useRef<{ x: number; y: number; crop: AvatarCrop } | null>(null), generation = useRef(0), url = useRef<string | null>(null), alive = useRef(true), notify = useRef(preview);
  notify.current = preview;
  useEffect(() => { alive.current = true; return () => { alive.current = false; generation.current++; notify.current(null); if (url.current) URL.revokeObjectURL(url.current); }; }, []);
  useEffect(() => {
    const token = ++generation.current;
    try {
      if (!canvas.current) return;
      drawAvatar(canvas.current, source.bitmap, crop);
      canvas.current.toBlob(blob => {
        if (!blob || !alive.current || generation.current !== token) return;
        const previous = url.current; url.current = URL.createObjectURL(blob); notify.current(url.current);
        if (previous) URL.revokeObjectURL(previous);
      }, 'image/png');
    } catch (e) { setError((e as Error).message); }
  }, [source, crop]);
  const locked = busy || exporting;
  function change(patch: Partial<AvatarCrop>) { if (!locked) { setCrop(c => ({ ...c, ...patch })); setError(''); } }
  return <section className="avatar-crop-editor" aria-label="Editar recorte del avatar">
    <div className="avatar-crop-heading"><div><strong>Recorta y acomoda tu imagen</strong><p>{source.name}</p></div><span>Solo en este equipo</span></div>
    <div className="avatar-crop-modes"><button type="button" disabled={locked} aria-pressed={crop.mode === 'contain'} onClick={() => change({ mode: 'contain', zoom: 100, x: 0, y: 0 })}>Conservar logo completo</button><button type="button" disabled={locked} aria-pressed={crop.mode === 'cover'} onClick={() => change({ mode: 'cover', zoom: 100, x: 0, y: 0 })}>Recorte cuadrado</button></div>
    <div className={'avatar-crop-stage' + (locked ? ' is-locked' : '')} onPointerDown={e => { if (locked || e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, crop }; }} onPointerMove={e => { if (!drag.current || locked) return; const bounds = e.currentTarget.getBoundingClientRect(); change({ x: clamp(drag.current.crop.x + (e.clientX - drag.current.x) / bounds.width * 100, -100, 100), y: clamp(drag.current.crop.y + (e.clientY - drag.current.y) / bounds.height * 100, -100, 100) }); }} onPointerUp={e => { drag.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }} onPointerCancel={() => { drag.current = null; }}>
      <canvas ref={canvas} width={512} height={512} role="img" aria-label="Vista del recorte de la imagen" /><div className="avatar-crop-grid" aria-hidden="true"><i /><i /></div><span className="avatar-crop-hint"><Move size={13} />Arrastra para mover</span>
    </div>
    <div className="avatar-crop-controls"><label>Zoom · {Math.round(crop.zoom)}%<div className="avatar-zoom-row"><button type="button" disabled={locked || crop.zoom <= 25} aria-label="Reducir imagen" onClick={() => change({ zoom: clamp(crop.zoom - 10, 25, 400) })}><Minus size={14} /></button><input type="range" aria-label="Zoom de la imagen" min="25" max="400" step="1" value={crop.zoom} disabled={locked} onChange={e => change({ zoom: Number(e.target.value) })} /><button type="button" disabled={locked || crop.zoom >= 400} aria-label="Ampliar imagen" onClick={() => change({ zoom: clamp(crop.zoom + 10, 25, 400) })}><Plus size={14} /></button></div></label><label>Posición horizontal<input type="range" aria-label="Posición horizontal de la imagen" min="-100" max="100" step="1" value={crop.x} disabled={locked} onChange={e => change({ x: Number(e.target.value) })} /></label><label>Posición vertical<input type="range" aria-label="Posición vertical de la imagen" min="-100" max="100" step="1" value={crop.y} disabled={locked} onChange={e => change({ y: Number(e.target.value) })} /></label><div className="avatar-crop-tools"><button type="button" className="button ghost" disabled={locked} onClick={() => change({ x: 0, y: 0 })}><Focus size={14} />Centrar imagen</button><button type="button" className="button ghost" disabled={locked} onClick={() => { setCrop(defaultAvatarCrop()); setError(''); }}><RotateCcw size={14} />Restablecer</button></div></div>
    <p className="avatar-upload-help">El recorte aparece al instante en la vista previa del chat. Las zonas a cuadros quedarán transparentes. Aplica el recorte y después pulsa «Guardar cambios».</p>
    {error && <div className="notice error" role="alert">{error}</div>}
    <div className="avatar-crop-actions"><button type="button" className="button primary" disabled={locked} onClick={async () => { setExporting(true); setError(''); try { const file = await prepareAvatar(source.bitmap, source.name, crop); if (alive.current) await apply(file); } catch (e) { if (alive.current) setError((e as Error).message); } finally { if (alive.current) setExporting(false); } }}>{locked ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}{locked ? 'Guardando recorte…' : 'Aplicar recorte'}</button><button type="button" className="button ghost" onClick={cancel}><X size={14} />Cancelar edición</button></div>
  </section>;
}
