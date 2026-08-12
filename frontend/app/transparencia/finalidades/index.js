import Link from 'next/link';
import { fetchTransparenciaFinalidades } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import SectionBlock from '../../components/SectionBlock';
import FinalidadeBadge from '../../components/FinalidadeBadge';
import PeriodoSelector from '../../components/PeriodoSelector';
import TransparenciaSubnav from '../../components/TransparenciaSubnav';

export const metadata = {
  title: 'Finalidades - Dinheiro publico',
  description: 'Classificacao dos empenhos por finalidade: licitacao, diaria, entidade, folha, auxilio e servicos.',
};

function resolverFiltro(searchParams) {
  if (searchParams?.exercicio) { return { modo: 'exercicio', fetchParams: { exercicio: Number(searchParams.exercicio) } }; }
  if (searchParams?.mandato) { return { modo: 'mandato', fetchParams: { mandato: Number(searchParams.mandato) } }; }
  if (searchParams?.periodo === 'todos') { return { modo: 'todos', fetchParams: {} }; }
  return { modo: 'mandato', fetchParams: { mandato: new Date().getFullYear() } };
}

function montarPeriodoLabel(modo, periodo, porMandato) {
  if (modo === 'exercicio') { return String(periodo.exercicio); }
  if (modo === 'mandato' && periodo.mandato) {
    const grupo = (porMandato || []).find((m) => m.inicio === periodo.mandato.inicio);
    const anos = grupo?.anos || [];
    if (anos.length === 1) { return String(anos[0]); }
    if (anos.length > 1) { return `${anos[0]}-${anos[anos.length - 1]}`; }
    return periodo.mandato.label;
  }
  const [min, max] = periodo.anos_cobertos || [];
  return min && max ? (min === max ? String(min) : `${min}-${max}`) : 'periodo coletado';
}

function queryPeriodo(modo, fetchParams) {
  if (modo === 'todos') { return 'periodo=todos'; }
  return new URLSearchParams(
    Object.fromEntries(Object.entries(fetchParams || {}).map(([k, v]) => [k, String(v)]))
  ).toString();
}

export default async function FinalidadesPage({ searchParams: searchParamsPromise }) {
  const searchParams = await searchParamsPromise;
  const { modo, fetchParams } = resolverFiltro(searchParams);
  const dados = await fetchTransparenciaFinalidades(fetchParams);
  const finalidades = dados?.finalidades || [];
  const periodo = dados?.periodo || { anos_cobertos: [] };
  const porMandato = dados?.por_mandato || [];
  const total = dados?.total || { n_empenhos: 0, valor_total: 0, n_finalidades: 0 };
  const periodoLabel = montarPeriodoLabel(modo, periodo, porMandato);
  const query = queryPeriodo(modo, fetchParams);
  const sufixo = query ? `?${query}` : '';

  return (
    <main className="page-container">
      <div className="page-hero">
        <h1>Finalidades do dinheiro publico</h1>
        <p className="page-hero-sub">
          A mesma base de empenhos vista por finalidade: licitacao, diaria, entidade, folha, auxilio, servicos e outros movimentos.
        </p>
      </div>

      <TransparenciaSubnav />

      <div className="admin-metric-grid" style={{ marginBottom: 20 }}>
        <div className="admin-metric-card">
          <span>Empenhos classificados ({periodoLabel})</span>
          <strong>{total.n_empenhos.toLocaleString('pt-BR')}</strong>
        </div>
        <div className="admin-metric-card">
          <span>Valor movimentado</span>
          <strong>{formatMoney(total.valor_total)}</strong>
        </div>
        <div className="admin-metric-card">
          <span>Finalidades com movimento</span>
          <strong>{total.n_finalidades}</strong>
        </div>
      </div>

      <PeriodoSelector
        porMandato={porMandato}
        periodo={periodo}
        anosCobertos={periodo.anos_cobertos}
        modo={modo}
        basePath="/transparencia/finalidades"
      />

      <SectionBlock
        title={`Composicao por finalidade (${periodoLabel})`}
        description="Clique em uma finalidade para ver a regra, serie anual, top credores, orgaos, fontes de recurso e empenhos recentes."
      >
        <div className="products-table">
          {finalidades.map((item) => {
            const pct = total.valor_total ? Math.round((item.valor_total / total.valor_total) * 100) : 0;
            return (
              <article key={item.classe} className="product-row">
                <div className="product-row-main">
                  <div className="document-row-meta">
                    <FinalidadeBadge finalidade={item} />
                    <span>{item.n.toLocaleString('pt-BR')} empenhos</span>
                    <span>{pct}% do valor</span>
                    <span>{item.n_credores.toLocaleString('pt-BR')} credores</span>
                  </div>
                  <h3 style={{ margin: '4px 0', fontSize: '1rem' }}>
                    <Link href={`/transparencia/finalidades/${item.classe}${sufixo}`} style={{ color: 'inherit' }}>
                      {item.rotulo}
                    </Link>
                  </h3>
                  <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>{item.descricao}</p>
                  <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Link href={`/transparencia/finalidades/${item.classe}${sufixo}`} className="availability-badge is-gov" style={{ textDecoration: 'none' }}>
                      Abrir dossie
                    </Link>
                    <Link href={`/transparencia/empenhos?finalidade=${item.classe}${query ? `&${query}` : ''}`} className="availability-badge" style={{ textDecoration: 'none' }}>
                      Ver empenhos
                    </Link>
                    <Link href={`/credores?finalidade=${item.classe}${query ? `&${query}` : ''}`} className="availability-badge" style={{ textDecoration: 'none' }}>
                      Ver credores
                    </Link>
                  </div>
                </div>
                <div className="product-row-side">
                  <div className="document-row-field">
                    <span>Valor</span>
                    <strong>{formatMoney(item.valor_total)}</strong>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </SectionBlock>
    </main>
  );
}
