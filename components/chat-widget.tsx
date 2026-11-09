'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, RotateCcw, Sparkles, ExternalLink, LoaderCircle, MessageCircle, Check } from 'lucide-react';
import { api, usd, type Assistant } from '@/lib/types';
type Bot = Pick<Assistant, 'id' | 'name' | 'subtitle' | 'color' | 'welcome' | 'suggestions' | 'mode'>;
type Message = { role: string; content: string; sources?: string[]; cost?: number; products?: { id: string; name: string; price: number; currency: string }[] };
export default function ChatWidget({ assistantId, preview, draft, onActivity }: { assistantId: string; preview?: boolean; draft?: Bot; onActivity?: () => void }) {
  const [bot, setBot] = useState<Bot | null>(draft || null), [messages, setMessages] = useState<Message[]>([]), [text, setText] = useState(''), [session, setSession] = useState<string>(), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const bottom = useRef<HTMLDivElement>(null), parentOrigin = useRef<string | null>(null);
  useEffect(() => {
    setSession(undefined); setMessages([]); setError(''); setText('');
    if (draft) { setBot(draft); return; }
    let current = true;
    api('/widget/' + assistantId).then(b => { if (current) setBot(b); }).catch(e => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [assistantId]);
  useEffect(() => { if (draft) setBot(draft); }, [draft]);
  useEffect(() => {
    const listener = async (event: MessageEvent) => {
      if (event.source !== window.parent || event.data?.type !== 'nexo:init') return;
      try { const config = await api('/widget/' + assistantId); if (config.origins.includes(event.origin) || event.origin === window.location.origin) parentOrigin.current = event.origin; } catch { /* unavailable assistant */ }
    };
    window.addEventListener('message', listener);
    if (window.parent !== window) window.parent.postMessage({ type: 'nexo:ready', assistantId }, '*');
    return () => window.removeEventListener('message', listener);
  }, [assistantId]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [messages, busy]);
  async function send(value = text) {
    if (!value.trim() || busy || !bot) return;
    setBusy(true); setError(''); setText('');
    try {
      const response = await api('/chat', 'POST', { assistantId, message: value.trim(), conversationId: session, requestKey: crypto.randomUUID() });
      setSession(response.conversationId);
      setMessages(m => [...m, { role: 'user', content: value.trim() }, { role: 'assistant', content: response.answer, sources: response.sources, cost: response.cost, products: response.products }]);
      onActivity?.();
    } catch (e) { setError((e as Error).message); setText(value); } finally { setBusy(false); }
  }
  function selectProduct(product: any) {
    if (parentOrigin.current) window.parent.postMessage({ type: 'nexo:product-selected', assistantId, productId: product.id }, parentOrigin.current);
    else setError(preview ? 'La tarjeta enviará el producto al sitio mediante el evento nexo:product-selected.' : 'Abre este asesor desde el sitio para agregar productos a tu solicitud.');
  }
  if (!bot) return <div className="widget-loading">{error || <><LoaderCircle className="spin" size={22} /> Cargando asistente…</>}</div>;
  return <section className="chat-widget" style={{ '--bot-color': bot.color } as React.CSSProperties}>
    <header className="widget-header"><span className="widget-avatar"><Sparkles size={22} /></span><div><strong>{bot.name}</strong><small><i />{bot.subtitle}</small></div><button className="widget-reset" title="Nueva conversación" aria-label="Nueva conversación" disabled={busy} onClick={() => { setMessages([]); setSession(undefined); setError(''); }}><RotateCcw size={16} /></button></header>
    {bot.mode === 'demo' && <div className="demo-strip"><Sparkles size={12} /> Modo de prueba · sin llamadas a Gemini</div>}
    <div className="widget-messages" aria-live="polite"><div className="widget-day">HOY</div><div className="bubble-row"><span className="small-bot"><Sparkles size={13} /></span><div className="bubble assistant">{bot.welcome}</div></div>
      {!messages.length && <div className="quick-replies">{bot.suggestions.filter(Boolean).map(s => <button key={s} onClick={() => send(s)} disabled={busy}>{s}<span>↗</span></button>)}</div>}
      {messages.map((m, i) => <div key={i}><div className={'bubble-row ' + (m.role === 'user' ? 'from-user' : '')}>{m.role === 'assistant' && <span className="small-bot"><Sparkles size={13} /></span>}<div className={'bubble ' + m.role}>{m.content}</div></div>{m.sources?.length ? <div className="message-sources"><Check size={11} />{m.sources.length} fuente{m.sources.length > 1 ? 's' : ''} consultada{m.sources.length > 1 ? 's' : ''}</div> : null}{m.products?.length ? <div className="widget-products">{m.products.map(p => <div key={p.id}><strong>{p.name}</strong><span>{Number.isFinite(p.price) ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(p.price) + ' MXN' : 'Precio por confirmar'}</span><button onClick={() => selectProduct(p)}>Elegir producto <ExternalLink size={12} /></button></div>)}</div> : null}{preview && m.cost ? <div className="message-sources">Consumo estimado: {usd(m.cost, true)} USD</div> : null}</div>)}
      {busy && <div className="bubble-row"><span className="small-bot"><Sparkles size={13} /></span><div className="bubble assistant thinking"><span /><span /><span /></div></div>}<div ref={bottom} />
    </div>
    {error && <div className="widget-error" role="alert">{error}</div>}
    <form className="widget-composer" onSubmit={e => { e.preventDefault(); send(); }}><input value={text} onChange={e => setText(e.target.value)} placeholder="Escribe tu mensaje…" aria-label="Mensaje para el asistente" maxLength={2500} disabled={busy} /><button type="submit" disabled={!text.trim() || busy} aria-label="Enviar mensaje">{busy ? <LoaderCircle size={17} className="spin" /> : <ArrowUp size={18} />}</button></form>
    <footer className="widget-footer"><MessageCircle size={11} /> Impulsado por <b>nexo</b><span>·</span> IA con contexto</footer>
  </section>;
}
