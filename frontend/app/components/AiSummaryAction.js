'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiUrl } from '../lib/api';

export default function AiSummaryAction({
  documentoId,
  label = 'Gerar resumo',
  force = false,
  variant = 'primary',
  disabled = false,
  confirmMessage = ''
}) {
  const router = useRouter();
  const [state, setState] = useState({ status: 'idle', message: '' });

  function wait(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  async function pollJob(jobId) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await wait(3000);

      const response = await fetch(`${apiUrl}/ia/resumos/jobs/${jobId}`, {
        cache: 'no-store'
      });
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
        throw new Error(job.erro || 'Falha ao gerar resumo');
      }

      setState({
        status: 'loading',
        message: job.status === 'processando' ? 'Resumo em processamento...' : 'Resumo na fila...'
      });
    }

    setState({
      status: 'loading',
      message: 'Resumo ainda em processamento. Recarregue a pagina em alguns instantes.'
    });
  }

  async function handleClick() {
    if (force && confirmMessage && !window.confirm(confirmMessage)) {
      return;
    }

    setState({ status: 'loading', message: force ? 'Gerando novo resumo...' : 'Gerando resumo...' });

    try {
      const response = await fetch(`${apiUrl}/documentos/${documentoId}/resumir`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ force })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || 'Falha ao gerar resumo');
      }

      if (response.status === 202) {
        const data = await response.json();
        setState({ status: 'loading', message: 'Resumo na fila...' });
        await pollJob(data.job.id);
        return;
      }

      setState({
        status: 'success',
        message: force ? 'Novo resumo gerado. Atualizando pagina...' : 'Resumo gerado. Atualizando pagina...'
      });
      router.refresh();
    } catch (error) {
      setState({ status: 'error', message: error.message });
    }
  }

  return (
    <div className="ai-action">
      <button
        type="button"
        className={`button ${variant === 'secondary' ? 'button-secondary' : 'button-primary'}`}
        onClick={handleClick}
        disabled={disabled || state.status === 'loading'}
      >
        {state.status === 'loading' ? 'Gerando...' : label}
      </button>
      {state.message ? (
        <p className={state.status === 'error' ? 'ai-action-error' : 'section-note'}>{state.message}</p>
      ) : null}
    </div>
  );
}
