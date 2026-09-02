import Link from 'next/link';
import { fetchEmpenho } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import SectionBlock from '../../components/SectionBlock';
import FinalidadeBadge from '../../components/FinalidadeBadge';
import TransparenciaSubnav from '../../components/TransparenciaSubnav';
import BreadcrumbJsonLd from '../../components/BreadcrumbJsonLd';
import LinhaDoTempoPagamento from './components/LinhaDoTempoPagamento';
import EmpenhosRelacionados from './components/EmpenhosRelacionados';

// Vazio de proposito: nao pre-renderiza nenhum id no build (evita bater na
// API, que nao existe em CI). So DEFINIR generateStaticParams (mesmo vazio)
// e o que liga o modo ISR-on-demand nessa rota -- sem isso, `revalidate`
// abaixo e ignorado e a rota fica sempre dynamic (ver PR do cache de bots).
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params: paramsPromise }) {
  const params = await paramsPromise;
  const dossie = await fetchEmpenho(params.id);
  return {
    title: dossie
      ? `Empenho ${dossie.empenho.empenho}/${dossie.empenho.exercicio_orcamento}`
      : 'Empenho',
  };
}

const STATUS_LABEL = {
  pago: { texto: 'Pago', cor: 'var(--success)' },
  liquidado_nao_pago: { texto: 'Liquidado, aguardando pagamento', cor: 'var(--warning)' },
  empenhado: { texto: 'Empenhado, ainda não pago', cor: 'var(--text-muted)' },
};

function limparPrefixo(texto) {
  return texto ? texto.replace(/^[\d.]+\s*-\s*/, '') : null;
}

function CampoOrcamentario({ rotulo, valor }) {
  if (!valor) {return null;}
  return (
    <div className="keyvalue-row">
      <dt>{rotulo}</dt>
      <dd style={{ fontSize: 13 }}>{valor}</dd>
    </div>
  );
}

export default async function EmpenhoPage({ params: paramsPromise }) {
  const params = await paramsPromise;
  const dossie = await fetchEmpenho(params.id);

  if (!dossie) {
    return (
      <main className="page-container">
        <div className="page-title">
          <Link href="/transparencia" style={{ color: 'var(--text-muted)', fontSize: 13 }}>← Dinheiro público</Link>
          <h1>Empenho não encontrado</h1>
          <p>Este registro não existe na base coletada do Portal da Transparência.</p>
        </div>
      </main>
    );
  }

  const { empenho, documento, relacionados } = dossie;
  const status = STATUS_LABEL[empenho.status_pagamento] || STATUS_LABEL.empenhado;
  const finalidadeHref = empenho.finalidade?.classe
    ? `/transparencia/finalidades/${empenho.finalidade.classe}`
    : '/transparencia/finalidades';
  const credorHref = empenho.credor_chave || empenho.credor_cnpj;

  return (
    <main className="page-container">
      <BreadcrumbJsonLd
        items={[
          { name: 'Dinheiro público', url: '/transparencia' },
          { name: `Empenho ${empenho.empenho}/${empenho.exercicio_orcamento}`, url: `/empenho/${params.id}` },
        ]}
      />
      <div className="page-title">
        <div>
          <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text-muted)' }}>
            <Link href="/transparencia" style={{ color: 'var(--text-muted)' }}>← Dinheiro público</Link>
          </p>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--text-muted)' }}>
            <Link href="/transparencia" style={{ color: 'var(--text-muted)' }}>Dinheiro publico</Link>
            {' > '}
            <Link href={finalidadeHref} style={{ color: 'var(--text-muted)' }}>{empenho.finalidade?.rotulo || 'Finalidade'}</Link>
            {' > '}
            {credorHref ? (
              <Link href={`/credores/${credorHref}`} style={{ color: 'var(--text-muted)' }}>{empenho.credor_nome || 'Credor'}</Link>
            ) : (
              <span>{empenho.credor_nome || 'Credor'}</span>
            )}
            {' > Empenho'}
          </p>
          <h1>
            Empenho {empenho.empenho} <span style={{ color: 'var(--text-muted)' }}>· {empenho.exercicio_orcamento}</span>
          </h1>
          <p style={{ margin: '4px 0 0', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="availability-badge is-real">{empenho.categoria_cidada.rotulo}</span>
            <Link href={finalidadeHref} style={{ textDecoration: 'none' }}>
              <FinalidadeBadge finalidade={empenho.finalidade} />
            </Link>
            <span style={{ fontSize: 13, fontWeight: 600, color: status.cor }}>{status.texto}</span>
            {empenho.portal?.url && (
              <a href={empenho.portal.url} target="_blank" rel="noopener noreferrer" className="availability-badge is-gov">
                {empenho.portal.especifico ? '↗ Ver no Portal da Transparência' : '↗ Portal (busca manual)'}
              </a>
            )}
          </p>
        </div>
      </div>

      {/* O quê e quanto */}
      <TransparenciaSubnav />

      <SectionBlock
        title={`O que foi este gasto (${empenho.exercicio_orcamento})`}
        description="Descrição oficial registrada pela Prefeitura no ato do empenho."
      >
        <p style={{ fontSize: 15, lineHeight: 1.55, margin: '0 0 14px' }}>{empenho.historico || 'Sem descrição registrada na fonte.'}</p>
        <div className="admin-metric-grid">
          <div className="admin-metric-card">
            <span>Valor ({empenho.exercicio_orcamento})</span>
            <strong style={{ color: 'var(--accent)' }}>{formatMoney(empenho.valor)}</strong>
          </div>
          <div className="admin-metric-card">
            <span>Credor</span>
            <strong style={{ fontSize: 16, wordBreak: 'break-word' }}>
              {credorHref ? (
                <Link href={`/credores/${credorHref}`} style={{ color: 'inherit' }}>
                  {empenho.credor_nome}
                </Link>
              ) : (
                empenho.credor_nome || 'Não identificado'
              )}
            </strong>
            {empenho.credor_cnpj && (
              <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.6, fontFamily: 'monospace' }}>{empenho.credor_cnpj}</p>
            )}
          </div>
          <div className="admin-metric-card">
            <span>Tipo</span>
            <strong style={{ fontSize: 15 }}>{empenho.tipo || '—'}</strong>
          </div>
        </div>
      </SectionBlock>

      {empenho.finalidade && (
        <SectionBlock
          title="Por que esta finalidade"
          description="Classificacao derivada dos campos oficiais do empenho. Ela nao substitui o registro bruto do Portal da Transparencia."
        >
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <Link href={finalidadeHref} style={{ textDecoration: 'none' }}>
              <FinalidadeBadge finalidade={empenho.finalidade} />
            </Link>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Confianca {Math.round((empenho.finalidade.confianca || 0) * 100)}%
              {empenho.finalidade.subclasse ? ` - ${empenho.finalidade.subclasse}` : ''}
            </span>
          </div>
          {empenho.finalidade.evidencias?.length ? (
            <dl className="keyvalue-list">
              {empenho.finalidade.evidencias.slice(0, 5).map((ev, idx) => (
                <div key={`${ev.campo}-${idx}`} className="keyvalue-row">
                  <dt>{ev.campo}</dt>
                  <dd style={{ fontSize: 13 }}>
                    <span style={{ display: 'block' }}>{ev.valor}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{ev.motivo}</span>
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>Sem evidencias detalhadas para esta regra.</p>
          )}
        </SectionBlock>
      )}

      {/* Linha do tempo */}
      <SectionBlock
        title="Do compromisso ao pagamento"
        description="Todo gasto público passa por três etapas. Aqui está onde este empenho se encontra."
      >
        <LinhaDoTempoPagamento empenho={empenho} />
      </SectionBlock>

      {/* Classificação orçamentária */}
      <SectionBlock
        title="De onde saiu o dinheiro"
        description="Classificação orçamentária oficial — qual órgão gastou, em qual área e com que fonte de recurso."
      >
        <dl className="keyvalue-list">
          <CampoOrcamentario rotulo="Órgão / unidade" valor={limparPrefixo(empenho.unidade)} />
          <CampoOrcamentario rotulo="Área de governo" valor={limparPrefixo(empenho.funcao)} />
          <CampoOrcamentario rotulo="Subárea" valor={limparPrefixo(empenho.subfuncao)} />
          <CampoOrcamentario rotulo="Programa" valor={limparPrefixo(empenho.programa)} />
          <CampoOrcamentario rotulo="Projeto/atividade" valor={limparPrefixo(empenho.projeto_atividade)} />
          <CampoOrcamentario rotulo="Fonte de recurso" valor={empenho.fonte_recurso} />
          <CampoOrcamentario rotulo="Categoria econômica" valor={empenho.categoria_economica} />
        </dl>
      </SectionBlock>

      {/* Licitação vinculada */}
      {documento && (
        <SectionBlock
          title="Licitação de origem"
          description="Processo licitatório vinculado a este empenho por modalidade e número."
        >
          <Link href={`/documento/${documento.id}`} style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)' }}>
            {documento.titulo || `Documento #${documento.id}`}
          </Link>
          {documento.numero && (
            <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--text-muted)' }}>{documento.numero}</span>
          )}
        </SectionBlock>
      )}

      <EmpenhosRelacionados
        relacionados={relacionados}
        credorNome={empenho.credor_nome}
        credorCnpj={empenho.credor_cnpj}
        categoriaRotulo={empenho.categoria_cidada.rotulo}
        categoriaSlug={empenho.categoria_cidada.slug}
      />
    </main>
  );
}
