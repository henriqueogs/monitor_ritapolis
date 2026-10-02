import DocumentoPage from './index';
import { fetchDocumento } from '../../lib/api';
import { bestResumo, cleanDocumentTitle } from '../../lib/format';
import { BRAND, SITE_URL } from '../../lib/brand';
import { buildContentMetadata } from '../../../lib/page-metadata';

// Cauda longa de SEO: cada documento com título e description reais.
export async function generateMetadata(props) {
  const params = await props.params;
  const documento = await fetchDocumento(params.id).catch(() => null);
  if (!documento?.titulo) {
    return { title: 'Documento oficial de Ritápolis' };
  }
  return buildContentMetadata({
    path: `/documento/${params.id}`,
    title: cleanDocumentTitle(documento) || documento.titulo,
    number: documento.numero,
    description: bestResumo(documento),
  }, { siteUrl: SITE_URL, brand: BRAND });
}

export default DocumentoPage;
