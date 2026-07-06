import React from 'react';
import Link from 'next/link';
import SectionBlock from '../../components/SectionBlock';
import { formatMoney } from '../../lib/format';

const th = { padding: '10px 8px', color: 'var(--text-secondary)', fontWeight: 600 };
const thRight = { ...th, textAlign: 'right' };

function pct(part, total) {
  if (!total) return '—';
  return `${Math.round((part / total) * 100)}%`;
}

function labelMandato(m) {
  const esperados = m.fim - m.inicio + 1;
  const sufixo = m.em_curso
    ? ' — em curso'
    : m.anos.length < esperados
      ? ` — dados de ${m.anos[0]}–${m.anos[m.anos.length - 1]}`
      : '';
  return `Mandato ${m.inicio}–${m.fim}${sufixo}`;
}

function LinhaExercicio({ row }) {
  // % execução compara previsto × EMPENHADO (competência) — valor_total inclui
  // ordens de pagamento (caixa, inclusive restos a pagar) e inflaria o número.
  const empenhado = row.valor_empenhado ?? row.valor_total;
  const execucao =
    row.valor_receita_previsto && empenhado
      ? Math.round((empenhado / row.valor_receita_previsto) * 100)
      : null;
  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={{ padding: '11px 8px', fontWeight: 600 }}>
        <Link href={`/transparencia?exercicio=${row.exercicio}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
          {row.exercicio}
        </Link>
      </td>
      <td style={{ padding: '11px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>
        {row.valor_receita_previsto != null ? formatMoney(row.valor_receita_previsto) : '—'}
      </td>
      <td style={{ padding: '11px 8px', textAlign: 'right', fontWeight: 600 }}>{formatMoney(empenhado)}</td>
      <td style={{ padding: '11px 8px', textAlign: 'right' }}>
        {execucao != null ? (
          <span style={{ color: execucao > 95 ? 'var(--warning)' : execucao > 70 ? 'var(--success)' : 'var(--text-secondary)', fontWeight: 600 }}>
            {execucao}%
          </span>
        ) : (
          '—'
        )}
      </td>
      <td style={{ padding: '11px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>
        {row.n_empenhos?.toLocaleString('pt-BR')}
      </td>
      <td style={{ padding: '11px 8px', textAlign: 'right' }}>
        <span title={`${row.n_empenhos_vinculados} empenhos em ${row.n_vinculados} licitações`}>
          {pct(row.n_empenhos_vinculados, row.n_empenhos)}
        </span>
      </td>
    </tr>
  );
}

/**
 * Execução por exercício, agrupada por mandato com subtotais. Clicar num
 * exercício filtra a página inteira por aquele ano.
 */
export default function TabelaExercicios({ porAno, porMandato }) {
  const porAnoMap = new Map((porAno || []).map((r) => [r.exercicio, r]));

  return (
    <SectionBlock
      title="Por mandato e exercício"
      description="Valor empenhado vs. orçamento de receita previsto (LOA aprovada pela Câmara). Valor empenhado ≠ valor pago. Clique num exercício para filtrar toda a página."
    >
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={th}>Exercício</th>
            <th style={thRight}>Receita prevista (LOA)</th>
            <th style={thRight}>Despesa executada</th>
            <th style={thRight}>% execução</th>
            <th style={thRight}>Empenhos</th>
            <th style={thRight}>Vinculados</th>
          </tr>
        </thead>
        <tbody>
          {(porMandato || []).map((m) => (
            <React.Fragment key={m.mandato}>
              <tr style={{ background: 'var(--surface-muted)' }}>
                <td colSpan={2} style={{ padding: '8px', fontSize: '0.82rem', fontWeight: 700 }}>
                  {labelMandato(m)}
                </td>
                <td style={{ padding: '8px', textAlign: 'right', fontSize: '0.82rem', fontWeight: 700 }}>
                  {formatMoney(m.valor_total)}
                </td>
                <td />
                <td style={{ padding: '8px', textAlign: 'right', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  {m.n_empenhos?.toLocaleString('pt-BR')}
                </td>
                <td style={{ padding: '8px', textAlign: 'right', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  {pct(m.n_empenhos_vinculados, m.n_empenhos)}
                </td>
              </tr>
              {m.anos
                .slice()
                .reverse()
                .map((ano) => (porAnoMap.has(ano) ? <LinhaExercicio key={ano} row={porAnoMap.get(ano)} /> : null))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </SectionBlock>
  );
}
