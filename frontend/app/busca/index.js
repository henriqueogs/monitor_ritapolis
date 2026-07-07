import Link from 'next/link';
import SectionBlock from '../components/SectionBlock';
import { fetchBuscaUnificada } from '../lib/api';
import { formatMoney, formatDate } from '../lib/format';

const MIN_CHARS_BUSCA = 2;

function VerTodos({ href, total }) {
  return (
    <Link href={href} className="availability-badge is-gov" style={{ textDecoration: 'none' }}>
      Ver todos ({total})
    </Link>
  );
}

function LinhaVazia({ texto }) {
  return <p className="empty-state">{texto}</p>;
}

export default async function BuscaPage({ searchParams }) {
  const q = String(searchParams?.q || '').trim();

  if (q.length < MIN_CHARS_BUSCA) {
    return (
      <main className="page-container">
        <div className="page-hero">
          <h1>Busca</h1>
          <p className="page-hero-sub">
            Digite um termo com pelo menos {MIN_CHARS_BUSCA} caracteres — nome de pessoa ou empresa,
            objeto de licitação, número de empenho — pra buscar em documentos, empenhos e credores
            ao mesmo tempo.
          </p>
        </div>
      </main>
    );
  }

  const r = await fetchBuscaUnificada(q);

  return (
    <main className="page-container">
      <div className="page-hero">
        <h1>Busca: “{q}”</h1>
        <p className="page-hero-sub">
          Resultados em três índices — documentos do acervo coletado, empenhos do Portal da
          Transparência e credores (empresas, pessoas, ONGs, órgãos) que receberam pagamentos.
        </p>
      </div>

      <SectionBlock
        title="Documentos e licitações"
        aside={r.documentos.total > 0 ? <VerTodos href={`/acervo?q=${encodeURIComponent(q)}`} total={r.documentos.total} /> : null}
      >
        {r.documentos.dados.length === 0 ? (
          <LinhaVazia texto={`Nenhum documento com “${q}” no acervo coletado.`} />
        ) : (
          <ul className="plain-list">
            {r.documentos.dados.map((d) => (
              <li key={d.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <Link href={`/documento/${d.id}`} style={{ fontWeight: 600, fontSize: 14 }}>
                  {d.titulo}
                </Link>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}>
                  {[d.tipo, d.ano].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionBlock>

      <SectionBlock
        title="Empenhos"
        aside={r.empenhos.total > 0 ? <VerTodos href={`/transparencia/empenhos?q=${encodeURIComponent(q)}`} total={r.empenhos.total} /> : null}
      >
        {r.empenhos.dados.length === 0 ? (
          <LinhaVazia texto={`Nenhum empenho com “${q}” no Portal da Transparência coletado.`} />
        ) : (
          <ul className="plain-list">
            {r.empenhos.dados.map((e) => (
              <li key={e.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ minWidth: 0 }}>
                  <Link href={`/empenho/${e.id}`} style={{ fontWeight: 600, fontSize: 14 }}>
                    Empenho {e.empenho} · {e.exercicio_orcamento}
                  </Link>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}>
                    {e.credor_nome}{e.data_empenho ? ` · ${formatDate(e.data_empenho)}` : ''}
                  </span>
                </span>
                <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(e.valor)}</strong>
              </li>
            ))}
          </ul>
        )}
      </SectionBlock>

      <SectionBlock
        title="Credores"
        aside={r.credores.total > 0 ? <VerTodos href={`/credores?busca=${encodeURIComponent(q)}`} total={r.credores.total} /> : null}
      >
        {r.credores.dados.length === 0 ? (
          <LinhaVazia texto={`Nenhum credor com “${q}” nos pagamentos coletados.`} />
        ) : (
          <ul className="plain-list">
            {r.credores.dados.map((c) => (
              <li key={c.credor_chave || c.credor_cnpj} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ minWidth: 0 }}>
                  <Link href={`/credores/${c.credor_chave || c.credor_cnpj}`} style={{ fontWeight: 600, fontSize: 14 }}>
                    {c.credor_nome}
                  </Link>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}>
                    {c.credor_cnpj ? 'Empresa' : 'Pessoa física'} · {c.n_empenhos} empenho{c.n_empenhos === 1 ? '' : 's'}
                    {c.primeiro_ano ? ` · ${c.primeiro_ano === c.ultimo_ano ? c.primeiro_ano : `${c.primeiro_ano}–${c.ultimo_ano}`}` : ''}
                  </span>
                </span>
                <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(c.valor_total)}</strong>
              </li>
            ))}
          </ul>
        )}
      </SectionBlock>
    </main>
  );
}
