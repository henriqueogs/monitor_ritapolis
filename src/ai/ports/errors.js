'use strict';

/**
 * Erros tipados das portas de IA. O chamador decide a ação pelo TIPO, não pelo texto:
 *  - ModeloIndisponivelError: modelo aposentado (410) ou sem acesso (404) — não adianta tentar de novo;
 *  - ProviderLimiteError: 429 — recuar (retryAfterMs) e tentar de novo;
 *  - DimensaoInesperadaError: o modelo devolveu outra dimensão — o índice ficaria inconsistente.
 */

const STATUS_MODELO_INDISPONIVEL = [404, 410];
const STATUS_LIMITE_DE_TAXA = 429;
const MS_POR_SEGUNDO = 1000;

class ModeloIndisponivelError extends Error {
  constructor({ modelo, status, cause } = {}) {
    const http = status ? ` (HTTP ${status})` : '';
    super(`Modelo de IA indisponível [${modelo}]${http}: aposentado ou sem acesso`, { cause });
    this.name = 'ModeloIndisponivelError';
    this.modelo = modelo;
    this.status = status;
  }
}

class ProviderLimiteError extends Error {
  constructor({ modelo, retryAfterMs = null, cause } = {}) {
    super(`Limite de taxa do provedor de IA [${modelo}]`, { cause });
    this.name = 'ProviderLimiteError';
    this.modelo = modelo;
    this.retryAfterMs = retryAfterMs;
  }
}

class DimensaoInesperadaError extends Error {
  constructor({ modelo, esperada, recebida } = {}) {
    super(`Dimensão inesperada [${modelo}]: esperada ${esperada}, recebida ${recebida}`);
    this.name = 'DimensaoInesperadaError';
    this.modelo = modelo;
    this.esperada = esperada;
    this.recebida = recebida;
  }
}

function lerRetryAfterMs(err) {
  const headers = err?.headers;
  if (!headers) {return null;}
  const bruto = typeof headers.get === 'function' ? headers.get('retry-after') : headers['retry-after'];
  const segundos = Number(bruto);
  return Number.isFinite(segundos) && bruto !== undefined && bruto !== null ? segundos * MS_POR_SEGUNDO : null;
}

const JA_CLASSIFICADO = [ModeloIndisponivelError, ProviderLimiteError, DimensaoInesperadaError];

/** Converte o erro cru do SDK/HTTP no erro tipado da porta (com a causa preservada). */
function classificarErroProvider(err, { modelo }) {
  if (JA_CLASSIFICADO.some((Tipo) => err instanceof Tipo)) {return err;}
  if (STATUS_MODELO_INDISPONIVEL.includes(err?.status)) {
    return new ModeloIndisponivelError({ modelo, status: err.status, cause: err });
  }
  if (err?.status === STATUS_LIMITE_DE_TAXA) {
    return new ProviderLimiteError({ modelo, retryAfterMs: lerRetryAfterMs(err), cause: err });
  }
  return new Error(`IA provider falhou [${modelo}]: ${err?.message}`, { cause: err });
}

module.exports = {
  ModeloIndisponivelError,
  ProviderLimiteError,
  DimensaoInesperadaError,
  classificarErroProvider,
};
