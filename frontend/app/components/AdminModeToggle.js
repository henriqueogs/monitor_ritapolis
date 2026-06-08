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
      <div className="admin-mode-control" aria-label="Controles internos">
        <button type="button" className="admin-mode-button is-icon-only" disabled title="Controles internos">
          <ShieldOff size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="admin-mode-control" aria-label="Controles internos">
      {enabled ? (
        <Link href="/admin" className="admin-mode-link">
          Operacao
        </Link>
      ) : null}
      <button
        type="button"
        className={enabled ? 'admin-mode-button' : 'admin-mode-button is-icon-only'}
        aria-pressed={enabled}
        onClick={toggleAdminMode}
        title={enabled ? 'Desativar controles internos' : 'Ativar controles internos'}
      >
        {enabled ? <Shield size={16} /> : <ShieldOff size={16} />}
        {enabled ? 'Interno ativo' : null}
      </button>
    </div>
  );
}
