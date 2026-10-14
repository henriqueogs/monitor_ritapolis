'use strict';

// CommonJS de propósito: mesmo padrão de lib/csp.js, testável pelo Jest da raiz.
//
// Achado 14/10/2026: ~65 "fetch failed" por dia nos logs da Vercel, todos em
// revalidação de cache em segundo plano (unstable_cache em app/lib/api.js).
// Falha de conexão (não resposta HTTP), em rajada, após períodos ociosos --
// padrão de socket keep-alive reaproveitado depois que o outro lado fechou.
// Uma nova tentativa abre conexão nova. O código da causa vai na mensagem
// para confirmar o diagnóstico (ECONNRESET, UND_ERR_SOCKET,
// UND_ERR_CONNECT_TIMEOUT...) nos próximos logs.

const TENTATIVAS_PADRAO = 2;
const ESPERA_PADRAO_MS = 300;

// O undici sinaliza falha de rede com TypeError('fetch failed'); abort e
// erros de parsing têm outros tipos e não devem ser repetidos.
function isErroDeRede(error) {
  return error?.name === 'TypeError' && error.message === 'fetch failed';
}

function descreverErroDeRede(error) {
  const causa = error?.cause;
  const detalhe = causa?.code || causa?.message;
  return detalhe ? `${error.message} (${detalhe})` : error.message;
}

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Só para leituras (GET): repetir POST/PATCH poderia duplicar efeitos.
async function fetchComRetry(
  url,
  init,
  { fetchImpl = fetch, tentativas = TENTATIVAS_PADRAO, esperaMs = ESPERA_PADRAO_MS } = {}
) {
  for (let tentativa = 1; ; tentativa += 1) {
    try {
      return await fetchImpl(url, init);
    } catch (error) {
      if (!isErroDeRede(error) || tentativa >= tentativas) throw error;
      await esperar(esperaMs);
    }
  }
}

module.exports = {
  fetchComRetry,
  descreverErroDeRede,
  isErroDeRede,
};
