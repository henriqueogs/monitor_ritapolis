'use strict';

// CommonJS de propósito: usado pelo proxy.js (middleware) e pelo next.config.js,
// que o Node carrega sem bundler.

// O portal oficial pode responder pelo domínio canônico ou pelo alias www.
// Mantemos a lista explícita para que a política de frames não vire um proxy
// aberto para origens arbitrárias.
const OFFICIAL_SOURCE_FRAME_ORIGINS = [
  'https://ritapolis.mg.gov.br',
  'https://www.ritapolis.mg.gov.br',
  // Worker Cloudflare que serve o preview do PDF oficial (substitui o antigo
  // /api/source-preview do Render, que consumia banda gratuita do plano).
  'https://monitor-ritapolis-heartbeat.henriqueguimaraes.workers.dev',
];

// Rotas ISR (export const revalidate): o HTML sai do cache da Vercel, montado
// sem nonce. Com o CSP de nonce + 'strict-dynamic' do middleware, o navegador
// recusava todos os scripts dessas páginas (sem hidratação: menus, login,
// navegação client-side). Elas ficam fora do proxy.js e recebem o CSP estático
// abaixo via next.config.js. Manter em sincronia com o matcher do proxy.js
// (tests/frontend-csp.test.js verifica).
const ROTAS_ISR = [
  '/empenho/',
  '/transparencia/servidores/',
  '/legislacao/camara/projetos/',
  '/legislacao/camara/vereadores/',
];

const CSP_ISR_SOURCES = [
  '/empenho/:id',
  '/transparencia/servidores/:vinculo/:matricula',
  '/legislacao/camara/projetos/:id',
  '/legislacao/camara/vereadores/:id',
];

function originDe(url) {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

/**
 * Monta o Content-Security-Policy. Com `nonce`, scripts e estilos exigem o
 * nonce da requisição (páginas renderizadas por requisição). Sem nonce (HTML
 * em cache), scripts inline do Next precisam de 'unsafe-inline'; origens
 * externas continuam bloqueadas.
 */
function buildCsp({ nonce = null, isDev = false, apiOrigin = '' } = {}) {
  const evalDev = isDev ? " 'unsafe-eval'" : '';
  const scriptSrc = nonce
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${evalDev}`
    : `script-src 'self' 'unsafe-inline'${evalDev}`;
  const styleSrc = nonce
    ? `style-src 'self' 'nonce-${nonce}' https://fonts.googleapis.com`
    : "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com";
  const frames = OFFICIAL_SOURCE_FRAME_ORIGINS.join(' ');

  return [
    "default-src 'self'",
    scriptSrc,
    styleSrc,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' https://fonts.gstatic.com",
    `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ''}`,
    `frame-src 'self' ${frames}`,
    // Compatibilidade com navegadores que ainda consultam child-src para
    // navegações incorporadas, sem ampliar a lista de origens permitidas.
    `child-src 'self' ${frames}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(!isDev ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

module.exports = {
  buildCsp,
  originDe,
  CSP_ISR_SOURCES,
  OFFICIAL_SOURCE_FRAME_ORIGINS,
  ROTAS_ISR,
};
