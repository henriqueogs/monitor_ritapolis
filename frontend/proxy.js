import { NextResponse } from 'next/server';

const SESSION_COOKIE =
  process.env.NODE_ENV === 'production'
    ? '__Host-monitor_admin_session'
    : 'monitor_admin_session';

export function proxy(request) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV === 'development';
  const apiOrigin = (() => {
    try {
      return new URL(process.env.NEXT_PUBLIC_API_URL).origin;
    } catch {
      return '';
    }
  })();
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(!isDev ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
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

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|icon.svg|apple-icon|opengraph-image|robots.txt).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
