'use strict';

// CommonJS de propósito (mesmo padrão de lib/fetch-retry.js): testável pelo Jest da raiz.
//
// Vercel BotID: desafio invisível no navegador + checkBotId() no servidor. Só serve para
// chamadas feitas pelo código da página (fetch/POST), não para carregamento de páginas;
// por isso protege apenas a pergunta à IA, que custa chamada de modelo. Varredura de
// páginas (/empenho, /credores) é com a regra Bot Protection do Firewall da Vercel.

// Prefixo fixo das rotas do BotID (rewrites do withBotId). Precisa ficar fora do
// X-Frame-Options: DENY e do CSP frame-ancestors 'none': o desafio usa iframe da própria origem.
const PREFIXO_BOTID = '/149e9513-01fa-4fb0-aad4-566afd725d1b';

const ROTAS_PROTEGIDAS = [{ path: '/api/perguntar', method: 'POST' }];

// Falha aberta: se o serviço do BotID cair, a pergunta segue (o backend ainda tem o limite
// publicAsk e a cota diária). Bloquear todo mundo por indisponibilidade de terceiro seria pior.
async function verificarHumano(checar) {
  try {
    const verificacao = await checar();
    return { bloquear: Boolean(verificacao?.isBot) };
  } catch {
    return { bloquear: false, falhou: true };
  }
}

module.exports = { PREFIXO_BOTID, ROTAS_PROTEGIDAS, verificarHumano };
