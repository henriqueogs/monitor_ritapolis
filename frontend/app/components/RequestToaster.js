'use client';

import { useEffect, useRef, useState } from 'react';

// ponytail: intercepta window.fetch uma vez em vez de instrumentar ~10 componentes
// de ação. Cobre toda mutação (POST/PUT/PATCH/DELETE) para /api/. Leituras (GET)
// e polls ficam de fora de propósito — senão viram spam a cada 3s. Se um dia
// precisar granularidade por chamada, trocar por um wrapper apiFetch explícito.

const METODOS_MUTACAO = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const TTL_SUCESSO_MS = 4000;
const TTL_ERRO_MS = 9000;

function extrairMetodo(input, init) {
  if (init?.method) return init.method.toUpperCase();
  if (typeof input === 'object' && input?.method) return input.method.toUpperCase();
  return 'GET';
}

function extrairUrl(input) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (typeof input === 'object' && input?.url) return input.url;
  return '';
}

function rotuloRota(url) {
  try {
    const { pathname } = new URL(url, window.location.origin);
    return pathname.replace('/api/admin-proxy', '').replace('/api', '') || pathname;
  } catch {
    return url;
  }
}

export default function RequestToaster() {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  useEffect(() => {
    const timers = [];

    function addToast({ tipo, titulo, detalhe }) {
      const id = ++idRef.current;
      setToasts((atual) => [...atual, { id, tipo, titulo, detalhe }]);
      const ttl = tipo === 'erro' ? TTL_ERRO_MS : TTL_SUCESSO_MS;
      timers.push(setTimeout(() => {
        setToasts((atual) => atual.filter((t) => t.id !== id));
      }, ttl));
    }

    const originalFetch = window.fetch;
    if (originalFetch.__toasted) return undefined;

    async function fetchComToast(input, init) {
      const metodo = extrairMetodo(input, init);
      const url = extrairUrl(input);
      const devToast = METODOS_MUTACAO.has(metodo) && url.includes('/api/');

      try {
        const response = await originalFetch(input, init);
        if (devToast) {
          const rota = rotuloRota(url);
          if (response.ok) {
            addToast({ tipo: 'ok', titulo: 'Requisição concluída', detalhe: `${metodo} ${rota}` });
          } else {
            let msg = `${response.status}`;
            try {
              const corpo = await response.clone().json();
              if (corpo?.error) msg = `${response.status} — ${corpo.error}`;
            } catch { /* corpo nao-JSON */ }
            addToast({ tipo: 'erro', titulo: 'Requisição falhou', detalhe: `${metodo} ${rota} · ${msg}` });
          }
        }
        return response;
      } catch (err) {
        if (devToast) {
          addToast({ tipo: 'erro', titulo: 'Sem resposta da API', detalhe: `${metodo} ${rotuloRota(url)} · ${err.message}` });
        }
        throw err;
      }
    }

    fetchComToast.__toasted = true;
    window.fetch = fetchComToast;

    return () => {
      window.fetch = originalFetch;
      timers.forEach(clearTimeout);
    };
  }, []);

  function dispensar(id) {
    setToasts((atual) => atual.filter((t) => t.id !== id));
  }

  if (!toasts.length) return null;

  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxWidth: 360,
      }}
    >
      {toasts.map((t) => {
        const cor = t.tipo === 'erro' ? 'var(--danger, #b42318)' : 'var(--success, #067647)';
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => dispensar(t.id)}
            style={{
              textAlign: 'left',
              cursor: 'pointer',
              border: `1px solid ${cor}`,
              borderLeft: `4px solid ${cor}`,
              borderRadius: 8,
              background: 'var(--surface, #fff)',
              color: 'var(--text, #101828)',
              padding: '10px 12px',
              boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
              font: 'inherit',
            }}
          >
            <strong style={{ display: 'block', fontSize: 13, color: cor }}>{t.titulo}</strong>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted, #667085)', marginTop: 2 }}>
              {t.detalhe}
            </span>
          </button>
        );
      })}
    </div>
  );
}
