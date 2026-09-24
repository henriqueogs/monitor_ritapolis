const { PHASE_DEVELOPMENT_SERVER } = require('next/constants');
const path = require('path');
const { buildCsp, originDe, CSP_ISR_SOURCES } = require('./lib/csp');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

/** @type {(phase: string) => import('next').NextConfig} */
module.exports = (phase) => ({
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
      { source: '/:path*', headers: securityHeaders },
      ...CSP_ISR_SOURCES.map((source) => ({
        source,
        headers: [{ key: 'Content-Security-Policy', value: cspIsr }],
      })),
    ];
  },
  async redirects() {
    return [
      {
        source: '/finalidade',
        destination: '/transparencia/finalidades',
        permanent: true,
      },
    ];
  },
});
