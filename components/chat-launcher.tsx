'use client';
import { useState, type CSSProperties } from 'react';
import { BookOpen, MessageCircle, Sparkles, Wine, X } from 'lucide-react';
import type { ChatTheme } from '@/lib/appearance';
import { launcherPresentation } from '@/lib/launcher';

export default function ChatLauncher({ theme, color, name, open, onToggle, preview = false, logoPreviewUrl }: { theme: ChatTheme; color: string; name: string; open: boolean; onToggle: () => void; preview?: boolean; logoPreviewUrl?: string | null }) {
  const design = launcherPresentation(theme, color), logo = logoPreviewUrl || design.logo;
  const [failedLogo, setFailedLogo] = useState('');
  const Icon = { sparkles: Sparkles, book: BookOpen, wine: Wine, message: MessageCircle }[design.icon];
  return <button type="button" className="chat-launcher" style={{ ...design.buttonStyle, position: preview ? 'absolute' : 'fixed', background: design.background, color: design.foreground } as CSSProperties} onClick={onToggle} aria-label={(open ? 'Cerrar chat de ' : 'Abrir chat de ') + name} aria-expanded={open} title={(open ? 'Cerrar chat de ' : 'Abrir chat de ') + name}>
    {open ? <X size={Math.round(design.size * .42)} /> : logo && failedLogo !== logo ? <img className="chat-launcher-logo" src={logo} alt="" referrerPolicy="no-referrer" onError={() => setFailedLogo(logo)} /> : <Icon size={Math.round(design.size * .42)} />}
  </button>;
}
