'use strict';

// CommonJS de propósito: mesmo padrão de lib/fetch-retry.js, testável pelo Jest da raiz.
//
// Achado 29/10-03/11/2026: as revalidações de cache em segundo plano (unstable_cache em
// app/lib/api.js) falham por conexão com a VM ("other side closed", ETIMEDOUT) e cada falha
// vira erro nos logs, mesmo com o visitante recebendo o cache antigo. Aqui o último dado bom
// de cada rota fica na memória da função; se a leitura nova falhar por REDE, devolve-se esse
// dado por até 30 minutos desde a última leitura bem-sucedida. Um evento marca a entrada
// no fallback e outro a recuperação; falhas repetidas não renovam a idade do dado.
// Depois do limite o erro volta a subir, inclusive para a revalidação do Next.
// Falha de HTTP (4xx/5xx) ou parsing nunca é mascarada, nem a primeira carga.
// Limite: a memória some quando a função esfria; nesse caso o erro sobe como hoje.

const { isErroDeRede } = require('./fetch-retry');

const MAXIMO_PADRAO = 60;
const IDADE_MAXIMA_PADRAO_MS = 30 * 60 * 1000;

function registrarEvento(evento) {
  const mensagem = JSON.stringify(evento);
  if (evento.evento === 'api_cache_recuperado') console.info(mensagem);
  else console.warn(mensagem);
}

function criarUltimoBom({
  maximo = MAXIMO_PADRAO,
  idadeMaximaMs = IDADE_MAXIMA_PADRAO_MS,
  agora = Date.now,
  aoEvento = registrarEvento,
} = {}) {
  if (!Number.isInteger(maximo) || maximo < 1 || !Number.isFinite(idadeMaximaMs) || idadeMaximaMs < 0) {
    throw new RangeError('Limites de cache inválidos');
  }
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
      if (guardados.get(chave)?.emFallback) {
        aoEvento({ evento: 'api_cache_recuperado', rota: chave.split('?')[0] });
      }
      guardar(chave, { dado, sucessoEm: agora(), emFallback: false });
      return dado;
    } catch (error) {
      const anterior = guardados.get(chave);
      const idadeMs = anterior ? Math.max(0, agora() - anterior.sucessoEm) : Infinity;
      if (isErroDeRede(error?.cause) && anterior && idadeMs < idadeMaximaMs) {
        if (!anterior.emFallback) {
          anterior.emFallback = true;
          aoEvento({ evento: 'api_cache_fallback', rota: chave.split('?')[0], idadeMs });
        }
        return anterior.dado;
      }
      throw error;
    }
  };
}

module.exports = { criarUltimoBom, IDADE_MAXIMA_PADRAO_MS };
