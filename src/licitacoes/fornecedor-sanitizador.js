'use strict';

/**
 * Sanitizador puro de nomes e CNPJs de fornecedores/vencedores/credores.
 * Impede que o CNPJ do próprio ente municipal, placeholders de minuta contratual
 * ("CONTRATADA", "LICITANTE", "Empresa ___") ou lixo de cabeçalho de ata/endereço
 * contaminem licitacoes_detalhes, licitacoes_produtos e fornecedores_perfil.
 */

const { ente, formatarCnpj, isCnpjDoEnte } = require('../ente');
const { normalizarCnpj } = require('./cnpj');

const CNPJ_PREFEITURA_FORMATADO = formatarCnpj(ente.cnpjPrefeitura);
const SUFIXO_CNPJ_PREFEITURA_LONGO = CNPJ_PREFEITURA_FORMATADO ? CNPJ_PREFEITURA_FORMATADO.slice(3) : '';
const SUFIXO_CNPJ_PREFEITURA_CURTO = CNPJ_PREFEITURA_FORMATADO ? CNPJ_PREFEITURA_FORMATADO.slice(7) : '';
const RAIZES_CNPJ_ENTE = [
  ente.cnpjPrefeitura ? ente.cnpjPrefeitura.slice(0, 8) : null,
  ente.cnpjCamara ? ente.cnpjCamara.slice(0, 8) : null
].filter(Boolean);

function escapeRegex(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SUFIXO_PREF_RE = CNPJ_PREFEITURA_FORMATADO
  ? new RegExp(
      `^(?:${escapeRegex(CNPJ_PREFEITURA_FORMATADO)}|${escapeRegex(SUFIXO_CNPJ_PREFEITURA_LONGO)}|${escapeRegex(SUFIXO_CNPJ_PREFEITURA_CURTO)})\\s*(?:Higino\\s+Zacarias\\s+de\\s+Sou[zs]a\\s+)?`,
      'i'
    )
  : null;

const PREFIXO_PREFEITURA_ENTE_RE = new RegExp(
  `^.*?\\b(?:Prefeitura|C[aâ]mara)\\s+Municipal\\s+de\\s+${escapeRegex(ente.nome)}(?:\\s*[-–/]\\s*${escapeRegex(ente.uf)})?\\s*`,
  'i'
);

function semAcento(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function compactar(valor) {
  if (valor === null || valor === undefined) {
    return '';
  }
  return String(valor).replace(/\r/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Sanitiza um CNPJ de fornecedor/vencedor:
 * - Converte null/undefined/'undefined'/'null' para null
 * - Rejeita CNPJ da Prefeitura ou da Câmara do ente (isCnpjDoEnte)
 * - Rejeita strings que não tenham exatamente 14 dígitos válidos
 */
function sanitizarCnpjFornecedor(valor, { formatado = true } = {}) {
  const texto = compactar(valor);
  if (!texto || /^(?:undefined|null|nan|-+)$/i.test(texto)) {
    return null;
  }
  // Se contém letras (exceto pontuação normal de CNPJ), rejeita
  if (/[a-zA-Z]/.test(texto.replace(/^cnpj\s*:?\s*/i, ''))) {
    return null;
  }
  const digitos = normalizarCnpj(texto);
  if (!digitos) {
    return null;
  }
  if (/^(\d)\1{13}$/.test(digitos)) {
    return null;
  }
  if (isCnpjDoEnte(digitos) || RAIZES_CNPJ_ENTE.includes(digitos.slice(0, 8))) {
    return null;
  }
  return formatado ? formatarCnpj(digitos) : digitos;
}

/**
 * Verifica se um nome de fornecedor é placeholder de minuta, nome do próprio
 * ente público ou fragmento inválido de cabeçalho/endereço/CNPJ.
 */
function ehNomeFornecedorInvalido(valor) {
  const texto = compactar(valor);
  if (!texto || texto.length < 2) {
    return true;
  }

  const norm = semAcento(texto).toLowerCase().replace(/[.,;:!?]+$/g, '').trim();
  if (!norm || norm === 'undefined' || norm === 'null' || norm === 'nan') {
    return true;
  }
  if (norm.length === 2 && norm !== 'oi') {
    return true;
  }

  // Placeholders genéricos de minutas de edital/contrato
  if (
    /^(?:a\s+|o\s+|os\s+|as\s+)?(?:empresa\s+)?(?:contratad[ao]s?|contratantes?|licitantes?|proponentes?|permissionarias?|fornecedor(?:a|es)?|credor(?:a|es)?| adjudicatari[ao]s?)$/.test(norm) ||
    /^vencedor(?:\(a\)|a|es)?(?:\s+d[ao]\s+licitacao|\s+do\s+certame|\s+do\s+processo)?$/.test(norm) ||
    /^empresa\s*[_.\-\s]*$/.test(norm) ||
    /_{3,}/.test(norm)
  ) {
    return true;
  }

  // Fragmentos puros de rótulo de CNPJ
  if (
    /^(?:inscrit[ao]\s+no\s+)?cnpj(?:\s+sob\s+o)?(?:\s+n[ºo°.]?)?$/.test(norm) ||
    (SUFIXO_CNPJ_PREFEITURA_LONGO && norm === `${SUFIXO_CNPJ_PREFEITURA_LONGO.toLowerCase()} cnpj`) ||
    (SUFIXO_CNPJ_PREFEITURA_CURTO && norm === `${SUFIXO_CNPJ_PREFEITURA_CURTO.toLowerCase()} cnpj`) ||
    (CNPJ_PREFEITURA_FORMATADO && norm.includes(CNPJ_PREFEITURA_FORMATADO.toLowerCase()))
  ) {
    return true;
  }

  // Fragmentos de endereço ou CEP capturados por engano antes do CNPJ
  if (
    /^(?:cep\b|bairro\b|rua\b|av\.?\b|avenida\b|praca\b|cidade\s*:)/.test(norm) ||
    /\bcep\s*[.:]?\s*\d{2}\.?\d{3}\s*-\s*\d{3}/.test(norm) ||
    /^\d{2,3}\s*-\s*\d{3}$/.test(norm) ||
    /^[\d./\-\s]+(?:cnpj)?$/.test(norm)
  ) {
    return true;
  }

  // Próprio ente municipal ou órgãos internos da administração
  if (
    norm === 'prefeitura municipal' ||
    norm === 'camara municipal' ||
    norm.includes(`prefeitura municipal de ${ente.nomeChave}`) ||
    norm.includes(`camara municipal de ${ente.nomeChave}`) ||
    norm.includes(`municipio de ${ente.nomeChave}`) ||
    norm.includes(`municipal de ${ente.nomeChave}`) ||
    /^(?:departamento|secretaria|fundo|conselho)\s+municipal\b/.test(norm) ||
    norm.includes('pessoa juridica de direito publico') ||
    norm === 'de natureza publica'
  ) {
    return true;
  }

  return false;
}

/**
 * Limpa ruídos conhecidos de cabeçalho de ata, portal e assinatura em nomes de
 * empresas e retorna null caso o resultado seja inválido/placeholder.
 */
function sanitizarNomeFornecedor(valor) {
  let texto = compactar(valor);
  if (!texto || /^(?:undefined|null|nan)$/i.test(texto)) {
    return null;
  }

  texto = texto
    .replace(/^.*?\bDOCUMENTO\s+DA\s+EMPRESA\s+REPRESENTANTE\s+DOCUMENTO\s+DO\s+REPRESENTANTE\s+/i, '')
    .replace(/^.*?\bDOCUMENTO\s+DO\s+REPRESENTANTE\s+/i, '')
    .replace(/^.*?\bDOCUMENTO\s+DA\s+EMPRESA\s+/i, '')
    .replace(/^.*?\bmg\s+gov\s+br\s+Produto\s+Vencedor\s+(?:LOTE\s+\d+\s+)?/i, '')
    .replace(/^.*?\brepresentando\s+a\s+(?:empresa\s+)?/i, '');

  if (SUFIXO_PREF_RE) {
    texto = texto.replace(SUFIXO_PREF_RE, '');
  }
  if (PREFIXO_PREFEITURA_ENTE_RE) {
    texto = texto.replace(PREFIXO_PREFEITURA_ENTE_RE, '');
  }

  texto = texto
    .replace(/^(?:a\s+)?empresa\s+contratada\s*:?\s*/i, '')
    .replace(/^(?:a\s+)?empresa\s+(?!_{2,})/i, '')
    .replace(/^contratad[ao]\s*(?:raz[aã]o\s+social\s*:?)?\s*:?\s*/i, '')
    .replace(/^raz[aã]o\s+social\s*:?\s*/i, '')
    .replace(/\s*,?\s*(?:inscrita|inscrito)\s+no\s+cnpj.*$/i, '')
    .replace(/\s*,?\s*neste\s+ato.*$/i, '')
    .replace(/\s*,?\s*doravante.*$/i, '')
    .replace(/\s*(?:,|-)?\s*(?:sob\s+o\s+)?CNPJ\s*(?:sob\s+o\s+)?(?:n[ºo°.]?\s*)?$/i, '')
    .replace(/\s+\w?\]\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.,;:–-]+|[.,;:–-]+$/g, '')
    .trim();

  if (ehNomeFornecedorInvalido(texto)) {
    return null;
  }

  return texto;
}

/**
 * Sanitiza o par { nome, cnpj } de um vencedor/fornecedor.
 */
function sanitizarFornecedor({ nome = null, cnpj = null } = {}, opts = {}) {
  const cnpjLimpo = sanitizarCnpjFornecedor(cnpj, opts);
  const nomeLimpo = sanitizarNomeFornecedor(nome);
  return {
    nome: nomeLimpo,
    cnpj: cnpjLimpo,
  };
}

module.exports = {
  ehCnpjDoEnte: isCnpjDoEnte,
  isCnpjDoEnte,
  ehNomeFornecedorInvalido,
  isNomeFornecedorInvalido: ehNomeFornecedorInvalido,
  sanitizarNomeFornecedor,
  sanitizarCnpjFornecedor,
  sanitizarFornecedor,
};
