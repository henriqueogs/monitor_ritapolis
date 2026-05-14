import Link from 'next/link';
import AiBatchSummaryAction from '../components/AiBatchSummaryAction';
import FilterBar from '../components/FilterBar';
import SectionBlock from '../components/SectionBlock';
import StatusBadge from '../components/StatusBadge';
import { fetchResumoIaJobs, fetchResumoIaStatus } from '../lib/api';

function currentValue(searchParams, key) {
  return typeof searchParams?.[key] === 'string' ? searchParams[key] : '';
}

function percent(done, total) {
  if (!total) return '0%';
  return `${Math.round((Number(done || 0) / Number(total)) * 100)}%`;
}

function buildDocsHref(row) {
  const params = new URLSearchParams();
  if (row.ano) params.set('ano', String(row.ano));
  if (row.tipo) params.set('tipo', row.tipo);
  const query = params.toString();
  return query ? `/documentos?${query}` : '/documentos';
}

function formatDateTime(value) {
  if (!value) return 'Nao informado';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short'
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default async function IaStatusPage({ searchParams }) {
  const filters = {
    ano: currentValue(searchParams, 'ano'),
    tipo: currentValue(searchParams, 'tipo'),
    fonte: currentValue(searchParams, 'fonte'),
    status_job: currentValue(searchParams, 'status_job')
  };
  const [status, jobsData] = await Promise.all([
    fetchResumoIaStatus(filters),
    fetchResumoIaJobs({ limite: 25, status: filters.status_job })
  ]);
  const rows = status.por_ano_tipo || [];
  const providerRows = status.por_provider || [];
  const jobRows = jobsData.dados || [];
  const jobStats = jobsData.stats?.por_status || [];
  const jobErrors = jobsData.stats?.por_erro || [];
  const total = status.totais || {};
  const years = [...new Set(rows.map((row) => row.ano).filter(Boolean))];
  const types = [...new Set(rows.map((row) => row.tipo).filter(Boolean))];

  return (
    <main className="page-container">
      <div className="page-title">
        <div>
          <h1>Status dos resumos de IA</h1>
          <p>Acompanhe cobertura, fila, erros, duracao e modo de processamento dos resumos.</p>
        </div>
        <StatusBadge value={total.sem_resumo_ok ? 'pendente' : 'ok'} />
      </div>

      <FilterBar action="/ia">
        <select name="ano" defaultValue={filters.ano} className="field-select">
          <option value="">Todos os anos</option>
          {years.map((ano) => (
            <option key={ano} value={ano}>
              {ano}
            </option>
          ))}
        </select>
        <select name="tipo" defaultValue={filters.tipo} className="field-select">
          <option value="">Todos os tipos</option>
          {types.map((tipo) => (
            <option key={tipo} value={tipo}>
              {tipo}
            </option>
          ))}
        </select>
        <select name="fonte" defaultValue={filters.fonte} className="field-select">
          <option value="">Todas as fontes</option>
          <option value="site_prefeitura">Prefeitura</option>
          <option value="camara">Camara</option>
        </select>
        <select name="status_job" defaultValue={filters.status_job} className="field-select">
          <option value="">Todos os jobs</option>
          <option value="pendente">Pendentes</option>
          <option value="processando">Processando</option>
          <option value="ok">Concluidos</option>
          <option value="erro">Com erro</option>
        </select>
      </FilterBar>

      <SectionBlock title="Cobertura atual">
        <div className="stats-grid">
          <div className="stat-box">
            <span>Documentos com texto</span>
            <strong>{total.total_documentos || 0}</strong>
          </div>
          <div className="stat-box">
            <span>Com resumo valido</span>
            <strong>{total.com_resumo_ok || 0}</strong>
          </div>
          <div className="stat-box">
            <span>Pendentes</span>
            <strong>{total.sem_resumo_ok || 0}</strong>
          </div>
          <div className="stat-box">
            <span>Cobertura</span>
            <strong>{percent(total.com_resumo_ok, total.total_documentos)}</strong>
          </div>
        </div>
      </SectionBlock>

      <SectionBlock
        title="Pendencias por ano e tipo"
        description="Use esta tabela para escolher onde concentrar a proxima rodada de resumos."
      >
        {rows.length ? (
          <div className="ia-status-table">
            <div className="ia-status-head">
              <span>Ano</span>
              <span>Tipo</span>
              <span>Total</span>
              <span>Ok</span>
              <span>Pendentes</span>
              <span>Cobertura</span>
              <span>Acao</span>
            </div>
            {rows.map((row) => (
              <div key={`${row.ano || 'sem-ano'}-${row.tipo}`} className="ia-status-row">
                <strong>{row.ano || 'Sem ano'}</strong>
                <span>{row.tipo}</span>
                <span>{row.total_documentos}</span>
                <span>{row.com_resumo_ok}</span>
                <span>{row.sem_resumo_ok}</span>
                <span>{percent(row.com_resumo_ok, row.total_documentos)}</span>
                <Link href={buildDocsHref(row)}>Abrir documentos</Link>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-state">Nenhum documento com texto encontrado para os filtros atuais.</p>
        )}
      </SectionBlock>

      <SectionBlock
        title="Aumentar cobertura pela interface"
        description="Enfileire documentos pendentes usando os filtros atuais. A geracao acontece em segundo plano."
        aside={<Link href="/analises">Ver analises geradas</Link>}
      >
        <AiBatchSummaryAction filters={filters} pendingTotal={total.sem_resumo_ok || 0} />
      </SectionBlock>

      <SectionBlock
        title="Fila de resumos"
        description="Ultimos jobs criados para geracao assincrona de resumos, incluindo modo, chunks, duracao e erros."
      >
        {jobStats.length ? (
          <div className="job-stats">
            {jobStats.map((item) => (
              <span key={item.status}>
                {item.status}: {item.total}
              </span>
            ))}
          </div>
        ) : null}

        {jobErrors.length ? (
          <div className="job-error-summary">
            {jobErrors.map((item) => (
              <div key={`${item.erro_categoria}-${item.erro}`} className="job-error-row">
                <strong>{item.erro_categoria}</strong>
                <span>{item.total} ocorrencia(s)</span>
                <p>{item.erro}</p>
              </div>
            ))}
          </div>
        ) : null}

        {jobRows.length ? (
          <div className="simple-table">
            {jobRows.map((job) => (
              <div key={job.id} className="table-row table-row-stacked">
                <div>
                  <strong>
                    <Link href={`/documento/${job.documento_id}`}>#{job.documento_id} - {job.titulo}</Link>
                  </strong>
                  <p>
                    {job.ano || 'Sem ano'} - {job.tipo} - {job.fonte} -{' '}
                    {job.texto_chars?.toLocaleString('pt-BR') || 0} caracteres
                  </p>
                  <p>
                    Operacao: {job.operacao?.modo || 'nao informada'}
                    {job.operacao?.chunks_previstos ? ` - ${job.operacao.chunks_previstos} chunks` : ''}
                    {job.duracao_segundos != null ? ` - ${job.duracao_segundos}s` : ''}
                  </p>
                  {job.erro ? <p className="ai-action-error">{job.erro}</p> : null}
                </div>
                <span>
                  {job.status} - tentativas {job.tentativas} - {formatDateTime(job.atualizado_em)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-state">Nenhum job de resumo registrado ainda.</p>
        )}
      </SectionBlock>

      <SectionBlock
        title="Providers e modelos"
        description="Distribuicao dos resumos existentes por provider, modelo e status."
      >
        {providerRows.length ? (
          <div className="simple-table">
            {providerRows.map((row) => (
              <div key={`${row.provider}-${row.modelo}-${row.status}`} className="table-row table-row-stacked">
                <div>
                  <strong>{row.provider}</strong>
                  <p>{row.modelo}</p>
                </div>
                <span>
                  {row.status} - {row.total}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-state">Nenhum resumo registrado para os filtros atuais.</p>
        )}
      </SectionBlock>
    </main>
  );
}
