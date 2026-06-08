import DocumentPreviewPane from '../../components/DocumentPreviewPane';
import { fetchDocumento, fetchDocumentoProdutos } from '../../lib/api';
import AiSummarySection from './components/AiSummarySection';
import DocumentHeader from './components/DocumentHeader';
import ExtractedTextSections from './components/ExtractedTextSections';
import IdentityAndLimits from './components/IdentityAndLimits';
import IntegratedReadingSection from './components/IntegratedReadingSection';
import LicitationInfo from './components/LicitationInfo';
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

export default async function DocumentoPage({ params }) {
  const [documento, produtos] = await Promise.all([
    fetchDocumento(params.id),
    fetchDocumentoProdutos(params.id)
  ]);
  const licitacao = documento.licitacao_detalhes || documento.dados_extras?.licitacao || null;

  return (
    <main className="page-container">
      <DocumentHeader documento={documento} licitacao={licitacao} />
      <SummaryAndSource documento={documento} />
      <DocumentPreviewPane documento={documento} />
      <IdentityAndLimits documento={documento} licitacao={licitacao} />
      {documento.tipo === 'edital' ? (
        <IntegratedReadingSection leitura={documento.leitura_integrada_ai} documentoId={documento.id} />
      ) : null}
      <AiSummarySection resumoAi={buildResumoAi(documento)} operacao={documento.resumo_ai_operacao} />
      <LicitationInfo documento={documento} licitacao={licitacao} />
      {documento.tipo === 'edital' && documento.licitacao_grupo ? (
        <LicitationGroup grupo={documento.licitacao_grupo} />
      ) : null}
      {documento.tipo === 'edital' ? <LicitationProducts produtos={produtos} /> : null}
      {documento.tipo === 'edital' ? (
        <LicitationRelatedSources fontes={documento.licitacao_fontes_relacionadas} />
      ) : null}
      <RelatedSources documento={documento} />
      <ExtractedTextSections documento={documento} />
    </main>
  );
}
