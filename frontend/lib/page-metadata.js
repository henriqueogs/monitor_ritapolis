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
  '/analises': {
    title: 'Análises e resumos da Prefeitura e Câmara de Ritápolis',
    description: 'Leia análises e resumos dos documentos da Prefeitura e Câmara Municipal de Ritápolis. Confira os dados, as fontes oficiais e os limites de cada leitura.',
  },
};

function plainText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function shorten(value, limit) {
  const text = plainText(value);
  if (text.length <= limit) return text;
  const prefix = text.slice(0, limit - 1);
  const space = prefix.lastIndexOf(' ');
  return `${prefix.slice(0, space > limit / 2 ? space : prefix.length).trim()}…`;
}

function buildContentMetadata({ path, title, description, number }, { siteUrl, brand }) {
  const identity = plainText(number);
  let heading = plainText(title) || 'Documento público';
  if (identity && !heading.includes(identity)) heading = `${identity}: ${heading}`;
  heading = shorten(heading, 120);
  if (!/rit[aá]polis/i.test(heading)) heading += ' — Ritápolis, MG';
  const fullTitle = `${heading} — ${brand}`;
  const summary = shorten(plainText(description) || plainText(title) || 'Documento público de Ritápolis, com acesso à fonte oficial.', 200);
  const url = `${siteUrl}${path}`;
  return {
    title: { absolute: fullTitle },
    description: summary,
    alternates: { canonical: url },
    openGraph: { type: 'website', locale: 'pt_BR', siteName: brand, title: fullTitle, description: summary, url },
    twitter: { card: 'summary_large_image', title: fullTitle, description: summary },
  };
}

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

module.exports = { buildPageMetadata, buildContentMetadata, PUBLIC_PAGES };
