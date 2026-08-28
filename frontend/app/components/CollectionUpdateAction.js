'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiUrl } from '../lib/api';
import { labelFonte } from '../lib/format';

function statusLabel(status) {
  if (status === 'processando') return 'Atualizando';
  if (status === 'ok') return 'Atualizacao concluida';
  if (status === 'erro_parcial') return 'Concluida com avisos';
  if (status === 'erro_total') return 'Falha na atualizacao';
  return 'Nenhuma atualizacao em andamento';
}

function primeiroErro(resultado) {
  const detalhes = Array.isArray(resultado?.detalhes) ? resultado.detalhes : [];
  const comErro = detalhes.find((item) => item && item.erro);
  return comErro?.erro || null;
}

function fontesComErro(resultados) {
  if (!Array.isArray(resultados)) return [];
  return resultados
    .filter((item) => item?.status && item.status !== 'ok')
    .map((item) => ({ fonte: item.fonte, status: item.status, erro: primeiroErro(item) }));
}

export default function CollectionUpdateAction({ initialStatus }) {
  // Dispara coleta manual, acompanha o status ao vivo e recarrega o histórico ao fim.
  const router = useRouter();
  const [fonte, setFonte] = useState('todas');
  const [status, setStatus] = useState(initialStatus || { status: 'idle', running: false });
  const [error, setError] = useState('');
  const running = Boolean(status?.running);
  const rodouRef = useRef(running);

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
    if (!running) return undefined;
    const interval = setInterval(loadStatus, 3000);
    return () => clearInterval(interval);
  }, [running]);

  // Ao concluir uma coleta (running true -> false), recarrega o server component
  // para o "Historico recente" refletir a execucao que acabou.
  useEffect(() => {
    if (rodouRef.current && !running) {
      router.refresh();
    }
    rodouRef.current = running;
  }, [running, router]);

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

  const erros = fontesComErro(status?.resultados);

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
          <option value="todas">Todas as fontes ativas</option>
          <option value="site_prefeitura">Somente Prefeitura</option>
          <option value="camara">Somente Camara (pausada — manual)</option>
        </select>
      </div>
      <button type="submit" className="button button-primary" disabled={running}>
        {running ? 'Atualizando...' : 'Atualizar coleta'}
      </button>
      <div className="collection-status">
        <strong>{statusLabel(status?.status)}</strong>
        {status?.started_at ? <span>Inicio: {new Date(status.started_at).toLocaleString('pt-BR')}</span> : null}
        {status?.finished_at ? <span>Fim: {new Date(status.finished_at).toLocaleString('pt-BR')}</span> : null}
        {status?.erro ? <span>Erro: {status.erro}</span> : null}
        {erros.map((item) => (
          <span key={item.fonte}>
            {labelFonte(item.fonte)}: {item.status === 'erro_total' ? 'falhou' : 'concluída com avisos'}
            {item.erro ? ` — ${item.erro}` : ''}
          </span>
        ))}
        {error ? <span>{error}</span> : null}
      </div>
    </form>
  );
}
