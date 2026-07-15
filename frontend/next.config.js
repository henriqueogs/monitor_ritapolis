const { PHASE_DEVELOPMENT_SERVER } = require('next/constants');

// connect-src precisa da origem da API quando o browser chama direto; chamadas
// admin passam pelo proxy same-origin, então 'self' cobre a maioria.
const apiOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL).origin;
  } catch {
    return '';
  }
})();

// ponytail: 'unsafe-inline' em style/script porque a UI é toda inline-style +
// Next hidrata inline. CSP estrita = refactor de frontend, não header. Sobe o
// framing/clickjacking + CSP básica agora; endurecer com nonce se virar meta.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ''}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityHeaders = [
  // CSP só em produção: next dev usa eval no HMR e a CSP sem 'unsafe-eval' o quebraria.
  ...(process.env.NODE_ENV === 'production' ? [{ key: 'Content-Security-Policy', value: csp }] : []),
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
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
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
