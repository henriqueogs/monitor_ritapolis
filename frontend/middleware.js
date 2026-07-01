import { NextResponse } from 'next/server';
import auth from '../src/auth/admin-basic-auth';

export function middleware(request) {
  if (auth.isAuthorizedBasicAuth(request.headers.get('authorization'))) {
    return NextResponse.next();
  }

  return new NextResponse('Autenticacao administrativa obrigatoria.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Monitor Ritapolis Admin", charset="UTF-8"'
    }
  });
}

export const config = {
  matcher: ['/admin/:path*']
};
