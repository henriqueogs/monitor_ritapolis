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

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/proxy') {
      return proxyCollectorRequest(request, env);
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
