import { formatMoney } from '../../lib/format';
import SectionBlock from '../../components/SectionBlock';

const HHI_LABELS = { alta: 'Alta concentração', moderada: 'Concentração moderada', baixa: 'Baixa concentração' };
const HHI_COLORS = { alta: 'var(--error)', moderada: 'var(--warning)', baixa: 'var(--success)' };

function HhiGauge({ hhi, classificacao }) {
  // HHI: 0 → 10000. Escala visual de 0-3000
  const pct = Math.min(100, Math.round((hhi / 3000) * 100));
  const color = HHI_COLORS[classificacao] || 'var(--accent)';
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Índice HHI — {HHI_LABELS[classificacao] || classificacao}
        </span>
        <strong style={{ color, fontVariantNumeric: 'tabular-nums' }}>{hhi.toLocaleString('pt-BR')}</strong>
      </div>
      <div style={{ height: 6, background: 'var(--surface-muted)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.5s' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 11, color: 'var(--text-muted)' }}>
        <span>0 — disperso</span>
        <span>1500</span>
        <span>3000+ concentrado</span>
      </div>
    </div>
  );
}

export default function ConcentracaoCredores({ dados, historico }) {
  if (!dados) return null;
  const { exercicio, hhi, classificacao_hhi, n_credores_privados, pct_privado,
          total_geral, total_privado, top_credores, alertas, credores_exclusivos_ano } = dados;

  return (
    <SectionBlock
      title="B1 — Concentração de fornecedores"
      description={`Análise de concentração de mercado entre os ${n_credores_privados} fornecedores privados em ${exercicio}. Exclui folha de pagamento e repasses obrigatórios.`}
    >
      {/* Alertas */}
      {alertas?.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {alertas.map((a, i) => (
            <div
              key={i}
              style={{
                padding: '10px 14px',
                borderRadius: 6,
                background: a.nivel === 'alto' ? 'color-mix(in srgb, var(--error) 12%, transparent)' : 'color-mix(in srgb, var(--warning) 12%, transparent)',
                borderLeft: `3px solid ${a.nivel === 'alto' ? 'var(--error)' : 'var(--warning)'}`,
                fontSize: 13,
                color: a.nivel === 'alto' ? 'var(--error)' : 'var(--warning)',
              }}
            >
              {a.mensagem}
            </div>
          ))}
        </div>
      )}

      {/* HHI Gauge */}
      <HhiGauge hhi={hhi} classificacao={classificacao_hhi} />

      {/* Métricas rápidas */}
      <div className="admin-metric-grid" style={{ marginBottom: 16 }}>
        <div className="admin-metric-card">
          <span>Total geral executado</span>
          <strong>{formatMoney(total_geral)}</strong>
        </div>
        <div className="admin-metric-card">
          <span>Contratos privados</span>
          <strong>{formatMoney(total_privado)}</strong>
          <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.6 }}>{pct_privado}% do total</p>
        </div>
        <div className="admin-metric-card">
          <span>Fornecedores privados</span>
          <strong>{n_credores_privados}</strong>
        </div>
      </div>

      {/* Top credores */}
      {top_credores?.length > 0 && (
        <div className="table-scroll-x">
          <div className="simple-table" style={{ minWidth: 520 }}>
            <div className="table-row table-row-header">
              <span>#</span>
              <span>Fornecedor</span>
              <span>Empenhos</span>
              <span>Valor</span>
              <span>Share%</span>
            </div>
            {top_credores.slice(0, 10).map((c, idx) => (
              <div key={c.credor_cnpj} className="table-row">
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{idx + 1}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{c.credor_nome}</span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>
                    {c.credor_cnpj} · {c.n_funcoes} área{c.n_funcoes !== 1 ? 's' : ''}
                  </span>
                </span>
                <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>{c.n_empenhos}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{formatMoney(c.valor_total)}</span>
                <span>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: 10,
                      fontSize: 12,
                      fontWeight: 600,
                      background: c.share_pct > 20 ? 'color-mix(in srgb, var(--warning) 15%, transparent)' : 'var(--surface-muted)',
                      color: c.share_pct > 20 ? 'var(--warning)' : 'inherit',
                    }}
                  >
                    {c.share_pct}%
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {credores_exclusivos_ano?.length > 0 && (
        <p style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
          <strong>{credores_exclusivos_ano.length}</strong> fornecedore{credores_exclusivos_ano.length !== 1 ? 's' : ''} aparecem apenas em {exercicio} (nunca antes nem depois).
        </p>
      )}

      {/* Histórico HHI */}
      {historico?.length > 1 && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
            Evolução do HHI
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            {historico.map((h) => (
              <div key={h.exercicio} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: HHI_COLORS[h.classificacao] || 'var(--accent)' }}>
                  {h.hhi.toLocaleString('pt-BR')}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{h.exercicio}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </SectionBlock>
  );
}
