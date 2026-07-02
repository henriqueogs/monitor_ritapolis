import { formatMoney } from '../../../lib/format';
import SectionBlock from '../../../components/SectionBlock';

function labelMandato(m) {
  const cobertos = m.anos?.length ? `${m.anos[0]}–${m.anos[m.anos.length - 1]}` : '';
  const anosEsperados = m.fim - m.inicio + 1;
  const parcial = m.anos?.length && m.anos.length < anosEsperados && !m.em_curso;
  const sufixo = m.em_curso ? ' (em curso)' : parcial ? ` (dados de ${cobertos})` : '';
  return `Mandato ${m.inicio}–${m.fim}${sufixo}`;
}

/**
 * Barras de recebimento por ano agrupadas por mandato (§11.1 — todo valor
 * carrega o período; mandatos com anos faltando são rotulados como parciais).
 */
export default function HistoricoPorMandato({ porAno, porMandato }) {
  if (!porAno?.length) return null;
  const totalMax = Math.max(...porAno.map((r) => r.valor_total), 1);
  const porAnoMap = new Map(porAno.map((r) => [r.ano, r]));

  return (
    <SectionBlock title="Histórico de recebimentos" description="Valores empenhados por ano, agrupados por mandato municipal.">
      {(porMandato || []).map((m) => (
        <div key={m.mandato} style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{labelMandato(m)}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {m.n_empenhos} empenhos · <strong style={{ color: 'inherit' }}>{formatMoney(m.valor_total)}</strong>
            </span>
          </div>
          {m.anos.slice().reverse().map((ano) => {
            const r = porAnoMap.get(ano);
            if (!r) return null;
            const pct = Math.round((r.valor_total / totalMax) * 100);
            return (
              <div key={ano} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{ano}</span>
                  <span style={{ display: 'flex', gap: 16, fontSize: 13 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{r.n_empenhos} empenhos</span>
                    <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(r.valor_total)}</strong>
                  </span>
                </div>
                <div style={{ height: 6, background: 'var(--surface-muted)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 3 }} />
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </SectionBlock>
  );
}
