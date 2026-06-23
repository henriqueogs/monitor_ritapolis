import { formatMoney } from '../../lib/format';
import SectionBlock from '../../components/SectionBlock';
import NarrativaAnomalias from './NarrativaAnomalias';

function ZscoreBadge({ zscore }) {
  const color = zscore >= 4 ? 'var(--error)' : zscore >= 3 ? 'var(--warning)' : 'var(--text-muted)';
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, color,
      background: 'color-mix(in srgb, currentColor 12%, transparent)',
      padding: '1px 6px', borderRadius: 8, fontVariantNumeric: 'tabular-nums',
    }}>
      z={zscore}σ
    </span>
  );
}

export default function AnomaliasEmpenhos({ dados }) {
  if (!dados) return null;
  const { exercicio, outliers_valor, possivel_fracionamento, total_outliers, total_fracionamento, limiar_dispensa } = dados;
  const semAlertas = total_outliers === 0 && total_fracionamento === 0;

  return (
    <SectionBlock
      title="B2 — Empenhos atípicos e possível fracionamento"
      description={`Detecção de valores fora do padrão estatístico (z-score ≥ 2,5σ por área funcional) e possível fracionamento de contratos em ${exercicio}. Limiar de dispensa: ${formatMoney(limiar_dispensa)}.`}
    >
      <NarrativaAnomalias exercicio={exercicio} />

      {semAlertas && (
        <p style={{ color: 'var(--success)', fontSize: 14 }}>
          Nenhum empenho atípico detectado em {exercicio}.
        </p>
      )}

      {/* Outliers por valor */}
      {outliers_valor?.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600 }}>
            Empenhos com valor fora do padrão da área funcional
            <span style={{ marginLeft: 8, fontWeight: 400, color: 'var(--text-muted)', fontSize: 12 }}>
              ({total_outliers} total)
            </span>
          </p>
          <div className="table-scroll-x">
            <div className="simple-table" style={{ minWidth: 560 }}>
              <div className="table-row table-row-header">
                <span>Empenho</span>
                <span>Credor</span>
                <span>Área</span>
                <span>Valor</span>
                <span>z-score</span>
              </div>
              {outliers_valor.map((o) => (
                <div key={`${o.id}`} className="table-row">
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {o.empenho}
                    {o.data_empenho && <span style={{ display: 'block' }}>{o.data_empenho}</span>}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{o.credor_nome}</span>
                    {o.historico && (
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>
                        {o.historico}
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{o.funcao}</span>
                  <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(o.valor)}</span>
                  <span><ZscoreBadge zscore={o.zscore} /></span>
                </div>
              ))}
            </div>
          </div>
          <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
            A média e desvio-padrão são calculados por área funcional. Empenhos em áreas com poucos registros podem apresentar z-score elevado mesmo sem irregularidade.
          </p>
        </div>
      )}

      {/* Fracionamento */}
      {possivel_fracionamento?.length > 0 && (
        <div>
          <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600 }}>
            Possível fracionamento de contrato
            <span style={{ marginLeft: 8, fontWeight: 400, color: 'var(--text-muted)', fontSize: 12 }}>
              ({total_fracionamento} situações)
            </span>
          </p>
          <div className="table-scroll-x">
            <div className="simple-table" style={{ minWidth: 520 }}>
              <div className="table-row table-row-header">
                <span>Credor</span>
                <span>Semana</span>
                <span>Empenhos</span>
                <span>Total semana</span>
              </div>
              {possivel_fracionamento.map((f, i) => (
                <div key={i} className="table-row">
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{f.credor_nome}</span>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>{f.credor_cnpj}</span>
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {f.semana}
                    {f.inicio && f.fim && f.inicio !== f.fim ? (
                      <span style={{ display: 'block' }}>{f.inicio} – {f.fim}</span>
                    ) : f.inicio ? (
                      <span style={{ display: 'block' }}>{f.inicio}</span>
                    ) : null}
                  </span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--warning)', fontWeight: 600 }}>{f.n_empenhos}</span>
                  <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(f.valor_semana)}</span>
                </div>
              ))}
            </div>
          </div>
          <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
            Indicação: mesmo fornecedor, mesma semana, ≥3 empenhos individuais abaixo do limiar de dispensa mas com total acima. Requer verificação manual.
          </p>
        </div>
      )}
    </SectionBlock>
  );
}
