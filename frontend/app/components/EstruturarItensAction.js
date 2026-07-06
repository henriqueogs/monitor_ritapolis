'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiUrl } from '../lib/api';

// Botão admin pra reextrair os itens do processo via IA (mesmo padrão de
// AiSummaryAction: POST assíncrono + polling do job).
export default function EstruturarItensAction({
  documentoId,
  label = 'Reestruturar itens via IA',
  force = true,
  variant = 'secondary',
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

      const response = await fetch(`${apiUrl}/ia/itens-estruturacao/jobs/${jobId}`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Nao foi possivel consultar o status da estruturacao');
      }

      const data = await response.json();
      const job = data.job;
      if (job.status === 'ok') {
        setState({ status: 'success', message: 'Itens reestruturados. Atualizando pagina...' });
        router.refresh();
        return;
      }
      if (job.status === 'erro') {
        throw new Error(job.erro || 'Falha ao estruturar itens');
      }

      setState({
        status: 'loading',
        message: job.status === 'processando' ? 'Estruturacao em processamento...' : 'Estruturacao na fila...',
      });
    }

    setState({
      status: 'loading',
      message: 'Estruturacao ainda em processamento. Recarregue a pagina em alguns instantes.',
    });
  }

  async function handleClick() {
    setState({ status: 'loading', message: 'Enfileirando estruturacao...' });

    try {
      const response = await fetch(`${apiUrl}/documentos/${documentoId}/estruturar-itens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || 'Falha ao enfileirar estruturacao');
      }

      const data = await response.json();
      if (response.status === 202 && data.job_id) {
        setState({ status: 'loading', message: 'Estruturacao na fila...' });
        await pollJob(data.job_id);
        return;
      }

      setState({ status: 'success', message: data.mensagem || 'Itens ja estruturados.' });
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
        disabled={state.status === 'loading'}
      >
        {state.status === 'loading' ? 'Processando...' : label}
      </button>
      {state.message ? (
        <p className={state.status === 'error' ? 'ai-action-error' : 'section-note'}>{state.message}</p>
      ) : null}
    </div>
  );
}
