'use client';

import Link from 'next/link';
import { LogIn, LogOut, Shield } from 'lucide-react';
import { useEffect, useState } from 'react';

const LEGACY_KEY = 'monitor-ritapolis-admin-mode';

export default function AuthControl() {
  const [state, setState] = useState({ ready: false, authenticated: false, user: null });

  useEffect(() => {
    window.localStorage.removeItem(LEGACY_KEY);
    fetch('/api/auth/session', { cache: 'no-store' })
      .then((r) => r.json())
      .then((body) => {
        const authed = Boolean(body?.authenticated);
        document.documentElement.classList.toggle('admin-mode', authed);
        setState({ ready: true, authenticated: authed, user: body?.user || null });
      })
      .catch(() => {
        document.documentElement.classList.remove('admin-mode');
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
