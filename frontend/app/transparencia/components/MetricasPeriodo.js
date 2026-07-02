import { formatMoney } from '../../lib/format';

function MetricCard({ label, value, sub, accent }) {
  return (
    <div className="admin-metric-card">
      <span>{label}</span>
      <strong style={accent ? { color: `var(${accent})` } : undefined}>{value ?? '—'}</strong>
      {sub ? <p style={{ margin: '6px 0 0', fontSize: 12, opacity: 0.55 }}>{sub}</p> : null}
    </div>
  );
}

/**
 * Cards de métricas escopadas pelo período selecionado — todo valor carrega o
 * intervalo de tempo no rótulo (§11.1).
 */
export default function MetricasPeriodo({ total, periodoLabel, pctVinculado }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 16,
        marginBottom: 28,
      }}
    >
      <MetricCard
        label={`Total empenhado (${periodoLabel})`}
        value={formatMoney(total.valor_total)}
        accent="--accent"
      />
      <MetricCard
        label={`Empenhos (${periodoLabel})`}
        value={total.n_empenhos?.toLocaleString('pt-BR')}
        sub="EO + EG + EE + OP"
      />
      <MetricCard
        label={`Credores únicos (${periodoLabel})`}
        value={total.n_credores?.toLocaleString('pt-BR')}
        sub="por CNPJ"
      />
      <MetricCard
        label={`Vinculados a licitações (${periodoLabel})`}
        value={`${total.n_licitacoes_vinculadas?.toLocaleString('pt-BR')} doc.`}
        sub={`${pctVinculado}% dos empenhos com processo`}
        accent={pctVinculado > 50 ? '--success' : '--warning'}
      />
    </div>
  );
}
