'use strict';

// CommonJS de propósito: mesmo padrão de lib/fetch-retry.js, testável pelo Jest da raiz.
//
// Achado 29/10-03/11/2026: as revalidações de cache em segundo plano (unstable_cache em
// app/lib/api.js) falham por conexão com a VM ("other side closed", ETIMEDOUT) e cada falha
// vira erro nos logs, mesmo com o visitante recebendo o cache antigo. Aqui o último dado bom
// de cada rota fica na memória da função; se a leitura nova falhar por REDE, devolve-se esse
// dado (o cache segue válido por mais um ciclo, sem ruído). Falha de HTTP (4xx/5xx) ou de
// parsing nunca é mascarada, e sem dado anterior (primeira carga) o erro sobe como antes.
// Limite: a memória some quando a função esfria; nesse caso o erro sobe como hoje.

const { isErroDeRede } = require('./fetch-retry');

const MAXIMO_PADRAO = 60;

function criarUltimoBom({ maximo = MAXIMO_PADRAO } = {}) {
  const guardados = new Map();

  function guardar(chave, dado) {
    guardados.delete(chave);
    guardados.set(chave, dado);
    if (guardados.size > maximo) {
      guardados.delete(guardados.keys().next().value);
    }
  }

  return async function lerComFallback(chave, leitura) {
    try {
      const dado = await leitura();
      guardar(chave, dado);
      return dado;
    } catch (error) {
      if (isErroDeRede(error?.cause) && guardados.has(chave)) {
        return guardados.get(chave);
      }
      throw error;
    }
  };
}

module.exports = { criarUltimoBom };
