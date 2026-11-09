'use client';
import { useEffect, type ReactNode } from 'react';
import { BookOpen, Building2, Database, Wine, X } from 'lucide-react';
import type { Company } from '@/lib/types';
export function Button({ children, onClick, kind = '', disabled, type = 'button', className = '' }: { children: ReactNode; onClick?: () => void; kind?: string; disabled?: boolean; type?: 'button' | 'submit'; className?: string }) {
  return <button type={type} onClick={onClick} disabled={disabled} className={`button ${kind} ${className}`}>{children}</button>;
}
export function Modal({ title, description, children, close, wide }: { title: string; description?: string; children: ReactNode; close: () => void; wide?: boolean }) {
  useEffect(() => { const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', fn); return () => window.removeEventListener('keydown', fn); }, [close]);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}><section className={'modal ' + (wide ? 'wide' : '')} role="dialog" aria-modal="true" aria-label={title}><button onClick={close} className="icon-button modal-close" aria-label="Cerrar"><X size={19} /></button><h2>{title}</h2>{description && <p className="muted">{description}</p>}{children}</section></div>;
}
export function CompanyAvatar({ company, small }: { company?: Company; small?: boolean }) { const wine = company?.website.includes('winetalia'); return <span className={`company-avatar ${wine ? 'wine' : 'book'} ${small ? 'small' : ''}`}>{wine ? <Wine size={small ? 17 : 24} /> : company?.website.includes('mmartinez') ? <BookOpen size={small ? 17 : 24} /> : <Building2 size={small ? 17 : 24} />}</span>; }
export function Empty({ icon: Icon = Database, title, text, action }: { icon?: typeof Database; title: string; text: string; action?: ReactNode }) { return <div className="empty-state"><span><Icon size={28} /></span><h3>{title}</h3><p>{text}</p>{action}</div>; }
