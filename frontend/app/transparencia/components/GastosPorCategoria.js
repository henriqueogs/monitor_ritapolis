import Link from 'next/link';
import SectionBlock from '../../components/SectionBlock';
import { formatMoney } from '../../lib/format';

const MAX_CATEGORIAS = 12;

/**
 * "Pra onde vai o dinheiro": gasto por categoria cidadã no período
 * selecionado. Cada categoria abre a página com ranking de recebedores.
 */
export default function GastosPorCategoria({ categorias, periodoLabel, queryPeriodo }) {
  const lista = (categorias || []).slice(0, MAX_CATEGORIAS);
  if (!lista.length) {return null;}
  const max = Math.max(...lista.map((c) => c.valor_total), 1);
  const sufixo = queryPeriodo ? `?${queryPeriodo}` : '';

  return (
    <SectionBlock
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
                <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(c.valor_total)}</strong>
              </span>
            </span>
            <span style={{ display: 'block', height: 8, background: 'var(--surface-muted)', borderRadius: 4, overflow: 'hidden' }}>
              <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 4 }} />
            </span>
          </Link>
        );
      })}
    </SectionBlock>
  );
}
