'use strict';

// CommonJS de propósito (mesmo padrão de lib/fetch-retry.js): testável pelo Jest da raiz.
//
// Lógica pura da tela /perguntar: validação, chamada à rota /api/perguntar e tradução da
// resposta do backend em um "view model" que a página só precisa desenhar. Regras de produto:
// toda resposta mostra de onde veio (§11.3) e a origem genérica é rotulada com honestidade;
// mensagens de erro são nossas, nunca texto técnico do servidor.

const PERGUNTA_MIN = 3;
const PERGUNTA_MAX = 500;
const ROTA_PERGUNTAR = '/api/perguntar';

const MENSAGENS = Object.freeze({
  pergunta_invalida: `Escreva uma pergunta entre ${PERGUNTA_MIN} e ${PERGUNTA_MAX} caracteres.`,
  ia_indisponivel:
    'Esta função ainda não está disponível. Use a busca para encontrar os documentos.',
  limite_diario: 'O limite de perguntas de hoje foi atingido. Tente novamente amanhã.',
  ia_sobrecarregada: 'Há muitas solicitações no momento. Tente novamente em instantes.',
  ia_falhou: 'Não foi possível responder agora. Tente novamente em instantes.',
  rede: 'Sem conexão com o serviço. Verifique sua internet e tente novamente.',
});
const STATUS_MUITAS_REQUISICOES = 429;

const erro = codigo => ({ tipo: 'erro', codigo, mensagem: MENSAGENS[codigo] });

function validarPergunta(texto) {
  if (typeof texto !== 'string') {
    return { ok: false, erro: MENSAGENS.pergunta_invalida };
  }
  const pergunta = texto.replace(/\s+/g, ' ').trim();
  if (pergunta.length < PERGUNTA_MIN || pergunta.length > PERGUNTA_MAX) {
    return { ok: false, erro: MENSAGENS.pergunta_invalida };
  }
  return { ok: true, pergunta };
}

function urlSegura(valor) {
  const url = String(valor ?? '').trim();
  return /^https?:\/\//i.test(url) ? url : null;
}

function agruparFontes(citacoes) {
  const porUrl = new Map();
  for (const c of citacoes) {
    const url = urlSegura(c.url_origem);
    if (!url) {
      continue;
    }
    const fonte = porUrl.get(url) ?? { url, generica: Boolean(c.origemGenerica), trechos: [] };
    if (c.trecho && !fonte.trechos.includes(c.trecho)) {
      fonte.trechos.push(c.trecho);
    }
    porUrl.set(url, fonte);
  }
  return [...porUrl.values()].map(f => ({
    ...f,
    rotulo: f.generica ? 'Página de listagem oficial' : 'Documento oficial',
    nota: f.generica
      ? 'Publicado na listagem da Prefeitura, sem arquivo próprio para este item.'
      : null,
  }));
}

function interpretarSucesso(corpo) {
  const valido = corpo && typeof corpo.recusou === 'boolean' && typeof corpo.resposta === 'string';
  if (!valido) {
    return erro('ia_falhou');
  }
  if (corpo.recusou) {
    return { tipo: 'recusa', texto: corpo.resposta, fontes: [] };
  }
  return {
    tipo: 'resposta',
    texto: corpo.resposta,
    fontes: agruparFontes(Array.isArray(corpo.citacoes) ? corpo.citacoes : []),
  };
}

function interpretarResposta(status, corpo) {
  if (status === 200) {
    return interpretarSucesso(corpo);
  }
  const codigo = corpo?.error;
  if (MENSAGENS[codigo]) {
    return erro(codigo);
  }
  return status === STATUS_MUITAS_REQUISICOES ? erro('ia_sobrecarregada') : erro('ia_falhou');
}

async function enviarPergunta({ pergunta, fetchImpl = fetch }) {
  const validada = validarPergunta(pergunta);
  if (!validada.ok) {
    return erro('pergunta_invalida');
  }
  try {
    const resposta = await fetchImpl(ROTA_PERGUNTAR, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pergunta: validada.pergunta }),
    });
    const corpo = await resposta.json().catch(() => null);
    return interpretarResposta(resposta.status, corpo);
  } catch {
    return erro('rede');
  }
}

module.exports = {
  PERGUNTA_MIN,
  PERGUNTA_MAX,
  validarPergunta,
  urlSegura,
  interpretarResposta,
  enviarPergunta,
};
