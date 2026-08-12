import Link from 'next/link';
import { fetchTransparenciaCategoria } from '../../../lib/api';
import { formatMoney } from '../../../lib/format';
import SectionBlock from '../../../components/SectionBlock';
import PeriodoSelector from '../../../components/PeriodoSelector';
import TransparenciaSubnav from '../../../components/TransparenciaSubnav';

export async function generateMetadata({ params: paramsPromise }) {
  const params = await paramsPromise;
  const dossie = await fetchTransparenciaCategoria(params.slug);
  return {
    title: dossie
      ? `${dossie.categoria.rotulo} — Dinheiro público`
      : 'Categoria',
  };
}

function resolverFiltro(searchParams) {
  if (searchParams?.exercicio) {return { modo: 'exercicio', fetchParams: { exercicio: Number(searchParams.exercicio) } };}
  if (searchParams?.mandato) {return { modo: 'mandato', fetchParams: { mandato: Number(searchParams.mandato) } };}
  if (searchParams?.periodo === 'todos') {return { modo: 'todos', fetchParams: {} };}
  return { modo: 'mandato', fetchParams: { mandato: new Date().getFullYear() } };
}

function labelPeriodo(modo, periodo, porMandato) {
  if (modo === 'exercicio') {return String(periodo.exercicio);}
  if (modo === 'mandato' && periodo.mandato) {
    const grupo = (porMandato || []).find((m) => m.inicio === periodo.mandato.inicio);
    const anos = grupo?.anos || [];
    if (anos.length === 1) {return String(anos[0]);}
    if (anos.length > 1) {return `${anos[0]}–${anos[anos.length - 1]}`;}
    return periodo.mandato.label;
  }
  const [min, max] = periodo.anos_cobertos || [];
  return min && max ? (min === max ? String(min) : `${min}–${max}`) : 'período coletado';
}

function TabelaAgregado({ titulo, rows, chaveNome, periodoLabel, limparPrefixo = true }) {
  if (!rows?.length) {return null;}
  const top = rows.slice(0, 10);
  return (
    <SectionBlock title={`${titulo} (${periodoLabel})`}>
      <div className="simple-table">
        {top.map((r) => (
          <div key={r[chaveNome] || 'sem'} className="table-row" style={{ display: 'grid', gridTemplateColumns: '1fr 90px 130px', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 13 }}>
              {limparPrefixo ? (r[chaveNome] || '—').replace(/^[\d.]+\s*-\s*/, '') : r[chaveNome] || '—'}
            </span>
            <span style={{ fontSize: 13, textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>
              {r.n.toLocaleString('pt-BR')}
            </span>
            <span style={{ fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {formatMoney(r.valor_total)}
            </span>
          </div>
        ))}
      </div>
    </SectionBlock>
  );
}

export default async function CategoriaPage({
  params: paramsPromise,
  searchParams: searchParamsPromise
}) {
  const [params, searchParams] = await Promise.all([paramsPromise, searchParamsPromise]);
  const { modo, fetchParams } = resolverFiltro(searchParams);
  const dossie = await fetchTransparenciaCategoria(params.slug, fetchParams);

  if (!dossie) {
    return (
      <main className="page-container">
        <div className="page-title">
          <Link href="/transparencia" style={{ color: 'var(--text-muted)', fontSize: 13 }}>← Dinheiro público</Link>
          <h1>Categoria não encontrada</h1>
        </div>
      </main>
    );
  }

  const { categoria, periodo, por_ano, por_mandato, top_credores, por_unidade, por_fonte } = dossie;
  const periodoLabel = labelPeriodo(modo, periodo, por_mandato);
  const isDiarias = categoria.slug === 'diarias';
  const totalPeriodo = top_credores.reduce((s, c) => s + c.valor_total, 0);
  const maxAno = Math.max(...(por_ano || []).map((r) => r.valor_total), 1);
  const queryEmpenhos = new URLSearchParams({
    categoria: categoria.slug,
    ...(periodo.exercicio ? { exercicio: String(periodo.exercicio) } : {}),
  }).toString();

  return (
    <main className="page-container">
      <div className="page-hero">
        <p style={{ margin: '0 0 6px', fontSize: 13 }}>
          <Link href="/transparencia" style={{ color: 'var(--text-muted)' }}>← Dinheiro público</Link>
        </p>
        <h1>{categoria.rotulo}</h1>
        <p className="page-hero-sub">
          Gastos da Prefeitura com {categoria.rotulo.toLowerCase()}, traduzidos do código orçamentário oficial.
          Fonte: Portal da Transparência.
        </p>
      </div>

      {/* Série por ano */}
      <TransparenciaSubnav />

      {por_ano?.length > 0 && (
        <SectionBlock title={`Por ano (${periodo.anos_cobertos.join('–')})`}>
          {por_ano.slice().reverse().map((r) => (
            <div key={r.exercicio} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{r.exercicio}</span>
                <span style={{ display: 'flex', gap: 16, fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{r.n.toLocaleString('pt-BR')} empenhos</span>
                  <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(r.valor_total)}</strong>
                </span>
              </div>
              <div style={{ height: 6, background: 'var(--surface-muted)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${Math.round((r.valor_total / maxAno) * 100)}%`, height: '100%', background: 'var(--accent)', borderRadius: 3 }} />
              </div>
            </div>
          ))}
        </SectionBlock>
      )}

      <PeriodoSelector
        porMandato={por_mandato}
        periodo={periodo}
        anosCobertos={periodo.anos_cobertos}
        modo={modo}
        basePath={`/transparencia/categoria/${categoria.slug}`}
      />

      {/* Quem mais recebe */}
      {top_credores?.length > 0 && (
        <SectionBlock
          title={`Quem mais recebe (${periodoLabel})`}
          description={
            isDiarias
              ? `Diárias pagas a servidores no período ${periodoLabel} — fonte: Portal da Transparência. Clique para ver o perfil completo.`
              : `Top ${top_credores.length} recebedores somando ${formatMoney(totalPeriodo)} no período. Clique para ver o perfil completo.`
          }
          aside={
            <Link href={`/transparencia/empenhos?${queryEmpenhos}`} className="availability-badge is-gov" style={{ textDecoration: 'none' }}>
              Ver todos os empenhos
            </Link>
          }
        >
          <div className="simple-table">
            {top_credores.map((c, i) => (
              <div key={c.credor_chave || c.credor_nome} className="table-row" style={{ display: 'grid', gridTemplateColumns: '36px 1fr 90px 130px', gap: 12, alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{i + 1}</span>
                <span style={{ fontSize: 13, fontWeight: 500, minWidth: 0 }}>
                  {c.credor_chave ? (
                    <Link href={`/credores/${c.credor_chave}`}>{c.credor_nome}</Link>
                  ) : (
                    c.credor_nome
                  )}
                  {c.credor_cargo ? (
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                      {c.credor_cargo}
                    </span>
                  ) : null}
                </span>
                <span style={{ fontSize: 13, textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>
                  {isDiarias ? `${c.n} diária${c.n === 1 ? '' : 's'}` : `${c.n}×`}
                </span>
                <span style={{ fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {formatMoney(c.valor_total)}
                </span>
              </div>
            ))}
          </div>
        </SectionBlock>
      )}

      <TabelaAgregado titulo="Por órgão/secretaria" rows={por_unidade} chaveNome="unidade" periodoLabel={periodoLabel} />
      <TabelaAgregado titulo="Por fonte de recurso" rows={por_fonte} chaveNome="fonte_recurso" periodoLabel={periodoLabel} limparPrefixo={false} />
    </main>
  );
}
