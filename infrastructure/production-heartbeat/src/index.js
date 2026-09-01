async function wakeApi(env) {
  const response = await fetch(env.API_HEALTH_URL, {
    headers: {
      accept: 'application/json',
      'user-agent': 'monitor-ritapolis-heartbeat/1.0',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`API health respondeu HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      `API health respondeu conteudo inesperado: ${contentType || 'sem content-type'}`
    );
  }

  return response.json();
}

const ALLOWED_PROXY_HOSTS = new Set([
  'ritapolis.mg.gov.br',
  'pt.ritapolis.mg.gov.br',
  'pt.ritapolis.mg.leg.br',
  'pncp.gov.br',
  'api.pncp.gov.br',
]);
const MAX_REDIRECTS = 5;

// Mesmo allowlist do endpoint /api/source-preview do Render (src/api/server.js):
// só arquivos oficiais da prefeitura, servidos direto do Worker pro navegador
// do cidadao. Antes o Render reencaminhava esses PDFs, consumindo a banda
// gratuita do plano; aqui o byte nunca passa pelo Render.
const ALLOWED_PREVIEW_HOSTS = new Set(['ritapolis.mg.gov.br', 'www.ritapolis.mg.gov.br']);
const PREVIEW_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function parsePreviewTarget(rawTarget) {
  let target;
  try {
    target = new URL(rawTarget);
  } catch {
    return null;
  }
  const path = target.pathname.toLowerCase();
  const allowedPath = path === '/obter_arquivo_cadastro_generico.php' || path.endsWith('.pdf');
  if (target.protocol !== 'https:' || !ALLOWED_PREVIEW_HOSTS.has(target.hostname) || !allowedPath) {
    return null;
  }
  return target;
}

function previewHeaders(upstream) {
  const headers = new Headers({
    'cache-control': 'public, max-age=300, s-maxage=86400, stale-while-revalidate=3600',
    'content-disposition': 'inline; filename="fonte-oficial.pdf"',
    'content-type': 'application/pdf',
    'x-content-type-options': 'nosniff',
    'x-robots-tag': 'noindex',
    'content-security-policy': "frame-ancestors https://ritapolis.com https://www.ritapolis.com",
    'cross-origin-resource-policy': 'cross-origin',
  });
  const contentLength = upstream.headers.get('content-length');
  if (contentLength) {
    headers.set('content-length', contentLength);
  }
  return headers;
}

async function fetchPreviewUpstream(startUrl) {
  let current = startUrl;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await fetch(current, {
      headers: {
        accept: 'application/pdf',
        'user-agent': 'Ritapolis-com/1.0 (+https://ritapolis.com)',
      },
      redirect: 'manual',
    });
    if (!PREVIEW_REDIRECT_STATUSES.has(response.status)) {
      return response;
    }
    const location = response.headers.get('location');
    const nextUrl = location ? parsePreviewTarget(new URL(location, current).toString()) : null;
    if (!nextUrl) {
      return null;
    }
    current = nextUrl;
  }
  return null;
}

async function servePreview(request, ctx) {
  const requestUrl = new URL(request.url);
  const target = parsePreviewTarget(requestUrl.searchParams.get('url'));
  if (!target) {
    return new Response('Fonte oficial invalida.', { status: 400 });
  }
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: { allow: 'GET' } });
  }

  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  let upstream;
  try {
    upstream = await fetchPreviewUpstream(target);
  } catch {
    upstream = null;
  }
  if (!upstream || !upstream.ok || !upstream.body) {
    return new Response('Nao foi possivel carregar a fonte oficial.', { status: 502 });
  }
  const contentType = upstream.headers.get('content-type') || 'application/pdf';
  if (!/^application\/(pdf|octet-stream)(?:\s*;|$)/i.test(contentType)) {
    return new Response('A fonte oficial nao retornou um arquivo PDF.', { status: 502 });
  }

  const response = new Response(upstream.body, { status: 200, headers: previewHeaders(upstream) });
  ctx.waitUntil(cache.put(request, response.clone()));
  return response;
}

function isAuthorized(request, env) {
  const expected = String(env.COLLECTOR_PROXY_TOKEN || '');
  const provided = request.headers.get('authorization') || '';
  return expected.length >= 32 && provided === `Bearer ${expected}`;
}

function parseAllowedTarget(rawTarget) {
  let target;
  try {
    target = new URL(rawTarget);
  } catch {
    throw new Error('Destino invalido');
  }

  if (target.protocol !== 'https:' || target.username || target.password) {
    throw new Error('Destino deve usar HTTPS sem credenciais');
  }
  if (!ALLOWED_PROXY_HOSTS.has(target.hostname.toLowerCase())) {
    throw new Error('Host de destino nao permitido');
  }
  return target;
}

function upstreamHeaders(request, target) {
  const headers = new Headers({
    accept: request.headers.get('accept') || '*/*',
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/127.0 Safari/537.36',
    referer: `${target.origin}/`,
  });
  const contentType = request.headers.get('content-type');
  if (contentType) {
    headers.set('content-type', contentType);
  }
  // Fluxos com sessão (ex.: portal-transparencia-thread-http.js) mandam o
  // Cookie explicitamente por chamada — sem isso, cada request proxiado
  // vira uma sessão nova no portal.
  const cookie = request.headers.get('cookie');
  if (cookie) {
    headers.set('cookie', cookie);
  }
  return headers;
}

async function proxyCollectorRequest(request, env) {
  if (!isAuthorized(request, env)) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (!['GET', 'POST'].includes(request.method)) {
    return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, POST' } });
  }

  let target;
  try {
    target = parseAllowedTarget(request.headers.get('x-target-url') || '');
  } catch (error) {
    return new Response(error.message, { status: 400 });
  }

  const body = request.method === 'POST' ? await request.arrayBuffer() : undefined;
  let current = target;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await fetch(current, {
      method: request.method,
      headers: upstreamHeaders(request, current),
      body,
      redirect: 'manual',
    });

    if (response.status < 300 || response.status >= 400) {
      const headers = new Headers({
        'cache-control': 'private, no-store',
        'content-type': response.headers.get('content-type') || 'application/octet-stream',
        'x-content-type-options': 'nosniff',
      });
      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        headers.set('content-length', contentLength);
      }
      // getSetCookie() devolve cada Set-Cookie separado — response.headers.get()
      // junta tudo numa string só com vírgula, o que quebra o parsing no
      // coletor (extrairCookie espera um array).
      for (const setCookie of response.headers.getSetCookie?.() || []) {
        headers.append('set-cookie', setCookie);
      }
      return new Response(response.body, { status: response.status, headers });
    }

    const location = response.headers.get('location');
    if (!location || redirects === MAX_REDIRECTS) {
      return new Response('Redirect upstream invalido', { status: 502 });
    }
    try {
      current = parseAllowedTarget(new URL(location, current).toString());
    } catch (error) {
      return new Response(error.message, { status: 502 });
    }
  }
  return new Response('Redirect limit exceeded', { status: 502 });
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(wakeApi(env));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/proxy') {
      return proxyCollectorRequest(request, env);
    }
    if (url.pathname === '/preview') {
      return servePreview(request, ctx);
    }
    if (request.method !== 'GET' || url.pathname !== '/health') {
      return new Response('Not found', { status: 404 });
    }

    try {
      const api = await wakeApi(env);
      return Response.json({ ok: true, api, checkedAt: new Date().toISOString() });
    } catch (error) {
      return Response.json(
        { ok: false, error: error.message, checkedAt: new Date().toISOString() },
        { status: 503 }
      );
    }
  },
};
