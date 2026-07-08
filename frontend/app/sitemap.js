import { SITE_URL } from './lib/brand';
import { fetchDocumentos, fetchCredores, fetchAlertas } from './lib/api';

// Sitemap dinâmico: páginas estáticas + documentos + top credores + descobertas.
// Empenhos (30k+) ficam de fora por crawl budget — as páginas de documento e
// credor são a cauda longa que interessa. Cap defensivo por seção.
const MAX_DOCUMENTOS = 1500;
const MAX_CREDORES = 500;
const MAX_DESCOBERTAS = 200;

const PAGINAS_ESTATICAS = [
  '',
  '/licitacoes',
  '/credores',
  '/transparencia',
  '/transparencia/empenhos',
  '/emendas',
  '/descobertas',
  '/acervo',
  '/finalidade',
  '/inteligencia',
  '/sobre',
];

export default async function sitemap() {
  const agora = new Date();

  const estaticas = PAGINAS_ESTATICAS.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: agora,
    changeFrequency: path === '' ? 'daily' : 'weekly',
    priority: path === '' ? 1 : 0.8,
  }));

  const [docs, credores, descobertas] = await Promise.all([
    fetchDocumentos({ limite: MAX_DOCUMENTOS }).catch(() => ({ dados: [] })),
    fetchCredores({ limite: MAX_CREDORES }).catch(() => ({ dados: [] })),
    fetchAlertas({ limite: MAX_DESCOBERTAS }).catch(() => ({ dados: [] })),
  ]);

  const urlsDocumentos = (docs?.dados || []).map((doc) => ({
    url: `${SITE_URL}/documento/${doc.id}`,
    lastModified: doc.data_publicacao ? new Date(doc.data_publicacao) : agora,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  const urlsCredores = (credores?.dados || [])
    .filter((c) => c.credor_chave || c.credor_cnpj)
    .map((c) => ({
      url: `${SITE_URL}/credores/${c.credor_chave || c.credor_cnpj}`,
      lastModified: agora,
      changeFrequency: 'weekly',
      priority: 0.5,
    }));

  const urlsDescobertas = (descobertas?.dados || descobertas?.itens || [])
    .filter((a) => a.id)
    .map((a) => ({
      url: `${SITE_URL}/descobertas/${a.id}`,
      lastModified: agora,
      changeFrequency: 'monthly',
      priority: 0.5,
    }));

  return [...estaticas, ...urlsDocumentos, ...urlsCredores, ...urlsDescobertas];
}
