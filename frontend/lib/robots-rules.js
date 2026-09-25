'use strict';

// Regras do robots.txt (CommonJS para ser testável pelo Jest da raiz).
// Contexto: robôs varrem a cauda longa (/empenho, /credores, /anexo) sem cache;
// cada página = invocação na Vercel + várias chamadas à API na VM. Os que
// respeitam robots.txt param aqui; o resto fica para o firewall da Vercel.

// Treino/indexação de LLM.
const AI_CRAWLERS = [
  'GPTBot',
  'ClaudeBot',
  'anthropic-ai',
  'CCBot',
  'PerplexityBot',
  'Google-Extended',
  'Applebot-Extended',
  'Bytespider',
  'Amazonbot',
  'meta-externalagent',
  'cohere-ai',
];

// Ferramentas de SEO: não trazem visitante, só custo (DotBot visto em
// 216.244.66.241 com ~700 req no painel da Vercel, 25/09/2026).
const SEO_CRAWLERS = ['DotBot', 'AhrefsBot', 'SemrushBot', 'MJ12bot', 'DataForSeoBot', 'BLEXBot'];

// Buscadores menores: mantêm as páginas principais, sem a cauda longa
// (PetalBot/Huawei, ~1k req de 114.119.x no mesmo painel).
const BUSCADORES_SEM_CAUDA_LONGA = ['PetalBot'];

const CAUDA_LONGA = [
  '/empenho/',
  '/credores/',
  '/anexo/',
  '/documento/',
  '/transparencia/servidores/',
];

const DISALLOW_PADRAO = ['/admin', '/login', '/api'];

function buildRobotsRules() {
  return [
    { userAgent: [...AI_CRAWLERS, ...SEO_CRAWLERS], disallow: '/' },
    { userAgent: BUSCADORES_SEM_CAUDA_LONGA, disallow: [...DISALLOW_PADRAO, ...CAUDA_LONGA] },
    { userAgent: '*', allow: '/', disallow: DISALLOW_PADRAO },
  ];
}

module.exports = { buildRobotsRules, AI_CRAWLERS, SEO_CRAWLERS, CAUDA_LONGA };
