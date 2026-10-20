'use strict';

/**
 * Identidade do município (o "ente") como configuração: nome, UF, código IBGE e CNPJs da
 * Prefeitura e da Câmara. Fonte única para o código de produção (Fase 3, passo 1 do
 * docs/MAPA_GENERICO_VS_RITAPOLIS.md): nada fora de `src/config.js` e deste módulo deve ter CNPJ,
 * UF ou código IBGE escrito à mão (a guarda tests/ente-sem-literal.test.js falha se aparecer).
 *
 * Valor inválido na configuração derruba o carregamento com o nome da variável: um CNPJ errado
 * não pode virar número errado em silêncio (concentração de fornecedores, parsers, credores).
 */

const config = require('./config');

const TAMANHO_CNPJ = 14;
const TAMANHO_IBGE = 7;
const TAMANHO_UF = 2;

const soDigitos = valor => String(valor ?? '').replace(/\D/g, '');
const semAcento = texto =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

function exigirCnpj(variavel, valor) {
  const digitos = soDigitos(valor);
  if (digitos.length !== TAMANHO_CNPJ) {
    throw new Error(`${variavel} inválido: esperado CNPJ de 14 dígitos, recebido "${valor}"`);
  }
  return digitos;
}

function exigirIbge(valor) {
  const digitos = String(valor ?? '').trim();
  if (!/^\d+$/.test(digitos) || digitos.length !== TAMANHO_IBGE) {
    throw new Error(`IBGE_CODE inválido: esperado 7 dígitos, recebido "${valor}"`);
  }
  return digitos;
}

function exigirUf(valor) {
  const uf = String(valor ?? '')
    .trim()
    .toUpperCase();
  if (!/^[A-Z]+$/.test(uf) || uf.length !== TAMANHO_UF) {
    throw new Error(`UF_MUNICIPIO inválido: esperado sigla de 2 letras, recebido "${valor}"`);
  }
  return uf;
}

function exigirNome(valor) {
  const nome = String(valor ?? '').trim();
  if (!nome) {
    throw new Error('MUNICIPIO_NOME inválido: nome vazio');
  }
  return nome;
}

function montarEnte(cfg) {
  const nome = exigirNome(cfg.municipioNome);
  const cnpjPrefeitura = exigirCnpj('CNPJ_PREFEITURA', cfg.cnpjPrefeitura);
  const cnpjCamara = exigirCnpj('CNPJ_CAMARA', cfg.cnpjCamara);
  return Object.freeze({
    nome,
    nomeChave: semAcento(nome).toLowerCase(),
    uf: exigirUf(cfg.ufMunicipio),
    ibge: exigirIbge(cfg.ibgeCode),
    cnpjPrefeitura,
    cnpjCamara,
    orgaos: Object.freeze([
      Object.freeze({ cnpj: cnpjPrefeitura, nome: `Prefeitura Municipal de ${nome}` }),
      Object.freeze({ cnpj: cnpjCamara, nome: `Câmara Municipal de ${nome}` }),
    ]),
  });
}

const ente = montarEnte(config);

/** Com ou sem máscara → "00.000.000/0000-00" (formato com máscara); valor que não é CNPJ → null. */
function formatarCnpj(valor) {
  const d = soDigitos(valor);
  if (d.length !== TAMANHO_CNPJ) {
    return null;
  }
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** CNPJs (só dígitos) das entidades do próprio município, sem repetição. */
function cnpjsDoEnte() {
  return [...new Set([ente.cnpjPrefeitura, ente.cnpjCamara])];
}

/** true se o CNPJ (com ou sem máscara) é da Prefeitura ou da Câmara do ente. */
function isCnpjDoEnte(valor) {
  const digitos = soDigitos(valor);
  return digitos.length === TAMANHO_CNPJ && cnpjsDoEnte().includes(digitos);
}

module.exports = { ente, formatarCnpj, cnpjsDoEnte, isCnpjDoEnte };
