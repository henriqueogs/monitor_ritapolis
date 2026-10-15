'use strict';

/**
 * Extrai o objeto JSON de uma resposta de LLM (com cerca markdown ou texto em volta).
 * Centraliza uma lógica que hoje está copiada em vários módulos de src/ai.
 */

const TAMANHO_TRECHO = 200;
const CERCA_MARKDOWN = /```(?:json)?\s*([\s\S]*?)```/i;

class RespostaNaoJsonError extends Error {
  constructor(bruto) {
    super('Resposta do modelo não contém um objeto JSON válido');
    this.name = 'RespostaNaoJsonError';
    this.trecho = String(bruto ?? '').slice(0, TAMANHO_TRECHO);
  }
}

const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function tentarParse(texto) {
  try {
    const valor = JSON.parse(texto);
    return ehObjeto(valor) ? valor : null;
  } catch {
    return null;
  }
}

/** Fim do objeto balanceado que começa em `inicio` (respeita strings e escapes), ou -1. */
function fimDoObjeto(texto, inicio) {
  let profundidade = 0;
  let emString = false;
  for (let i = inicio; i < texto.length; i += 1) {
    const c = texto[i];
    if (emString) {
      if (c === '\\') {i += 1;} else if (c === '"') {emString = false;}
    } else if (c === '"') {
      emString = true;
    } else if (c === '{') {
      profundidade += 1;
    } else if (c === '}') {
      profundidade -= 1;
      if (profundidade === 0) {return i;}
    }
  }
  return -1;
}

function buscarObjetoEmbutido(texto) {
  for (let inicio = texto.indexOf('{'); inicio !== -1; inicio = texto.indexOf('{', inicio + 1)) {
    const fim = fimDoObjeto(texto, inicio);
    const objeto = fim === -1 ? null : tentarParse(texto.slice(inicio, fim + 1));
    if (objeto) {return objeto;}
  }
  return null;
}

function extrairObjetoJson(bruto) {
  if (typeof bruto !== 'string' || !bruto.trim()) {throw new RespostaNaoJsonError(bruto);}
  const cerca = bruto.match(CERCA_MARKDOWN);
  const texto = (cerca ? cerca[1] : bruto).trim();
  const objeto = tentarParse(texto) || buscarObjetoEmbutido(texto);
  if (!objeto) {throw new RespostaNaoJsonError(bruto);}
  return objeto;
}

module.exports = { extrairObjetoJson, RespostaNaoJsonError };
