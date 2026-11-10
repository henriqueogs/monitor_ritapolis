'use strict';

// CommonJS de propósito (mesmo padrão de lib/fetch-retry.js): testável pelo Jest da raiz.
//
// Segredo compartilhado com a API (FRONTEND_SSR_TOKEN, sem NEXT_PUBLIC_: nunca vai para o
// navegador). Com ele, as leituras públicas feitas no servidor da Vercel usam a cota própria
// do frontend na API em vez da cota por IP, que todas as funções da Vercel dividem
// (src/api/security.js).

const CABECALHO_FRONTEND = 'X-Frontend-Token';

function cabecalhoFrontendSsr({ env = process.env, isServidor = typeof window === 'undefined' } = {}) {
  if (!isServidor) {return {};}
  const token = env.FRONTEND_SSR_TOKEN;
  if (!token) {return {};}
  return { [CABECALHO_FRONTEND]: token };
}

module.exports = { cabecalhoFrontendSsr, CABECALHO_FRONTEND };
