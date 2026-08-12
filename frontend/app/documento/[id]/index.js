import DocumentPreviewPane from '../../components/DocumentPreviewPane';
import { fetchDocumento, fetchDocumentoProdutos, fetchDocumentoEmpenhos } from '../../lib/api';
import AiSummarySection from './components/AiSummarySection';
import AttachmentsSection from './components/AttachmentsSection';
import DocumentHeader from './components/DocumentHeader';
import EmpenhoSection from './components/EmpenhoSection';
import IdentityAndLimits from './components/IdentityAndLimits';
import IntegratedReadingSection from './components/IntegratedReadingSection';
import LicitationProducts from './components/LicitationProducts';
import LicitationGroup from './components/LicitationGroup';
import LicitationRelatedSources from './components/LicitationRelatedSources';
import RelatedSources from './components/RelatedSources';
import SummaryAndSource from './components/SummaryAndSource';

function buildResumoAi(documento) {
  return {
    ...documento.resumo_ai,
    documento_id: documento.id,
    texto_hash_atual: documento.texto_hash_atual,
    job: documento.resumo_ai_job
  };
}

export default async function DocumentoPage({ params: paramsPromise }) {
  const params = await paramsPromise;
  const [documento, produtos] = await Promise.all([
    fetchDocumento(params.id),
    fetchDocumentoProdutos(params.id)
  ]);
  const licitacao = documento.licitacao_detalhes || documento.dados_extras?.licitacao || null;

  const empenhos = documento.tipo === 'edital'
    ? await fetchDocumentoEmpenhos(params.id)
    : null;

  // Dados estruturados da página de documento (SEO)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: String(documento.titulo || '').slice(0, 110),
    datePublished: documento.data_publicacao || undefined,
    inLanguage: 'pt-BR',
    publisher: { '@type': 'Organization', name: 'Ritápolis.com' },
    isBasedOn: documento.url_origem || undefined,
  };

  return (
    <main className="page-container">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <DocumentHeader documento={documento} licitacao={licitacao} />
      <SummaryAndSource documento={documento} />
      <DocumentPreviewPane documento={documento} />
      <AttachmentsSection documento={documento} />
      <IdentityAndLimits documento={documento} licitacao={licitacao} />
      <AiSummarySection resumoAi={buildResumoAi(documento)} operacao={documento.resumo_ai_operacao} />
      {documento.tipo === 'edital' ? (
        <IntegratedReadingSection leitura={documento.leitura_integrada_ai} documentoId={documento.id} />
      ) : null}
      {documento.tipo === 'edital' && documento.licitacao_grupo ? (
        <LicitationGroup grupo={documento.licitacao_grupo} />
      ) : null}
      {documento.tipo === 'edital' ? (
        <LicitationProducts
          produtos={produtos}
          documento={documento}
          valorFinalProcesso={licitacao?.valor_final ?? null}
        />
      ) : null}
      {documento.tipo === 'edital' ? <EmpenhoSection empenhos={empenhos} /> : null}
      {documento.tipo === 'edital' ? (
        <LicitationRelatedSources fontes={documento.licitacao_fontes_relacionadas} />
      ) : null}
      {documento.tipo !== 'edital' ? <RelatedSources documento={documento} /> : null}
    </main>
  );
}
