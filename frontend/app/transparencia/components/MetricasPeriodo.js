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
    <div className="panorama-metricas">
      <MetricCard
        label={`Empenhado ordinário (${periodoLabel})`}
        value={formatMoney(total.valor_total)}
        sub={
          total.valor_estimado_global > 0
            ? `+ ${formatMoney(total.valor_estimado_global)} em empenhos estimativos/globais (previsão — fora do total)`
            : undefined
        }
        accent="--accent"
      />
      <MetricCard
        label={`Empenhos (${periodoLabel})`}
        value={total.n_empenhos?.toLocaleString('pt-BR')}
        sub="ordinários (EO) — estimativos/globais e ordens de pagamento ficam fora"
      />
      <MetricCard
        label={`Credores únicos (${periodoLabel})`}
        value={total.n_credores?.toLocaleString('pt-BR')}
        sub="por CNPJ"
      />
      <MetricCard
        label={`Com licitação (${periodoLabel})`}
        value={`${pctVinculado}%`}
        sub={`dos empenhos ordinários têm processo licitatório no acervo (${total.n_licitacoes_vinculadas?.toLocaleString('pt-BR') ?? 0} licitações)`}
        accent={pctVinculado > 50 ? '--success' : '--warning'}
      />
    </div>
  );
}
