'use client';

import Link from 'next/link';
import { Shield, ShieldOff } from 'lucide-react';
import { useEffect, useState } from 'react';

const storageKey = 'monitor-ritapolis-admin-mode';

export default function AdminModeToggle() {
  const [enabled, setEnabled] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey) === 'true';
    setEnabled(saved);
    setMounted(true);
    document.documentElement.dataset.adminMode = saved ? 'on' : 'off';
  }, []);

  function toggleAdminMode() {
    const next = !enabled;
    setEnabled(next);
    window.localStorage.setItem(storageKey, String(next));
    document.documentElement.dataset.adminMode = next ? 'on' : 'off';
  }

  if (!mounted) {
    return (
      <div className="admin-mode-control" aria-label="Modo admin">
        <button type="button" className="admin-mode-button" disabled>
          <ShieldOff size={16} />
          Admin
        </button>
      </div>
    );
  }

  return (
    <div className="admin-mode-control" aria-label="Modo admin">
      {enabled ? (
        <Link href="/admin" className="admin-mode-link">
          Admin
        </Link>
      ) : null}
      <button
        type="button"
        className="admin-mode-button"
        aria-pressed={enabled}
        onClick={toggleAdminMode}
        title={enabled ? 'Desativar modo admin' : 'Ativar modo admin'}
      >
        {enabled ? <Shield size={16} /> : <ShieldOff size={16} />}
        {enabled ? 'Admin ativo' : 'Admin'}
      </button>
    </div>
  );
}
