import Link from 'next/link';
import { fetchTransparenciaFinalidade } from '../../../lib/api';
import { formatMoney } from '../../../lib/format';
import SectionBlock from '../../../components/SectionBlock';
import PeriodoSelector from '../../../components/PeriodoSelector';
import TransparenciaSubnav from '../../../components/TransparenciaSubnav';
import FinalidadeBadge from '../../../components/FinalidadeBadge';
import TabelaEmpenhos from '../../../components/TabelaEmpenhos';

export async function generateMetadata({ params: paramsPromise }) {
  const params = await paramsPromise;
  const dossie = await fetchTransparenciaFinalidade(params.classe);
  return {
    title: dossie
      ? `${dossie.finalidade.rotulo} - Dinheiro publico`
      : 'Finalidade',
  };
}

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

function TabelaAgregado({ titulo, rows, chaveNome, periodoLabel, limparPrefixo = true }) {
  if (!rows?.length) { return null; }
  return (
    <SectionBlock title={`${titulo} (${periodoLabel})`}>
      <div className="simple-table">
        {rows.slice(0, 10).map((r) => (
          <div key={r[chaveNome] || 'sem'} className="table-row" style={{ display: 'grid', gridTemplateColumns: '1fr 90px 130px', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 13 }}>
              {limparPrefixo ? (r[chaveNome] || '-').replace(/^[\d.]+\s*-\s*/, '') : r[chaveNome] || '-'}
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

function SeriePorAno({ porAno, periodo }) {
  if (!porAno?.length) { return null; }
  const maxAno = Math.max(...porAno.map((row) => row.valor_total), 1);
  const label = periodo.anos_cobertos?.length ? periodo.anos_cobertos.join('-') : 'periodo coletado';
  return (
    <SectionBlock title={`Por ano (${label})`}>
      {porAno.slice().reverse().map((row) => (
        <div key={row.exercicio} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 3 }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>{row.exercicio}</span>
            <span style={{ display: 'flex', gap: 16, fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>{row.n.toLocaleString('pt-BR')} empenhos</span>
              <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(row.valor_total)}</strong>
            </span>
          </div>
          <div style={{ height: 6, background: 'var(--surface-muted)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${Math.round((row.valor_total / maxAno) * 100)}%`, height: '100%', background: 'var(--accent)', borderRadius: 3 }} />
          </div>
        </div>
      ))}
    </SectionBlock>
  );
}

export default async function FinalidadeDossiePage({
  params: paramsPromise,
  searchParams: searchParamsPromise
}) {
  const [params, searchParams] = await Promise.all([paramsPromise, searchParamsPromise]);
  const { modo, fetchParams } = resolverFiltro(searchParams);
  const dossie = await fetchTransparenciaFinalidade(params.classe, fetchParams);

  if (!dossie) {
    return (
      <main className="page-container">
        <div className="page-title">
          <Link href="/transparencia/finalidades" style={{ color: 'var(--text-muted)', fontSize: 13 }}>Voltar para finalidades</Link>
          <h1>Finalidade nao encontrada</h1>
        </div>
      </main>
    );
  }

  const { finalidade, periodo, por_ano, por_mandato, resumo, top_credores, por_unidade, por_fonte, empenhos_recentes } = dossie;
  const periodoLabel = montarPeriodoLabel(modo, periodo, por_mandato);
  const query = queryPeriodo(modo, fetchParams);
  const queryComFinalidade = `finalidade=${finalidade.classe}${query ? `&${query}` : ''}`;

  return (
    <main className="page-container">
      <div className="page-hero">
        <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text-muted)' }}>
          <Link href="/transparencia" style={{ color: 'var(--text-muted)' }}>Dinheiro publico</Link>
          {' > '}
          <Link href="/transparencia/finalidades" style={{ color: 'var(--text-muted)' }}>Finalidades</Link>
        </p>
        <h1>{finalidade.rotulo}</h1>
        <p className="page-hero-sub">{finalidade.descricao}</p>
      </div>

      <TransparenciaSubnav />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <FinalidadeBadge finalidade={finalidade} />
        <Link href={`/transparencia/empenhos?${queryComFinalidade}`} className="availability-badge is-gov" style={{ textDecoration: 'none' }}>
          Ver todos os empenhos
        </Link>
        <Link href={`/credores?${queryComFinalidade}`} className="availability-badge" style={{ textDecoration: 'none' }}>
          Ver credores desta finalidade
        </Link>
      </div>

      <div className="admin-metric-grid" style={{ marginBottom: 20 }}>
        <div className="admin-metric-card">
          <span>Valor ({periodoLabel})</span>
          <strong>{formatMoney(resumo.valor_total)}</strong>
        </div>
        <div className="admin-metric-card">
          <span>Empenhos</span>
          <strong>{resumo.n_empenhos.toLocaleString('pt-BR')}</strong>
        </div>
        <div className="admin-metric-card">
          <span>Credores</span>
          <strong>{resumo.n_credores.toLocaleString('pt-BR')}</strong>
        </div>
        <div className="admin-metric-card">
          <span>Orgaos/fontes</span>
          <strong>{resumo.n_unidades.toLocaleString('pt-BR')} / {resumo.n_fontes.toLocaleString('pt-BR')}</strong>
        </div>
      </div>

      <SeriePorAno porAno={por_ano} periodo={periodo} />

      <PeriodoSelector
        porMandato={por_mandato}
        periodo={periodo}
        anosCobertos={periodo.anos_cobertos}
        modo={modo}
        basePath={`/transparencia/finalidades/${finalidade.classe}`}
      />

      {top_credores?.length > 0 && (
        <SectionBlock
          title={`Top credores (${periodoLabel})`}
          description="Quem recebeu dentro desta finalidade no periodo selecionado."
        >
          <div className="simple-table">
            {top_credores.map((credor, idx) => (
              <div key={credor.credor_chave || credor.credor_nome} className="table-row" style={{ display: 'grid', gridTemplateColumns: '36px 1fr 90px 130px', gap: 12, alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{idx + 1}</span>
                <span style={{ fontSize: 13, fontWeight: 500, minWidth: 0 }}>
                  {credor.credor_chave ? (
                    <Link href={`/credores/${credor.credor_chave}?${queryComFinalidade}`}>{credor.credor_nome}</Link>
                  ) : (
                    credor.credor_nome
                  )}
                  {credor.credor_cargo ? (
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                      {credor.credor_cargo}
                    </span>
                  ) : null}
                </span>
                <span style={{ fontSize: 13, textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>
                  {credor.n}x
                </span>
                <span style={{ fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {formatMoney(credor.valor_total)}
                </span>
              </div>
            ))}
          </div>
        </SectionBlock>
      )}

      <TabelaAgregado titulo="Por orgao/secretaria" rows={por_unidade} chaveNome="unidade" periodoLabel={periodoLabel} />
      <TabelaAgregado titulo="Por fonte de recurso" rows={por_fonte} chaveNome="fonte_recurso" periodoLabel={periodoLabel} limparPrefixo={false} />

      <SectionBlock
        title="Empenhos recentes"
        description="Registros atomicos que compoem esta finalidade."
        aside={
          <Link href={`/transparencia/empenhos?${queryComFinalidade}`} className="availability-badge is-gov" style={{ textDecoration: 'none' }}>
            Ver lista completa
          </Link>
        }
      >
        <TabelaEmpenhos dados={empenhos_recentes} mostrarCredor />
      </SectionBlock>

      <SectionBlock
        title="Como esta finalidade e classificada"
        description="A regra abaixo explica por que um empenho entra nesta lente. O registro bruto do Portal da Transparencia permanece preservado."
      >
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>{finalidade.regra}</p>
      </SectionBlock>
    </main>
  );
}
