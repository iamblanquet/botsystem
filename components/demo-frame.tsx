'use client';
import { useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import type { DemoAssistant } from '@/lib/demo-types';
export type DemoPrefill = { message: string; sequence: number } | null;
export default function DemoFrame({ assistant, prefill, onProduct }: { assistant: DemoAssistant; prefill?: DemoPrefill; onProduct?: (id: string) => void }) {
  const frame = useRef<HTMLIFrameElement>(null), pending = useRef<string | null>(prefill?.message || null), connected = useRef(false), callback = useRef(onProduct);
  const [ready, setReady] = useState(false);
  callback.current = onProduct;
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow || event.data?.assistantId !== assistant.id) return;
      if (event.data.type === 'nexo:ready') frame.current?.contentWindow?.postMessage({ type: 'nexo:init' }, window.location.origin);
      if (event.data.type === 'nexo:connected') {
        connected.current = true; setReady(true);
        if (pending.current) { frame.current?.contentWindow?.postMessage({ type: 'nexo:prefill', message: pending.current }, window.location.origin); pending.current = null; }
      }
      if (event.data.type === 'nexo:product-selected' && typeof event.data.productId === 'string' && event.data.productId.length <= 120) callback.current?.(event.data.productId);
    };
    window.addEventListener('message', handler);
    // An SSR iframe can finish loading before React attaches onLoad. Initialize after hydration too.
    frame.current?.contentWindow?.postMessage({ type: 'nexo:init' }, window.location.origin);
    return () => window.removeEventListener('message', handler);
  }, [assistant.id]);
  useEffect(() => {
    if (!prefill) return;
    if (connected.current) frame.current?.contentWindow?.postMessage({ type: 'nexo:prefill', message: prefill.message }, window.location.origin);
    else pending.current = prefill.message;
  }, [prefill]);
  return <div className="d-frame-wrap" style={{ background: assistant.theme.background, height: `min(${assistant.theme.height}px,calc(100dvh - 180px))`, minHeight: 360 }} data-connected={ready ? 'true' : 'false'}>
    {!ready && <div className="d-frame-loading"><LoaderCircle size={20} className="spin" />Conectando con {assistant.name}…</div>}
    <iframe ref={frame} className="d-iframe" style={{ background: assistant.theme.background }} src={'/embed/' + encodeURIComponent(assistant.id)} title={'Chat de ' + assistant.name} data-testid="pilot-chat-iframe" onLoad={() => frame.current?.contentWindow?.postMessage({ type: 'nexo:init' }, window.location.origin)} />
  </div>;
}
