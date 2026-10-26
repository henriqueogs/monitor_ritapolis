const { PHASE_DEVELOPMENT_SERVER } = require('next/constants');
const path = require('path');
const { withBotId } = require('botid/next/config');
const { buildCsp, originDe, CSP_ISR_SOURCES } = require('./lib/csp');
const { DOMINIO_SITE, SITE_URL } = require('./lib/ente');
const { SOURCE_SEM_BOTID } = require('./lib/botid');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

/** @type {(phase: string) => import('next').NextConfig} */
const nextConfig = (phase) => ({
  reactStrictMode: true,
  // Evita que `next build` sobrescreva assets CSS/chunks usados por `next dev`.
  // Esse conflito deixava o navegador com links para CSS inexistente ou antigo.
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
  turbopack: {
    root: path.resolve(__dirname),
  },
  async headers() {
    // Rotas ISR não passam pelo proxy.js (nonce); CSP estático sem nonce aqui.
    const cspIsr = buildCsp({
      nonce: null,
      isDev: phase === PHASE_DEVELOPMENT_SERVER,
      apiOrigin: originDe(process.env.NEXT_PUBLIC_API_URL),
    });
    return [
      // Fora do caminho do BotID: o desafio usa iframe da própria origem e o withBotId
      // define X-Frame-Options: SAMEORIGIN ali (DENY quebraria a verificação).
      { source: SOURCE_SEM_BOTID, headers: securityHeaders },
      ...CSP_ISR_SOURCES.map((source) => ({
        source,
        headers: [{ key: 'Content-Security-Policy', value: cspIsr }],
      })),
    ];
  },
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: `www.${DOMINIO_SITE}` }],
        destination: `${SITE_URL}/:path*`,
        permanent: true,
      },
      {
        source: '/finalidade',
        destination: '/transparencia/finalidades',
        permanent: true,
      },
      // Aliases legados. Aqui (e não em page.js com redirect()) a query string
      // é preservada pelo próprio Next, a resposta é um 307 de verdade (não
      // meta refresh após streaming) e nenhuma função roda na Vercel.
      { source: '/documentos', destination: '/acervo', permanent: false },
      { source: '/cobertura', destination: '/admin/cobertura', permanent: false },
      { source: '/ia', destination: '/admin/ia', permanent: false },
    ];
  },
});

module.exports = withBotId(nextConfig);
