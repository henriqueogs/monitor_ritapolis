import { NextResponse } from 'next/server';

const SESSION_COOKIE = 'monitor_admin_session';

export function middleware(request) {
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (session) {
    return NextResponse.next();
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/admin/:path*']
};
