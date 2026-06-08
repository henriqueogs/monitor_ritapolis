'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiUrl } from '../../../lib/api';

export default function IntegratedReadingAction({ documentoId, force = false }) {
  const router = useRouter();
  const [state, setState] = useState({ status: 'idle', message: '' });

  async function handleClick() {
    if (force && !window.confirm('Isso fará uma nova chamada à IA e pode consumir créditos. Deseja continuar?')) {
      return;
    }

    setState({ status: 'loading', message: 'Gerando leitura integrada... Isso pode levar alguns instantes.' });

    try {
      const response = await fetch(`${apiUrl}/documentos/${documentoId}/correlacionar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || 'Falha ao gerar leitura integrada');
      }

      setState({ status: 'success', message: 'Leitura integrada gerada. Atualizando...' });
      router.refresh();
    } catch (error) {
      setState({ status: 'error', message: error.message });
    }
  }

  return (
    <div className="ai-action">
      <button
        type="button"
        className={`button ${force ? 'button-secondary' : 'button-primary'}`}
        onClick={handleClick}
        disabled={state.status === 'loading'}
      >
        {state.status === 'loading' ? 'Gerando...' : force ? 'Gerar novamente' : 'Gerar leitura integrada'}
      </button>
      {state.message ? (
        <p className={state.status === 'error' ? 'ai-action-error' : 'section-note'}>{state.message}</p>
      ) : null}
    </div>
  );
}
