import AdminMetricCard from '../../components/AdminMetricCard';
import { formatMoney } from '../../lib/format';

function percent(part, total) {
  if (!total) return '0%';
  return `${Math.round((Number(part || 0) / Number(total)) * 100)}%`;
}

function topModalidade(row) {
  return row?.modalidades?.[0]?.modalidade || 'Sem modalidade dominante';
}

export default function LicitacaoYearSummary({ row, currentYear }) {
  if (!row) return null;

  const isCurrentYear = Number(row.ano) === currentYear;
  const note = isCurrentYear
    ? 'Ano corrente selecionado por padrao'
    : 'Recorte historico selecionado';

  return (
    <section className="admin-metric-grid licitacao-year-summary" aria-label="Resumo do ano selecionado">
      <AdminMetricCard label={`Licitações ${row.ano}`} value={row.total} note={note} />
      <AdminMetricCard
        label="Com data ou sessao"
        value={percent(row.com_data_sessao, row.total)}
        note={`${row.com_data_sessao} de ${row.total}`}
      />
      <AdminMetricCard
        label="Com resumo IA"
        value={percent(row.com_resumo_ai, row.total)}
        note={`${row.com_resumo_ai} documentos`}
      />
      <AdminMetricCard
        label="Com valor final"
        value={percent(row.com_valor_final, row.total)}
        note={formatMoney(row.valor_final_total, 'Sem valores')}
      />
      <AdminMetricCard
        label="Modalidade mais comum"
        value={topModalidade(row)}
        note={row.modalidades?.[0] ? `${row.modalidades[0].total} registros` : 'Sem dados'}
      />
    </section>
  );
}
