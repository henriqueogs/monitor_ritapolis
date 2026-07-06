'use client';

import { LogOut } from 'lucide-react';
import styles from './styles.module.css';

export default function LogoutButton() {
  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST', cache: 'no-store' }).catch(() => null);
    window.location.href = '/login';
  }

  return (
    <button className={styles.logoutButton} onClick={handleLogout} type="button">
      <LogOut size={16} aria-hidden="true" />
      Sair
    </button>
  );
}
