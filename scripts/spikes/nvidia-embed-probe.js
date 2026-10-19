'use strict';

/**
 * Spike S2 (plano de IA): modelo, latência e limite de taxa do endpoint de embedding da NVIDIA.
 * Envia TEXTO SINTÉTICO (nada do acervo). Sem retry, para enxergar 429 cru; para no primeiro 429.
 * A chave nunca é impressa. A chave é compartilhada com a campanha de resumos: rode fora de
 * horário de pico e mantenha a concorrência baixa.
 *
 * Uso:
 *   node --env-file=.env scripts/spikes/nvidia-embed-probe.js
 *   EMBED_MODEL=nvidia/nemotron-3-embed-1b node --env-file=.env scripts/spikes/nvidia-embed-probe.js
 */

const OpenAI = require('openai');
const config = require('../../src/config');

const MODELO = process.env.EMBED_MODEL || config.nvidiaEmbedModel;
const CHUNK_CHARS = 1500;
const TAMANHOS_LOTE = [1, 8, 32, 64, 128];
const LOTE_PADRAO = 32;
const CHAMADAS_SEQUENCIAIS = 8;
const ONDAS = 3;
const CONCORRENCIAS = [2, 3];
const PAUSA_MS = 1500;
const TIMEOUT_MS = 60000;

const TEXTO_BASE =
  'A Prefeitura Municipal torna publico o edital do pregao eletronico para registro de precos ' +
  'destinado a aquisicao de materiais de consumo, conforme termo de referencia, com sessao publica ' +
  'na data indicada e criterio de julgamento menor preco por item. ';

let contador = 0;
let parouPor429 = false;

function chunk() {
  contador += 1;
  return `${TEXTO_BASE.repeat(6)} Processo ${contador}/2026.`.slice(0, CHUNK_CHARS);
}

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function criarCliente() {
  if (!config.nvidiaApiKey) {throw new Error('NVIDIA_API_KEY não configurada (use --env-file=.env)');}
  return new OpenAI({ apiKey: config.nvidiaApiKey, baseURL: config.nvidiaBaseUrl, timeout: TIMEOUT_MS, maxRetries: 0 });
}

async function chamar(client, n) {
  const t0 = Date.now();
  try {
    const input = Array.from({ length: n }, chunk);
    const r = await client.embeddings.create({ model: MODELO, input, encoding_format: 'float' });
    return { ok: true, ms: Date.now() - t0, dims: r.data[0]?.embedding?.length, tokens: r.usage?.total_tokens };
  } catch (err) {
    if (err.status === 429) {parouPor429 = true;}
    return { ok: false, ms: Date.now() - t0, status: err.status, msg: String(err.message).slice(0, 120) };
  }
}

function resumir(rs, total) {
  const ok = rs.filter((r) => r.ok).length;
  const ms = rs.reduce((a, r) => a + r.ms, 0);
  return {
    chamadas: rs.length,
    ok,
    erros: rs.filter((r) => !r.ok).map((r) => ({ status: r.status, msg: r.msg })),
    ms_medio: Math.round(ms / rs.length),
    chunks_por_min: total ? Math.round((ok * LOTE_PADRAO * 60000) / total) : null,
  };
}

async function fasePorLote(client, saida) {
  saida.por_lote = {};
  for (const n of TAMANHOS_LOTE) {
    if (parouPor429) {break;}
    const r = await chamar(client, n);
    saida.por_lote[n] = r.ok ? { ms: r.ms, dims: r.dims, tokens: r.tokens } : { status: r.status, msg: r.msg };
    await dormir(PAUSA_MS);
  }
}

async function faseSequencial(client, saida) {
  const t0 = Date.now();
  const rs = [];
  for (let i = 0; i < CHAMADAS_SEQUENCIAIS && !parouPor429; i += 1) {rs.push(await chamar(client, LOTE_PADRAO));}
  saida.sequencial = resumir(rs, Date.now() - t0);
}

async function faseConcorrente(client, saida, concorrencia) {
  const t0 = Date.now();
  const rs = [];
  for (let onda = 0; onda < ONDAS && !parouPor429; onda += 1) {
    rs.push(...(await Promise.all(Array.from({ length: concorrencia }, () => chamar(client, LOTE_PADRAO)))));
  }
  saida[`concorrencia_${concorrencia}`] = resumir(rs, Date.now() - t0);
}

async function main() {
  const saida = { modelo: MODELO, chunk_chars: CHUNK_CHARS };
  const client = criarCliente();

  await fasePorLote(client, saida);
  if (!parouPor429) {await faseSequencial(client, saida);}
  for (const c of CONCORRENCIAS) {
    if (parouPor429) {break;}
    await dormir(PAUSA_MS * 2);
    await faseConcorrente(client, saida, c);
  }

  saida.parou_por_429 = parouPor429;
  saida.chunks_enviados = contador;
  process.stdout.write(`${JSON.stringify(saida, null, 2)}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exitCode = 1;
});
