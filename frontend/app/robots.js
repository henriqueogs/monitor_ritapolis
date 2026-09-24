import { SITE_URL } from './lib/brand';

// Crawlers de IA (treino/indexação de LLM) varriam a cauda longa
// (/empenho, /credores, /anexo) sem cache: cada página = invocação na Vercel +
// várias chamadas à API na VM, estourando o rate limit compartilhado. Os que
// respeitam robots.txt param aqui; os demais ficam pro firewall da Vercel.
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

export default function robots() {
  return {
    rules: [
      { userAgent: AI_CRAWLERS, disallow: '/' },
      { userAgent: '*', allow: '/', disallow: ['/admin', '/login', '/api'] },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
