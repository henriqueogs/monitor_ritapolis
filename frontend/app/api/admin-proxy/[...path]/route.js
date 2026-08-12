import { NextResponse } from 'next/server';

const backendApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const PREFIXOS_PROTEGIDOS = [
  '/admin',
  '/coletas',
  '/ia/',
  '/scheduler',
  '/cobertura/prefeitura',
  '/inteligencia/auditoria',
  '/alertas/config',
  '/alertas/gerar',
  '/anexos/resumos/jobs',
];

function isProtectedPath(path, method) {
  if (method !== 'GET' && method !== 'HEAD') {
    return true;
  }
  return PREFIXOS_PROTEGIDOS.some((prefixo) => path.startsWith(prefixo));
}

function proxyUrl(request, params) {
  const path = `/${(params.path || []).join('/')}`;
  const url = new URL(request.url);
  return {
    path,
    target: `${backendApiUrl}${path}${url.search}`,
  };
}

async function proxy(request, { params }) {
  const resolvedParams = await params;
  const { path, target } = proxyUrl(request, resolvedParams);
  if (!isProtectedPath(path, request.method)) {
    return NextResponse.json({ error: 'Rota nao permitida pelo proxy admin' }, { status: 404 });
  }

  const cookie = request.headers.get('cookie');
  if (!cookie) {
    return NextResponse.json({ error: 'Sessao administrativa obrigatoria' }, { status: 401 });
  }

  const headers = {
    Accept: request.headers.get('accept') || 'application/json',
  };
  if (cookie) {
    headers.Cookie = cookie;
  }

  const contentType = request.headers.get('content-type');
  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  const hasBody = !['GET', 'HEAD'].includes(request.method);
  const response = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? await request.text() : undefined,
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

  const authenticate = response.headers.get('www-authenticate');
  if (authenticate) {
    out.headers.set('WWW-Authenticate', authenticate);
  }

  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    out.headers.set('Set-Cookie', setCookie);
  }

  return out;
}

export const dynamic = 'force-dynamic';

export async function GET(request, context) {
  return proxy(request, context);
}

export async function POST(request, context) {
  return proxy(request, context);
}

export async function PATCH(request, context) {
  return proxy(request, context);
}

export async function PUT(request, context) {
  return proxy(request, context);
}

export async function DELETE(request, context) {
  return proxy(request, context);
}
