'use client';
import { useState, type CSSProperties, type ReactNode } from 'react';
import type { Assistant, Company } from '@/lib/types';
import { launcherPresentation } from '@/lib/launcher';
import ChatLauncher from './chat-launcher';

export default function LauncherPreview({ draft, company, logoPreviewUrl, children }: { draft: Assistant; company: Company; logoPreviewUrl: string | null; children: ReactNode }) {
  const [open, setOpen] = useState(false), design = launcherPresentation(draft.theme, draft.color);
  return <div className="launcher-preview-site" style={{ background: draft.theme.background, color: draft.theme.text }}>
    <div className="launcher-preview-content" aria-hidden="true"><strong>{company.name}</strong><div className="launcher-preview-rule" /><h3>Tu sitio, tu identidad.</h3><p>El asistente está a un clic de distancia.</p><div className="launcher-preview-blocks"><i /><i /><i /></div></div>
    {open && <div className="launcher-preview-panel" style={{ ...design.panelStyle, borderRadius: draft.theme.radius, borderColor: draft.theme.border, background: draft.theme.background } as CSSProperties}>{children}</div>}
    <ChatLauncher theme={draft.theme} color={draft.color} name={draft.name} open={open} onToggle={() => setOpen(value => !value)} preview logoPreviewUrl={logoPreviewUrl} />
  </div>;
}
