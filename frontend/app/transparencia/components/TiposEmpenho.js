import SectionBlock from '../../components/SectionBlock';
import { formatMoney } from '../../lib/format';

function pct(part, total) {
  if (!total) return '—';
  return `${Math.round((part / total) * 100)}%`;
}

export default function TiposEmpenho({ tiposEmpenho, valorTotal, periodoLabel }) {
  return (
    <SectionBlock
      title={`Composição por tipo de empenho (${periodoLabel})`}
      description="EO = Ordinário (contrato definido). EG = Global (estimativa anual). EE = Estimativo. OP = Ordem de Pagamento."
    >
      <dl className="keyvalue-list">
        {(tiposEmpenho || []).map((t) => (
          <div key={t.tipo} className="keyvalue-row">
            <dt style={{ fontFamily: 'monospace', fontSize: '0.88rem' }}>{t.tipo || 'Sem tipo'}</dt>
            <dd>
              <strong>{formatMoney(t.valor)}</strong>
              <span style={{ marginLeft: 10, color: 'var(--text-muted)', fontSize: '0.83rem' }}>
                {t.n?.toLocaleString('pt-BR')} empenhos · {pct(t.valor, valorTotal)}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </SectionBlock>
  );
}
