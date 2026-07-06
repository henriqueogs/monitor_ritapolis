'use client';

import { LogIn, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from './styles.module.css';

function normalizeNext(value) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/admin';
  }
  return value;
}

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = useMemo(() => normalizeNext(searchParams.get('next')), [searchParams]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [bootstrapRequired, setBootstrapRequired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/auth/session', { cache: 'no-store' })
      .then((response) => response.json())
      .then((body) => {
        if (!active) { return; }
        if (body?.authenticated) {
          router.replace(next);
          return;
        }
        setBootstrapRequired(Boolean(body?.bootstrapRequired));
      })
      .catch(() => {
        if (active) {
          setError('Nao foi possivel verificar a sessao administrativa.');
        }
      })
      .finally(() => {
        if (active) {
          setChecking(false);
        }
      });
    return () => {
      active = false;
    };
  }, [next, router]);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');

    const endpoint = bootstrapRequired ? '/api/auth/bootstrap' : '/api/auth/login';
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, bootstrapToken }),
        cache: 'no-store',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error || 'Falha ao autenticar');
      }
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const Icon = bootstrapRequired ? UserPlus : LogIn;

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.modeLine}>
        <strong>{bootstrapRequired ? 'Criar primeiro administrador' : 'Entrar no painel'}</strong>
        <span>{checking ? 'Verificando...' : bootstrapRequired ? 'Setup inicial' : 'Sessao segura'}</span>
      </div>

      <label className={styles.field}>
        <span>Usuario</span>
        <input
          autoComplete="username"
          disabled={loading || checking}
          onChange={(event) => setUsername(event.target.value)}
          required
          type="text"
          value={username}
        />
      </label>

      <label className={styles.field}>
        <span>Senha</span>
        <input
          autoComplete={bootstrapRequired ? 'new-password' : 'current-password'}
          disabled={loading || checking}
          minLength={10}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>

      {bootstrapRequired ? (
        <label className={styles.field}>
          <span>Token de criacao</span>
          <input
            autoComplete="one-time-code"
            disabled={loading || checking}
            onChange={(event) => setBootstrapToken(event.target.value)}
            type="password"
            value={bootstrapToken}
          />
        </label>
      ) : null}

      {error ? <p className={styles.error}>{error}</p> : null}

      <button className={styles.submitButton} disabled={loading || checking} type="submit">
        <Icon size={18} aria-hidden="true" />
        {loading ? 'Processando...' : bootstrapRequired ? 'Criar e entrar' : 'Entrar'}
      </button>
    </form>
  );
}
