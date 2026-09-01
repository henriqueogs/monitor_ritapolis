'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiUrl } from '../lib/api';

export default function AiBatchSummaryAction({ filters, pendingTotal = 0 }) {
  const router = useRouter();
  const [state, setState] = useState({ status: 'idle', message: '' });
  const [limit, setLimit] = useState('5');
  const [maxChars, setMaxChars] = useState('20000');

  async function handleSubmit(event) {
    event.preventDefault();
    setState({ status: 'loading', message: 'Enfileirando documentos...' });

    try {
      const response = await fetch(`${apiUrl}/ia/resumos/jobs/lote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...filters,
          limite: Number(limit),
          maxChars: maxChars ? Number(maxChars) : null
        })
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || 'Falha ao enfileirar resumos');
      }

      setState({
        status: 'success',
        message:
          data.total_enfileirado > 0
            ? `${data.total_enfileirado} documento(s) enfileirado(s). A fila ja esta processando.`
            : 'Nenhum documento pendente encontrado para estes filtros.'
      });
      router.refresh();
    } catch (error) {
      setState({ status: 'error', message: error.message });
    }
  }

  return (
    <form className="batch-action" onSubmit={handleSubmit}>
      <div className="batch-fields">
        <label>
          Quantidade
          <select value={limit} onChange={(event) => setLimit(event.target.value)} className="field-select">
            <option value="1">1 documento</option>
            <option value="5">5 documentos</option>
            <option value="10">10 documentos</option>
            <option value="20">20 documentos</option>
            <option value="50">50 documentos</option>
          </select>
        </label>
        <label>
          Tamanho maximo
          <select value={maxChars} onChange={(event) => setMaxChars(event.target.value)} className="field-select">
            <option value="20000">Ate 20 mil caracteres</option>
            <option value="50000">Ate 50 mil caracteres</option>
            <option value="">Sem limite</option>
          </select>
        </label>
      </div>
      <button
        type="submit"
        className="button button-primary"
        disabled={state.status === 'loading' || Number(pendingTotal || 0) === 0}
      >
        {state.status === 'loading' ? 'Enfileirando...' : 'Aumentar cobertura'}
      </button>
      {state.message ? (
        <p className={state.status === 'error' ? 'ai-action-error' : 'section-note'}>{state.message}</p>
      ) : null}
    </form>
  );
}
