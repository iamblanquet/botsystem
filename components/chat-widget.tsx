'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, RotateCcw, Sparkles, ExternalLink, LoaderCircle, MessageCircle, BookOpen, Wine, Check, GitBranch, ArrowLeft } from 'lucide-react';
import { fontFamilies, resolveTheme, type ChatTheme } from '@/lib/appearance';
import { api, usd, type Assistant } from '@/lib/types';
import type { FlowView } from '@/lib/flows';
type Bot = Pick<Assistant, 'id' | 'name' | 'subtitle' | 'color' | 'welcome' | 'suggestions' | 'mode'> & { theme?: ChatTheme; flows?: { id: string; name: string; intro: string }[] };
type Message = { role: string; content: string; sources?: string[]; cost?: number; closing?: string; recommendations?: { id: string; name: string; price: number | null; url: string; description: string; matchedTags: string[] }[]; products?: { id: string; name: string; price: number; currency: string }[] };
export default function ChatWidget({ assistantId, preview, draft, onActivity, avatarPreviewUrl }: { assistantId: string; preview?: boolean; draft?: Bot; onActivity?: () => void; avatarPreviewUrl?: string | null }) {
  const [bot, setBot] = useState<Bot | null>(draft || null), [messages, setMessages] = useState<Message[]>([]), [text, setText] = useState(''), [session, setSession] = useState<string>(), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const bottom = useRef<HTMLDivElement>(null), parentOrigin = useRef<string | null>(null);
  const [flows, setFlows] = useState<NonNullable<Bot['flows']>>([]), [flow, setFlow] = useState<FlowView | null>(null), [flowValue, setFlowValue] = useState('');
  const [imageFailed, setImageFailed] = useState(false);
  const theme = resolveTheme(bot?.theme, bot?.color);
  const imageUrl = preview && avatarPreviewUrl?.startsWith('blob:') ? avatarPreviewUrl : theme.avatarUrl;
  const showAvatar = theme.avatar !== 'none' || !!(preview && avatarPreviewUrl);
  useEffect(() => { setImageFailed(false); }, [imageUrl]);
  const AvatarIcon = ({ book: BookOpen, wine: Wine, message: MessageCircle, sparkles: Sparkles, none: MessageCircle })[theme.avatar];
  const avatar = (size: number) => imageUrl && !imageFailed ? <img src={imageUrl} alt="" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} /> : <AvatarIcon size={size} />;
  useEffect(() => {
    setSession(undefined); setMessages([]); setError(''); setText('');
    setFlow(null); setFlowValue('');
    if (draft) setBot(draft);
    let current = true;
    api('/widget/' + assistantId).then(b => { if (current) { if (!draft) setBot(b); setFlows(b.flows || []); } }).catch(e => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [assistantId]);
  useEffect(() => { if (draft) setBot(draft); }, [draft]);
  useEffect(() => {
    const listener = async (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      if (event.data?.type === 'nexo:prefill' && event.origin === parentOrigin.current && typeof event.data.message === 'string') {
        setText(event.data.message.slice(0, 2500));
        return;
      }
      if (event.data?.type !== 'nexo:init') return;
      try {
        const config = await api('/widget/' + assistantId);
        if (config.origins.includes(event.origin) || event.origin === window.location.origin) {
          parentOrigin.current = event.origin;
          window.parent.postMessage({ type: 'nexo:connected', assistantId, appearance: { color: config.color, theme: config.theme, name: config.name } }, event.origin);
        }
      } catch { /* unavailable assistant */ }
    };
    window.addEventListener('message', listener);
    if (window.parent !== window) window.parent.postMessage({ type: 'nexo:ready', assistantId }, '*');
    return () => window.removeEventListener('message', listener);
  }, [assistantId]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [messages, busy, flow]);
  async function flowAction(action: 'start' | 'answer' | 'back' | 'cancel', value?: string, flowId?: string) {
    if (busy) return; setBusy(true); setError('');
    try {
      const response = await api('/flow', 'POST', { assistantId, conversationId: session, requestKey: crypto.randomUUID(), action, flowId, revision: flow?.revision, stepId: flow?.step?.id, value });
      setSession(response.conversationId); setFlow(response.flow); setFlowValue(''); setText('');
      const userMessage = action === 'start' ? flows.find(f => f.id === flowId)?.name : action === 'answer' ? flow?.step?.options.find(o => o.id === value)?.label || value || 'Sin preferencia' : action === 'back' ? 'Cambiar respuesta anterior' : 'Conversación libre';
      setMessages(m => [...m, { role: 'user', content: userMessage || 'Recorrido guiado' }, { role: 'assistant', content: response.displayAnswer || response.answer, closing: response.closing, products: response.products, recommendations: response.recommendations }]); onActivity?.();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function send(value = text) {
    if (!value.trim() || busy || !bot) return;
    setBusy(true); setError(''); setText('');
    if (flow?.status === 'active') { setBusy(false); setText(value); setError('Responde en el recorrido o elige «Conversación libre» para consultar a Gemini.'); return; }
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
  return <section className={'chat-widget themed density-' + theme.density + (!showAvatar ? ' without-avatar' : '')} style={{ '--bot-color': /^#[\da-f]{6}$/i.test(bot.color) ? bot.color : '#6b59df', '--chat-background': theme.background, '--chat-surface': theme.surface, '--chat-text': theme.text, '--chat-muted': theme.muted, '--chat-border': theme.border, '--chat-header-bg': theme.headerBackground, '--chat-header-text': theme.headerText, '--chat-assistant-bg': theme.assistantBackground, '--chat-assistant-text': theme.assistantText, '--chat-user-bg': theme.userBackground, '--chat-user-text': theme.userText, '--chat-button-text': theme.buttonText, '--chat-font': fontFamilies[theme.font], '--chat-font-size': theme.fontSize + 'px', '--chat-radius': theme.radius + 'px', '--chat-avatar-size': theme.avatarSize + 'px', '--chat-avatar-radius': theme.avatarShape === 'circle' ? '50%' : theme.avatarShape === 'square' ? '0px' : theme.avatarRadius + 'px', '--chat-small-avatar-radius': theme.avatarShape === 'circle' ? '50%' : theme.avatarShape === 'square' ? '0px' : Math.round(theme.avatarRadius * .6) + 'px', '--chat-avatar-border-width': theme.avatarBorderWidth + 'px', '--chat-avatar-border-color': theme.avatarBorderColor, '--chat-avatar-border-style': theme.avatarBorderStyle, '--chat-gap': theme.density === 'compact' ? '10px' : '16px' } as React.CSSProperties}>
    <header className="widget-header">{showAvatar && <span className="widget-avatar">{avatar(Math.round(theme.avatarSize * .58))}</span>}<div><strong>{bot.name}</strong>{theme.showSubtitle && <small><i />{bot.subtitle}</small>}</div><button className="widget-reset" title="Nueva conversación" aria-label="Nueva conversación" disabled={busy} onClick={() => { setMessages([]); setSession(undefined); setError(''); setFlow(null); setFlowValue(''); setText(''); }}><RotateCcw size={16} /></button></header>
    {bot.mode === 'demo' && <div className="demo-strip"><Sparkles size={12} /> Modo de prueba · sin llamadas a Gemini</div>}
    <div className="widget-messages" aria-live="polite">{theme.showDay && <div className="widget-day">HOY</div>}{theme.showWelcome && <div className="bubble-row"><span className="small-bot">{avatar(13)}</span><div className="bubble assistant">{bot.welcome}</div></div>}
      {(!messages.length || (flow && flow.status !== 'active')) && flows.length > 0 && <div className="widget-flow-launch">{theme.flowLabel && <small><GitBranch size={12} />{theme.flowLabel}</small>}{flows.map(f => <button key={f.id} disabled={busy} onClick={() => flowAction('start', undefined, f.id)}>{f.name}<span>→</span></button>)}</div>}
      {!messages.length && theme.showSuggestions && <div className="quick-replies">{bot.suggestions.filter(Boolean).map(s => <button key={s} onClick={() => send(s)} disabled={busy}>{s}<span>↗</span></button>)}</div>}
      {messages.map((m, i) => <div key={i}><div className={'bubble-row ' + (m.role === 'user' ? 'from-user' : '')}>{m.role === 'assistant' && <span className="small-bot">{avatar(13)}</span>}<div className={'bubble ' + m.role}>{m.content}</div></div>{m.sources?.length ? <div className="message-sources"><Check size={11} />{m.sources.length} fuente{m.sources.length > 1 ? 's' : ''} consultada{m.sources.length > 1 ? 's' : ''}</div> : null}{m.recommendations?.length ? <div className="widget-products widget-recommendations">{m.recommendations.map(p => <div key={p.id}><strong>{p.name}</strong><span>{p.price !== null ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(p.price) + ' MXN' : 'Precio por confirmar'}</span><p>{p.description || 'Ficha sin descripción confirmada.'}</p><small>{p.matchedTags.length ? 'Coincidencias: ' + p.matchedTags.join(', ') : 'Opción disponible; faltan afinidades confirmadas.'}</small>{m.products?.some(x => x.id === p.id) ? <button onClick={() => selectProduct(p)}>Elegir producto <ExternalLink size={12} /></button> : p.url ? <a href={p.url} target="_blank" rel="noreferrer">Ver más información <ExternalLink size={12} /></a> : null}</div>)}{m.closing && <p className="widget-result-note">{m.closing}</p>}</div> : m.products?.length ? <div className="widget-products">{m.products.map(p => <div key={p.id}><strong>{p.name}</strong><span>{Number.isFinite(p.price) ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(p.price) + ' MXN' : 'Precio por confirmar'}</span><button onClick={() => selectProduct(p)}>Elegir producto <ExternalLink size={12} /></button></div>)}</div> : null}{preview && m.cost ? <div className="message-sources">Consumo estimado: {usd(m.cost, true)} USD</div> : null}</div>)}
      {flow && flow.status !== 'cancelled' && <section className="widget-flow" aria-label="Recorrido guiado"><div className="widget-flow-heading"><GitBranch size={14} /><strong>{flow.name}</strong><span>{flow.progress}/{flow.total}</span></div><div className="widget-flow-progress"><i style={{ width: (flow.total ? flow.progress / flow.total * 100 : 0) + '%' }} /></div>{flow.step ? <><h3>{flow.step.question}</h3>{flow.step.type === 'choice' ? <div className="widget-flow-options">{flow.step.options.map(o => <button key={o.id} disabled={busy} onClick={() => flowAction('answer', o.id)}>{o.label}</button>)}</div> : <form onSubmit={e => { e.preventDefault(); flowAction('answer', flowValue); }}><label>{flow.step.type === 'number' ? 'Tu respuesta numérica' : 'Tu respuesta'}<input aria-label="Respuesta del recorrido" type={flow.step.type === 'number' ? 'number' : 'text'} min={flow.step.min} max={flow.step.max} step="any" maxLength={500} required={flow.step.required} value={flowValue} disabled={busy} onChange={e => setFlowValue(e.target.value)} /></label><button className="flow-next" type="submit" disabled={busy || (flow.step.required && !flowValue.trim())}>Continuar →</button></form>}{!flow.step.required && <button className="flow-link" disabled={busy} onClick={() => flowAction('answer', '')}>Omitir pregunta</button>}</> : <><strong className="flow-completed"><Check size={14} />Recorrido completado</strong><details className="flow-summary"><summary>Ver tus respuestas</summary>{flow.answers.map((a, i) => <p key={i}><b>{a.question}</b><br />{a.answer}</p>)}</details></>}<div className="widget-flow-actions">{(flow.progress > 1 || flow.status === 'completed') && <button disabled={busy} onClick={() => flowAction('back')}><ArrowLeft size={12} />Anterior</button>}{flow.status === 'active' && <button disabled={busy} onClick={() => flowAction('cancel')}>Conversación libre</button>}</div></section>}
      {busy && <div className="bubble-row"><span className="small-bot">{avatar(13)}</span><div className="bubble assistant thinking"><span /><span /><span /></div></div>}<div ref={bottom} />
    </div>
    {error && <div className="widget-error" role="alert">{error}</div>}
    <form className="widget-composer" onSubmit={e => { e.preventDefault(); send(); }}><input value={text} onChange={e => setText(e.target.value)} placeholder={flow?.status === 'active' ? 'Usa las preguntas del recorrido ↑' : theme.placeholder} aria-label="Mensaje para el asistente" maxLength={2500} disabled={busy || flow?.status === 'active'} /><button type="submit" disabled={!text.trim() || busy || flow?.status === 'active'} aria-label="Enviar mensaje">{busy ? <LoaderCircle size={17} className="spin" /> : <ArrowUp size={18} />}</button></form>
  </section>;
}
