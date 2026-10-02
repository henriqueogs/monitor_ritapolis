import { SITE_URL } from './lib/brand';
import { fetchDocumentos, fetchCredores, fetchAlertas } from './lib/api';
import { fetchSitemapDocuments } from '../lib/sitemap-documents';
import { connection } from 'next/server';
import { unstable_cache } from 'next/cache';

// Rota de metadata (nao page.js) -- revalidate funciona direto aqui, sem
// precisar de generateStaticParams (essa exigencia so vale pra segmentos
// dinamicos de pagina, ver PR do cache de bots). Sem isso, cada crawl (Google
// incluido) reconstroi o sitemap do zero -- 3 fetches paginados (ate 1500+500+200
// itens) levavam >30s por request.
export const revalidate = 3600;

// Sitemap dinâmico: páginas estáticas + documentos + top credores + descobertas.
// Empenhos (30k+) ficam de fora por crawl budget — as páginas de documento e
// credor são a cauda longa que interessa. Cap defensivo por seção.
const MAX_DOCUMENTOS = 1500;
const MAX_CREDORES = 500;
const MAX_DESCOBERTAS = 200;

const PAGINAS_ESTATICAS = [
  '',
  '/licitacoes',
  '/legislacao',
  '/credores',
  '/transparencia',
  '/transparencia/empenhos',
  '/emendas',
  '/na-lupa',
  '/temas',
  '/analises',
  '/acervo',
  '/finalidade',
  '/inteligencia',
  '/sobre',
];

async function generateSitemap() {
  // A API não fornece a última alteração destas páginas. Data de publicação
  // do documento e hora de geração não representam atualização do conteúdo.
  // Omitimos lastModified até existir uma origem confiável para esse sinal.

  const estaticas = PAGINAS_ESTATICAS.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: path === '' ? 'daily' : 'weekly',
    priority: path === '' ? 1 : 0.8,
  }));

  const [docs, credores, descobertas] = await Promise.all([
    fetchSitemapDocuments(fetchDocumentos, MAX_DOCUMENTOS),
    fetchCredores({ limite: MAX_CREDORES }).catch(() => ({ dados: [] })),
    fetchAlertas({ limite: MAX_DESCOBERTAS }).catch(() => ({ dados: [] })),
  ]);

  const urlsDocumentos = (docs?.dados || []).map((doc) => ({
    url: `${SITE_URL}/documento/${doc.id}`,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  const urlsCredores = (credores?.dados || [])
    .filter((c) => c.credor_chave || c.credor_cnpj)
    .map((c) => ({
      url: `${SITE_URL}/credores/${c.credor_chave || c.credor_cnpj}`,
      changeFrequency: 'weekly',
      priority: 0.5,
    }));

  const urlsDescobertas = (descobertas?.dados || descobertas?.itens || [])
    .filter((a) => a.id)
    .map((a) => ({
      url: `${SITE_URL}/na-lupa/${a.id}`,
      changeFrequency: 'monthly',
      priority: 0.5,
    }));

  return [...estaticas, ...urlsDocumentos, ...urlsCredores, ...urlsDescobertas];
}

const cachedSitemap = unstable_cache(generateSitemap, ['public-sitemap-v3'], { revalidate: 3600 });

export default async function sitemap() {
  // A API não existe no build de CI; gere em runtime e cacheie a lista inteira.
  await connection();
  return cachedSitemap();
}
