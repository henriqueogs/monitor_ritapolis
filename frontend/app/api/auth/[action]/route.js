import { NextResponse } from 'next/server';

const backendApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const ALLOWED_ACTIONS = new Set(['session', 'login', 'logout', 'bootstrap', 'reset']);

function targetUrl(request, action) {
  const url = new URL(request.url);
  return `${backendApiUrl}/auth/${action}${url.search}`;
}

async function proxyAuth(request, { params }) {
  const { action } = await params;
  if (!ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ error: 'Rota de autenticacao invalida' }, { status: 404 });
  }

  const headers = {
    Accept: request.headers.get('accept') || 'application/json',
  };
  const contentType = request.headers.get('content-type');
  const cookie = request.headers.get('cookie');
  if (contentType) {
    headers['Content-Type'] = contentType;
  }
  if (cookie) {
    headers.Cookie = cookie;
  }

  const response = await fetch(targetUrl(request, action), {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text(),
    cache: 'no-store',
  });

  const body = await response.text();
  const out = new NextResponse(body, {
    status: response.status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': response.headers.get('content-type') || 'application/json',
    },
  });

  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    out.headers.set('Set-Cookie', setCookie);
  }

  return out;
}

export const dynamic = 'force-dynamic';

export async function GET(request, context) {
  return proxyAuth(request, context);
}

export async function POST(request, context) {
  return proxyAuth(request, context);
}
