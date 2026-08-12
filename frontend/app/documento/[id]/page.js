import DocumentoPage from './index';
import { fetchDocumento } from '../../lib/api';

// Cauda longa de SEO: cada documento com título e description reais.
export async function generateMetadata(props) {
  const params = await props.params;
  const documento = await fetchDocumento(params.id).catch(() => null);
  if (!documento?.titulo) {
    return { title: 'Documento oficial de Ritápolis' };
  }
  const resumoBase =
    documento.resumo_ai?.dados?.resumo_cidadao || documento.resumo_ai?.dados?.objeto || documento.titulo;
  const description = `${String(resumoBase).replace(/\s+/g, ' ').trim().slice(0, 155)} — documento oficial de Ritápolis/MG, com link pra fonte.`;
  return {
    title: documento.titulo,
    description,
    openGraph: { title: documento.titulo, description },
  };
}

export default DocumentoPage;
