import { NextResponse } from 'next/server';

// Proxy público e mínimo para POST /api/ia/perguntar do backend. Existe para o navegador não
// falar direto com a API e para repassar SÓ { pergunta } (o backend valida o resto).
// Sem cookies, sem sessão admin: a rota do backend é pública, com limite próprio (publicAsk).

const backendApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const LIMITE_CORPO_BYTES = 2048;
const TIMEOUT_MS = 60_000;
const STATUS = { BAD_REQUEST: 400, TOO_LARGE: 413, BAD_GATEWAY: 502 };

function resposta(corpo, status, extras = {}) {
  return NextResponse.json(corpo, { status, headers: { 'Cache-Control': 'no-store', ...extras } });
}

async function lerPergunta(request) {
  const texto = await request.text();
  if (Buffer.byteLength(texto, 'utf8') > LIMITE_CORPO_BYTES) {
    return { erro: resposta({ error: 'pergunta_invalida' }, STATUS.TOO_LARGE) };
  }
  try {
    const corpo = JSON.parse(texto);
    if (typeof corpo?.pergunta !== 'string') {
      throw new TypeError('pergunta ausente');
    }
    return { pergunta: corpo.pergunta };
  } catch {
    return { erro: resposta({ error: 'pergunta_invalida' }, STATUS.BAD_REQUEST) };
  }
}

export async function POST(request) {
  const { pergunta, erro } = await lerPergunta(request);
  if (erro) {
    return erro;
  }
  try {
    const upstream = await fetch(`${backendApiUrl}/ia/perguntar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ pergunta }),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const corpo = await upstream.json().catch(() => ({ error: 'ia_falhou' }));
    const retryAfter = upstream.headers.get('retry-after');
    return resposta(corpo, upstream.status, retryAfter ? { 'Retry-After': retryAfter } : {});
  } catch {
    return resposta({ error: 'ia_falhou' }, STATUS.BAD_GATEWAY);
  }
}
