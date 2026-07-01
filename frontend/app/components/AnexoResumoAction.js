'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiUrl } from '../lib/api';

export default function AnexoResumoAction({ anexoId, label = 'Regenerar resumo', force = true }) {
  const router = useRouter();
  const [state, setState] = useState({ status: 'idle', message: '' });

  function wait(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  async function pollJob(jobId) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await wait(3000);

      const response = await fetch(`${apiUrl}/anexos/resumos/jobs/${jobId}`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Nao foi possivel consultar o status do resumo');
      }

      const data = await response.json();
      const job = data.job;
      if (job.status === 'ok') {
        setState({ status: 'success', message: 'Resumo concluido. Atualizando pagina...' });
        router.refresh();
        return;
      }
      if (job.status === 'erro') {
        throw new Error(job.erro || 'Falha ao gerar resumo do anexo');
      }
      setState({
        status: 'loading',
        message: job.status === 'processando' ? 'Resumo em processamento...' : 'Resumo na fila...'
      });
    }

    setState({ status: 'loading', message: 'Ainda em processamento. Recarregue a pagina em alguns instantes.' });
  }

  async function handleClick() {
    setState({ status: 'loading', message: 'Enfileirando...' });
    try {
      const response = await fetch(`${apiUrl}/anexos/${anexoId}/resumir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || 'Falha ao regenerar resumo do anexo');
      }

      const data = await response.json();
      if (response.status === 202) {
        setState({ status: 'loading', message: 'Resumo na fila...' });
        await pollJob(data.job.id);
        return;
      }

      setState({ status: 'success', message: data.mensagem || 'Resumo ja atualizado.' });
      router.refresh();
    } catch (error) {
      setState({ status: 'error', message: error.message });
    }
  }

  return (
    <div className="ai-action">
      <button
        type="button"
        className="button button-secondary"
        onClick={handleClick}
        disabled={state.status === 'loading'}
      >
        {state.status === 'loading' ? 'Gerando...' : label}
      </button>
      {state.message ? (
        <p className={state.status === 'error' ? 'ai-action-error' : 'section-note'}>{state.message}</p>
      ) : null}
    </div>
  );
}
