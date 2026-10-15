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

const ehObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);

const ESCAPES_VALIDOS = '"\\/bfnrtu';

// O modelo às vezes escapa o que o JSON não permite ("R\$", "50\%"): remove só a barra dos
// escapes inválidos (fix de produção, jobs 4361/4365 de 07/10/2026, hoje em validate-summary.js).
const repararEscapes = texto =>
  texto.replace(/\\([\s\S])/g, (par, caractere) =>
    ESCAPES_VALIDOS.includes(caractere) ? par : caractere
  );

function interpretar(texto) {
  try {
    const valor = JSON.parse(texto);
    return ehObjeto(valor) ? valor : null;
  } catch {
    return null;
  }
}

const tentarParse = texto => interpretar(texto) || interpretar(repararEscapes(texto));

/** Fim do objeto balanceado que começa em `inicio` (respeita strings e escapes), ou -1. */
function fimDoObjeto(texto, inicio) {
  let profundidade = 0;
  let emString = false;
  for (let i = inicio; i < texto.length; i += 1) {
    const c = texto[i];
    if (emString) {
      if (c === '\\') {
        i += 1;
      } else if (c === '"') {
        emString = false;
      }
    } else if (c === '"') {
      emString = true;
    } else if (c === '{') {
      profundidade += 1;
    } else if (c === '}') {
      profundidade -= 1;
      if (profundidade === 0) {
        return i;
      }
    }
  }
  return -1;
}

function buscarObjetoEmbutido(texto) {
  for (let inicio = texto.indexOf('{'); inicio !== -1; inicio = texto.indexOf('{', inicio + 1)) {
    const fim = fimDoObjeto(texto, inicio);
    const objeto = fim === -1 ? null : tentarParse(texto.slice(inicio, fim + 1));
    if (objeto) {
      return objeto;
    }
  }
  return null;
}

function extrairObjetoJson(bruto) {
  if (typeof bruto !== 'string' || !bruto.trim()) {
    throw new RespostaNaoJsonError(bruto);
  }
  const cerca = bruto.match(CERCA_MARKDOWN);
  // Se a cerca não contém JSON (ex.: um bloco de código antes do JSON real), cai para o texto inteiro.
  const candidatos = cerca ? [cerca[1].trim(), bruto.trim()] : [bruto.trim()];
  for (const texto of candidatos) {
    const objeto = tentarParse(texto) || buscarObjetoEmbutido(texto);
    if (objeto) {
      return objeto;
    }
  }
  throw new RespostaNaoJsonError(bruto);
}

module.exports = { extrairObjetoJson, RespostaNaoJsonError };
