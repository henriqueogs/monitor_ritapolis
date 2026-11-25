import Link from 'next/link';
import SectionBlock from '../../components/SectionBlock';
import { formatMoney } from '../../lib/format';
import NotaEstimadoGlobal from './NotaEstimadoGlobal';

const MAX_CATEGORIAS = 12;

/**
 * "Pra onde vai o dinheiro": gasto por categoria cidadã no período
 * selecionado. Cada categoria abre a página com ranking de recebedores.
 */
export default function GastosPorCategoria({ categorias, periodoLabel, queryPeriodo, bare = false }) {
  const todas = categorias || [];
  const lista = todas.slice(0, MAX_CATEGORIAS);
  if (!lista.length) {return null;}
  // Restante + total visíveis: a aba precisa fechar com a de finalidade (mesmo gasto).
  const restantes = todas.slice(MAX_CATEGORIAS);
  const valorRestante = restantes.reduce((acc, c) => acc + c.valor_total, 0);
  const total = todas.reduce((acc, c) => acc + c.valor_total, 0);
  const max = Math.max(...lista.map((c) => c.valor_total), 1);
  const sufixo = queryPeriodo ? `?${queryPeriodo}` : '';

  return (
    <SectionBlock
      bare={bare}
      title={`Pra onde vai o dinheiro (${periodoLabel})`}
      description="Gasto por tipo de despesa, traduzido do código orçamentário oficial. Clique numa categoria para ver quem mais recebe e todos os empenhos."
    >
      {lista.map((c) => {
        const pct = Math.round((c.valor_total / max) * 100);
        return (
          <Link
            key={c.slug}
            href={`/transparencia/categoria/${c.slug}${sufixo}`}
            style={{ display: 'block', textDecoration: 'none', color: 'inherit', marginBottom: 10 }}
          >
            <span style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--accent)' }}>{c.rotulo}</span>
              <span style={{ display: 'flex', gap: 16, fontSize: 13 }}>
                <span style={{ color: 'var(--text-muted)' }}>{c.n_empenhos.toLocaleString('pt-BR')} empenhos</span>
                <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatMoney(c.valor_total)}
                  <NotaEstimadoGlobal valor={c.valor_estimado_global} />
                </strong>
              </span>
            </span>
            <span style={{ display: 'block', height: 8, background: 'var(--surface-muted)', borderRadius: 4, overflow: 'hidden' }}>
              <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 4 }} />
            </span>
          </Link>
        );
      })}
      {restantes.length ? (
        <p style={{ display: 'flex', justifyContent: 'space-between', margin: '4px 0', fontSize: 13, color: 'var(--text-muted)' }}>
          <span>Outras {restantes.length} categorias</span>
          <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(valorRestante)}</strong>
        </p>
      ) : null}
      <p style={{ display: 'flex', justifyContent: 'space-between', margin: '10px 0 0', paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 14 }}>
        <span>Total empenhado ordinário ({periodoLabel})</span>
        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(total)}</strong>
      </p>
    </SectionBlock>
  );
}
