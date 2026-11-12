'use client';
import { useEffect } from 'react';
import type { ChatTheme } from '@/lib/appearance';

export default function SavedLauncherDemo({ assistantId, companyName, theme }: { assistantId: string; companyName: string; theme: ChatTheme }) {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = '/widget.js'; script.dataset.assistantId = assistantId; script.async = true;
    document.body.appendChild(script);
    return () => {
      script.remove();
      document.querySelectorAll('[data-nexo-launcher], [data-nexo-panel]').forEach(element => { if ((element as HTMLElement).dataset.nexoLauncher === assistantId || (element as HTMLElement).dataset.nexoPanel === assistantId) element.remove(); });
    };
  }, [assistantId]);
  return <main className="saved-launcher-demo" style={{ background: theme.background, color: theme.text, fontFamily: theme.font === 'serif' ? 'Georgia,serif' : 'Arial,sans-serif' }}>
    <nav><a href="/">Volver al panel</a><span>PRUEBA LOCAL · DISEÑO GUARDADO</span></nav>
    <section><p>{companyName}</p><h1>Tu asistente,<br />a un clic.</h1><p>Abre el botón flotante para probar el chat con la configuración guardada de esta empresa.</p><small>Esta página usa el script y el iframe de tu plataforma local. Los sitios originales permanecen intactos.</small></section>
  </main>;
}
