import { NextResponse } from 'next/server';
import { buildCsp, originDe } from './lib/csp';

const SESSION_COOKIE =
  process.env.NODE_ENV === 'production'
    ? '__Host-monitor_admin_session'
    : 'monitor_admin_session';

export function proxy(request) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp({
    nonce,
    isDev: process.env.NODE_ENV === 'development',
    apiOrigin: originDe(process.env.NEXT_PUBLIC_API_URL),
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  let response;

  if (request.nextUrl.pathname.startsWith('/admin') && !session) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
    response = NextResponse.redirect(loginUrl);
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }

  response.headers.set('Content-Security-Policy', csp);
  return response;
}

// Rotas ISR (ROTAS_ISR em lib/csp.js) ficam fora: HTML em cache não tem nonce,
// então o CSP de nonce bloquearia os scripts. Elas recebem CSP estático via
// next.config.js. O matcher precisa ser literal (análise estática do Next).
export const config = {
  matcher: [
    {
      source:
        '/((?!api|_next/static|_next/image|icon.svg|apple-icon|opengraph-image|robots.txt|empenho/|transparencia/servidores/|legislacao/camara/projetos/|legislacao/camara/vereadores/).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
