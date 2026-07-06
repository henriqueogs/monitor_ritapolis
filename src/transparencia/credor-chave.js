'use strict';

/**
 * Identidade única de credor (domínio puro).
 * PJ: os 14 dígitos do CNPJ. PF: 'pf-' + slug do nome — o Portal SH3 não
 * expõe CPF, então o nome normalizado é a melhor chave disponível (homônimos
 * exatos colapsam num perfil só; a UI rotula esse agrupamento).
 */

const PF_PREFIXO = 'pf-';
const CNPJ_DIGITOS = 14;

function slugNomeCredor(nome) {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildCredorChave({ cnpj, nome } = {}) {
  const digitos = String(cnpj || '').replace(/\D/g, '');
  if (digitos.length === CNPJ_DIGITOS) {return digitos;}

  const slug = slugNomeCredor(nome);
  if (!slug) {return null;}
  return `${PF_PREFIXO}${slug}`;
}

/**
 * Valida o identificador vindo da rota. Aceita CNPJ (formatado ou não) ou
 * chave 'pf-…'. Retorna null pra entrada inválida.
 */
function parseCredorChave(param) {
  const texto = String(param || '').trim();
  if (!texto) {return null;}

  if (texto.startsWith(PF_PREFIXO)) {
    const slug = texto.slice(PF_PREFIXO.length);
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {return null;}
    return { tipo: 'pf', chave: texto };
  }

  const digitos = texto.replace(/\D/g, '');
  if (digitos.length === CNPJ_DIGITOS) {return { tipo: 'cnpj', chave: digitos };}

  return null;
}

module.exports = { slugNomeCredor, buildCredorChave, parseCredorChave, PF_PREFIXO };
