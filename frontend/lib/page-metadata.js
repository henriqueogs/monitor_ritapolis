'use strict';

const PUBLIC_PAGES = {
  '/': {
    title: 'Ritápolis, MG: gastos públicos, licitações e leis',
    description: 'Consulte gastos públicos, licitações, leis e documentos de Ritápolis, Minas Gerais. Projeto independente, com links para as fontes oficiais.',
  },
  '/licitacoes': {
    title: 'Licitações de Ritápolis, MG: editais e contratos',
    description: 'Pesquise licitações de Ritápolis, consulte editais e contratos e acompanhe documentos dos processos com acesso à fonte oficial.',
  },
  '/transparencia': {
    title: 'Gastos públicos de Ritápolis, MG',
    description: 'Acompanhe despesas, empenhos e pagamentos de Ritápolis por período. Consulte fornecedores e confira os dados nas fontes oficiais.',
  },
  '/legislacao': {
    title: 'Legislação de Ritápolis, MG: leis e decretos',
    description: 'Pesquise leis, decretos, portarias e documentos da legislação municipal de Ritápolis, com links para as publicações oficiais.',
  },
  '/sobre': {
    title: 'Sobre o Ritápolis.com: transparência municipal',
    description: 'Conheça o projeto independente Ritápolis.com, suas fontes de dados públicos, metodologia e limites da organização de documentos com IA.',
  },
};

function buildPageMetadata(path, { siteUrl, brand }) {
  const page = PUBLIC_PAGES[path];
  if (!page) throw new Error(`Unknown public page: ${path}`);
  const base = siteUrl;
  const siteName = brand;
  const title = `${page.title} — ${siteName}`;
  const url = `${base}${path === '/' ? '' : path}`;
  return {
    title: { absolute: title },
    description: page.description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website', locale: 'pt_BR', siteName,
      title, description: page.description, url,
    },
    twitter: { card: 'summary_large_image', title, description: page.description },
  };
}

module.exports = { buildPageMetadata, PUBLIC_PAGES };
