import { formatMoney } from '../../lib/format';
import SectionBlock from '../../components/SectionBlock';

// Apenas funcoes que representam gastos relevantes (evita poluir com subfuncoes mínimas)
const FUNCAO_MIN_VALOR = 200_000;

export default function RankingFuncoes({ dados }) {
  if (!dados) return null;
  const { exercicio, funcoes } = dados;
  const relevantes = (funcoes || []).filter((f) => f.total_funcao >= FUNCAO_MIN_VALOR);

  return (
    <SectionBlock
      title="B4 — Ranking de fornecedores por área de governo"
      description={`Top fornecedores privados em cada área funcional em ${exercicio}. Exclui folha de pagamento e repasses obrigatórios.`}
    >
      {relevantes.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Nenhum dado disponível.</p>
      )}
      {relevantes.map((f) => (
        <div key={f.funcao} style={{ marginBottom: 24 }}>
          {/* Cabeçalho da área */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{f.funcao}</h3>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
              {formatMoney(f.total_funcao)} · {f.n_credores} fornecedores
            </span>
          </div>

          {f.credores.length === 0 && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
              Gastos desta área são majoritariamente de entidades governamentais (folha, repasses).
            </p>
          )}

          {f.credores.length > 0 && (
            <div>
              {f.credores.map((c, idx) => {
                const barWidth = Math.round((c.valor_total / f.total_funcao) * 100);
                return (
                  <div
                    key={c.credor_cnpj}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '20px 1fr auto auto',
                      gap: '0 10px',
                      alignItems: 'center',
                      padding: '6px 0',
                      borderBottom: idx < f.credores.length - 1 ? '1px solid var(--border)' : 'none',
                    }}
                  >
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center' }}>
                      {idx + 1}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.credor_nome}
                      </span>
                      <div style={{ marginTop: 3, height: 3, background: 'var(--surface-muted)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${barWidth}%`, height: '100%', background: 'var(--accent)', borderRadius: 2 }} />
                      </div>
                    </div>
                    <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {formatMoney(c.valor_total)}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: c.share_pct > 30 ? 'var(--warning)' : 'var(--text-muted)',
                        background: 'var(--surface-muted)',
                        padding: '2px 7px',
                        borderRadius: 10,
                        fontVariantNumeric: 'tabular-nums',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {c.share_pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </SectionBlock>
  );
}
