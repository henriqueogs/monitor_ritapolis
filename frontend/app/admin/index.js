import Link from 'next/link';
import AdminMetricCard from '../components/AdminMetricCard';
import SectionBlock from '../components/SectionBlock';
import StatusBadge from '../components/StatusBadge';
import { fetchColetas, fetchEstatisticas, fetchResumoIaStatus } from '../lib/api';
import { formatDate, labelFonte } from '../lib/format';
import styles from './styles.module.css';

export default async function AdminPage() {
  const [estatisticas, iaStatus, coletas] = await Promise.all([
    fetchEstatisticas(),
    fetchResumoIaStatus().catch(() => ({ totais: {} })),
    fetchColetas({ limite: 5 }).catch(() => ({ dados: [] }))
  ]);
  const qualidade = estatisticas.qualidade_dados || {};
  const ia = iaStatus.totais || {};

  return (
    <main className="page-container admin-page">
      <div className="page-title">
        <div>
          <h1>Visao geral da operacao</h1>
          <p>Indicadores internos de coleta, qualidade e IA. Estes dados nao sao destaque na experiencia publica.</p>
        </div>
        <Link href="/" className="button button-secondary">Ver site publico</Link>
      </div>

      <div className="admin-metric-grid">
        <AdminMetricCard label="Documentos na base" value={estatisticas.total_documentos || 0} note="Volume operacional" />
        <AdminMetricCard label="Licitacoes/Editais" value={estatisticas.total_licitacoes || 0} note="Registros coletados" />
        <AdminMetricCard label="Resumos IA ok" value={ia.com_resumo_ok || 0} note={`${ia.sem_resumo_ok || 0} pendentes`} />
        <AdminMetricCard label="Sem data" value={qualidade.sem_data || 0} note="Revisar extracao" />
      </div>

      <SectionBlock title="Ultimas coletas">
        <div className={styles.statusList}>
          {coletas.dados?.length ? (
            coletas.dados.map((coleta) => (
              <div key={coleta.id} className={styles.statusRow}>
                <div>
                  <strong>{coleta.fonte_nome || labelFonte(coleta.fonte)}</strong>
                  <p>{formatDate(coleta.fim)} - novos {coleta.itens_novos} - atualizados {coleta.itens_atualizados}</p>
                </div>
                <StatusBadge value={coleta.status} />
              </div>
            ))
          ) : (
            <p className="empty-state">Nenhum log de coleta encontrado.</p>
          )}
        </div>
      </SectionBlock>
    </main>
  );
}
