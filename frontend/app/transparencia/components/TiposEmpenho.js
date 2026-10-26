import SectionBlock from '../../components/SectionBlock';
import { formatMoney } from '../../lib/format';

function pct(part, total) {
  if (!total) return '—';
  return `${Math.round((part / total) * 100)}%`;
}

const isOrdemPagamento = (tipo) => String(tipo || '').toUpperCase().startsWith('OP');

export default function TiposEmpenho({ tiposEmpenho, periodoLabel }) {
  // % só entre empenhos (EO+EE+EG): OP é pagamento de empenho já existente e
  // somá-la à base duplicaria o gasto.
  const baseEmpenhos = (tiposEmpenho || [])
    .filter((t) => !isOrdemPagamento(t.tipo))
    .reduce((acc, t) => acc + (t.valor || 0), 0);
  return (
    <SectionBlock
      title={`Composição por tipo de empenho (${periodoLabel})`}
      description="EO = Ordinário (valor definido). EG = Global (total de parcelas futuras). EE = Estimativo (valor previsto). OP = Ordem de Pagamento: paga um empenho já existente — não é gasto novo e fica fora dos percentuais."
    >
      <dl className="keyvalue-list">
        {(tiposEmpenho || []).map((t) => (
          <div key={t.tipo} className="keyvalue-row">
            <dt style={{ fontFamily: 'monospace', fontSize: '0.88rem' }}>{t.tipo || 'Sem tipo'}</dt>
            <dd>
              <strong>{formatMoney(t.valor)}</strong>
              <span style={{ marginLeft: 10, color: 'var(--text-muted)', fontSize: '0.83rem' }}>
                {t.n?.toLocaleString('pt-BR')} {isOrdemPagamento(t.tipo) ? 'ordens' : 'empenhos'} · {isOrdemPagamento(t.tipo) ? '—' : pct(t.valor, baseEmpenhos)}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </SectionBlock>
  );
}
