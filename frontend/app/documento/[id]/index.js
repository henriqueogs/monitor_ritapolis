import DocumentPreviewPane from '../../components/DocumentPreviewPane';
import { fetchDocumento } from '../../lib/api';
import AiSummarySection from './components/AiSummarySection';
import DocumentHeader from './components/DocumentHeader';
import ExtractedTextSections from './components/ExtractedTextSections';
import IdentityAndLimits from './components/IdentityAndLimits';
import LicitationInfo from './components/LicitationInfo';
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
  const documento = await fetchDocumento(params.id);
  const licitacao = documento.licitacao_detalhes || documento.dados_extras?.licitacao || null;

  return (
    <main className="page-container">
      <DocumentHeader documento={documento} licitacao={licitacao} />
      <SummaryAndSource documento={documento} />
      <DocumentPreviewPane documento={documento} />
      <IdentityAndLimits documento={documento} licitacao={licitacao} />
      <AiSummarySection resumoAi={buildResumoAi(documento)} operacao={documento.resumo_ai_operacao} />
      <LicitationInfo documento={documento} licitacao={licitacao} />
      <RelatedSources documento={documento} />
      <ExtractedTextSections documento={documento} />
    </main>
  );
}
