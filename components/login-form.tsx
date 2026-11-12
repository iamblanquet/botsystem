'use client';
import { useState } from 'react';

export default function LoginForm({ configured, returnTo }: { configured: boolean; returnTo: string }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'No se pudo iniciar sesión.');
      window.location.assign(returnTo);
    } catch (cause) { setError((cause as Error).message); setBusy(false); }
  }
  if (!configured) return <div role="status" className="notice error">Falta configurar el acceso administrativo del despliegue. Consulta la guía de instalación del proyecto.</div>;
  return <form onSubmit={submit} className="login-form">
    <label>Correo electrónico<input name="email" type="email" autoComplete="username" required maxLength={254} /></label>
    <label>Contraseña<input name="password" type="password" autoComplete="current-password" required maxLength={256} /></label>
    {error && <p role="alert" className="notice error">{error}</p>}
    <button type="submit" disabled={busy}>{busy ? 'Iniciando sesión…' : 'Entrar a la plataforma'}</button>
  </form>;
}
