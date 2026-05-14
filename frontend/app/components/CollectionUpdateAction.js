'use client';

import { useEffect, useState } from 'react';
import { apiUrl } from '../lib/api';

function statusLabel(status) {
  if (status === 'processando') return 'Atualizando';
  if (status === 'ok') return 'Atualizacao concluida';
  if (status === 'erro_parcial') return 'Concluida com avisos';
  if (status === 'erro_total') return 'Falha na atualizacao';
  return 'Nenhuma atualizacao em andamento';
}

export default function CollectionUpdateAction({ initialStatus }) {
  const [fonte, setFonte] = useState('todas');
  const [status, setStatus] = useState(initialStatus || { status: 'idle', running: false });
  const [error, setError] = useState('');

  async function loadStatus() {
    try {
      const response = await fetch(`${apiUrl}/coletas/atualizacao/status`, { cache: 'no-store' });
      if (!response.ok) return;
      setStatus(await response.json());
    } catch {
      setError('Nao foi possivel consultar a API. Confirme se npm run api esta ativo na porta 3001.');
    }
  }

  useEffect(() => {
    if (!status?.running) return undefined;
    const interval = setInterval(loadStatus, 3000);
    return () => clearInterval(interval);
  }, [status?.running]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    let response;
    let payload;

    try {
      response = await fetch(`${apiUrl}/coletas/atualizar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fonte })
      });
      payload = await response.json();
    } catch {
      setError('Falha ao conectar na API. Confirme se npm run api esta rodando em http://localhost:3001.');
      return;
    }

    if (!response.ok && response.status !== 409) {
      setError(payload.error || 'Nao foi possivel iniciar a atualizacao.');
      return;
    }

    setStatus(payload);
  }

  const running = Boolean(status?.running);

  return (
    <form className="collection-update" onSubmit={handleSubmit}>
      <div>
        <label htmlFor="collection-source">Atualizar dados</label>
        <select
          id="collection-source"
          value={fonte}
          onChange={(event) => setFonte(event.target.value)}
          className="field-select"
          disabled={running}
        >
          <option value="todas">Prefeitura e Camara</option>
          <option value="site_prefeitura">Somente Prefeitura</option>
          <option value="camara">Somente Camara</option>
        </select>
      </div>
      <button type="submit" className="button button-primary" disabled={running}>
        {running ? 'Atualizando...' : 'Atualizar coleta'}
      </button>
      <div className="collection-status">
        <strong>{statusLabel(status?.status)}</strong>
        {status?.started_at ? <span>Inicio: {new Date(status.started_at).toLocaleString('pt-BR')}</span> : null}
        {status?.finished_at ? <span>Fim: {new Date(status.finished_at).toLocaleString('pt-BR')}</span> : null}
        {status?.erro ? <span>{status.erro}</span> : null}
        {error ? <span>{error}</span> : null}
      </div>
    </form>
  );
}
