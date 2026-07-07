'use client';

import Link from 'next/link';
import { LogIn, LogOut, Shield } from 'lucide-react';
import { useEffect, useState } from 'react';

// admin-mode (classe que revela blocos .admin-only) agora segue a sessão real,
// não um toggle localStorage. ponytail: mantém o flag localStorage como OR só
// pra preview/E2E ativarem blocos internos sem login; conteúdo .admin-only é
// ruído interno, não segredo — proteção real é o middleware /admin + requireAdmin.
const LEGACY_KEY = 'monitor-ritapolis-admin-mode';

export default function AuthControl() {
  const [state, setState] = useState({ ready: false, authenticated: false, user: null });

  useEffect(() => {
    const legacy = window.localStorage.getItem(LEGACY_KEY) === 'true';
    fetch('/api/auth/session', { cache: 'no-store' })
      .then((r) => r.json())
      .then((body) => {
        const authed = Boolean(body?.authenticated);
        document.documentElement.classList.toggle('admin-mode', authed || legacy);
        setState({ ready: true, authenticated: authed, user: body?.user || null });
      })
      .catch(() => {
        document.documentElement.classList.toggle('admin-mode', legacy);
        setState({ ready: true, authenticated: false, user: null });
      });
  }, []);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST', cache: 'no-store' }).catch(() => null);
    document.documentElement.classList.remove('admin-mode');
    window.localStorage.removeItem(LEGACY_KEY);
    window.location.href = '/';
  }

  if (!state.ready) {
    return <div className="admin-mode-control" aria-hidden="true" />;
  }

  if (state.authenticated) {
    return (
      <div className="admin-mode-control">
        <Link href="/admin" className="admin-mode-link">
          <Shield size={16} /> Operação
        </Link>
        <button type="button" className="admin-mode-button" onClick={handleLogout} title="Sair">
          <LogOut size={16} /> Sair
        </button>
      </div>
    );
  }

  return (
    <div className="admin-mode-control">
      <Link href="/login" className="admin-mode-button" title="Entrar no painel">
        <LogIn size={16} /> Entrar
      </Link>
    </div>
  );
}
