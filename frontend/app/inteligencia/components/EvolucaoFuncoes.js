import { formatMoney } from '../../lib/format';
import SectionBlock from '../../components/SectionBlock';

// Mapa de ícones/cores por area funcional
function funcaoLabel(funcao) {
  const emojis = {
    'SAÚDE': '🏥', 'EDUCAÇÃO': '🎓', 'ADMINISTRAÇÃO': '🏛️',
    'URBANISMO': '🏗️', 'ASSISTÊNCIA SOCIAL': '🤝', 'PREVIDÊNCIA SOCIAL': '🏦',
    'LEGISLATIVA': '⚖️', 'TRANSPORTE': '🚌', 'AGROPECUÁRIA': '🌾',
    'CULTURA': '🎭', 'HABITAÇÃO': '🏠', 'SANEAMENTO': '💧',
    'GESTÃO AMBIENTAL': '🌿', 'DESPORTO E LAZER': '⚽',
    'EXTRA ORÇAMENTÁRIO': '📋',
  };
  const nome = funcao?.split(' - ').slice(1).join(' - ').toUpperCase() || '';
  for (const [key, emoji] of Object.entries(emojis)) {
    if (nome.includes(key)) return `${emoji} ${funcao}`;
  }
  return funcao;
}

function CrescimentoBadge({ pct }) {
  if (pct === null || pct === undefined) return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>;
  const up = pct > 0;
  const color = up ? (pct > 30 ? 'var(--error)' : 'var(--warning)') : 'var(--success)';
  return (
    <span style={{
      fontSize: 12, fontWeight: 700, color,
      background: 'color-mix(in srgb, currentColor 12%, transparent)',
      padding: '2px 8px', borderRadius: 10, fontVariantNumeric: 'tabular-nums',
    }}>
      {up ? '▲' : '▼'} {Math.abs(pct)}%
    </span>
  );
}

export default function EvolucaoFuncoes({ dados }) {
  if (!dados) return null;
  const { total_por_ano, por_funcao } = dados;
  const anos = total_por_ano?.map((r) => r.ano) || [];
  const principais = (por_funcao || []).filter((f) => f.total_periodo > 500_000).slice(0, 8);

  const totalMax = Math.max(...(total_por_ano || []).map((r) => r.total), 1);

  return (
    <SectionBlock
      title="B3 — Evolução de gastos por área funcional"
      description="Despesas executadas por exercício e área de governo. Crescimento indica variação 2024→2025."
    >
      {/* Total por ano */}
      {total_por_ano?.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
            Total executado por ano
          </p>
          {total_por_ano.map((r) => {
            const pct = Math.round((r.total / totalMax) * 100);
            return (
              <div key={r.ano} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{r.ano}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(r.total)}</span>
                </div>
                <div style={{ height: 6, background: 'var(--surface-muted)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 3 }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Por funcao */}
      {principais.length > 0 && (
        <>
          <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
            Principais áreas — evolução anual
          </p>
          <div className="table-scroll-x">
            <div className="simple-table" style={{ minWidth: `${380 + anos.length * 100}px` }}>
              <div className="table-row table-row-header">
                <span>Área funcional</span>
                {anos.map((a) => <span key={a}>{a}</span>)}
                <span>Crescimento</span>
              </div>
              {principais.map((f) => (
                <div key={f.funcao} className="table-row">
                  <span style={{ fontSize: 13 }}>{funcaoLabel(f.funcao)}</span>
                  {anos.map((a) => (
                    <span key={a} style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
                      {f.anos[a] ? formatMoney(f.anos[a].valor_total) : '—'}
                    </span>
                  ))}
                  <span><CrescimentoBadge pct={f.crescimento_yoy} /></span>
                </div>
              ))}
            </div>
          </div>
          <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
            Crescimento acima de 30% em vermelho — pode indicar expansão de programa ou alteração orçamentária relevante. Crescimento negativo em verde.
          </p>
        </>
      )}
    </SectionBlock>
  );
}
