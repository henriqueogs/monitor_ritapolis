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
    throw new Error(`API health respondeu conteudo inesperado: ${contentType || 'sem content-type'}`);
  }

  return response.json();
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(wakeApi(env));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.pathname !== '/health') {
      return new Response('Not found', { status: 404 });
    }

    try {
      const api = await wakeApi(env);
      return Response.json({ ok: true, api, checkedAt: new Date().toISOString() });
    } catch (error) {
      return Response.json(
        { ok: false, error: error.message, checkedAt: new Date().toISOString() },
        { status: 503 },
      );
    }
  },
};
