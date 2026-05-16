import StatusBadge from '../components/StatusBadge';
import { fetchResumoIaJobs, fetchResumoIaStatus } from '../lib/api';
import BatchSummaryPanel from './components/BatchSummaryPanel';
import CoverageSummary from './components/CoverageSummary';
import IaFilters from './components/IaFilters';
import JobsPanel from './components/JobsPanel';
import PendingByTypeTable from './components/PendingByTypeTable';
import ProvidersPanel from './components/ProvidersPanel';
import { currentValue } from './components/ia-format';

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

      <IaFilters filters={filters} years={years} types={types} />
      <CoverageSummary total={total} />
      <PendingByTypeTable rows={rows} />
      <BatchSummaryPanel filters={filters} pendingTotal={total.sem_resumo_ok || 0} />
      <JobsPanel
        jobRows={jobsData.dados || []}
        jobStats={jobsData.stats?.por_status || []}
        jobErrors={jobsData.stats?.por_erro || []}
      />
      <ProvidersPanel providerRows={status.por_provider || []} />
    </main>
  );
}
