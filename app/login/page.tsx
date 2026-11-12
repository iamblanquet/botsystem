import LoginForm from '@/components/login-form';
import './login.css';
import { adminConfig, safeReturnPath } from '@/lib/admin-security.mjs';

export const dynamic = 'force-dynamic';
export default async function Login({ searchParams }: { searchParams: Promise<{ return_to?: string }> }) {
  const params = await searchParams;
  return <main className="login-shell"><section className="login-card">
    <a className="login-brand" href="/">✦ nexo.</a>
    <h1>Tu centro de operaciones</h1><p>Administra empresas, asistentes y conocimiento desde un solo lugar.</p>
    <LoginForm configured={!!adminConfig()} returnTo={safeReturnPath(params.return_to || '/')} />
  </section></main>;
}
