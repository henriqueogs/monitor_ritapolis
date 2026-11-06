'use strict';

// Inferência e validação de datas e anos de referência de documentos.

const ANO_MIN = 2000;
const ANO_MIN_CALENDARIO = 1900;

function anoValido(n) {
  const atual = new Date().getFullYear();
  return Number.isInteger(n) && n >= ANO_MIN && n <= atual + 1;
}

function validarDataIso(iso) {
  const m = String(iso || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    return null;
  }
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  const anoMax = new Date().getFullYear() + 1;
  if (ano < ANO_MIN_CALENDARIO || ano > anoMax || mes < 1 || mes > 12 || dia < 1 || dia > 31) {
    return null;
  }
  const dt = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    Number.isNaN(dt.getTime()) ||
    dt.getUTCFullYear() !== ano ||
    dt.getUTCMonth() + 1 !== mes ||
    dt.getUTCDate() !== dia
  ) {
    return null;
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function anoDeData(iso) {
  const validada = validarDataIso(String(iso || '').slice(0, 10));
  if (!validada) {
    return null;
  }
  return Number(validada.slice(0, 4));
}

function extrairAnoDoTexto(numero, titulo) {
  const texto = `${numero || ''} ${titulo || ''}`;

  const anos4 = (texto.match(/\b(?:19|20)\d{2}\b/g) || []).map(Number).filter(anoValido);
  if (anos4.length) {
    return Math.max(...anos4);
  }

  const m2 = texto.match(/\b\d{1,4}\/(\d{2})\b/);
  if (m2) {
    const ano = 2000 + Number(m2[1]);
    if (anoValido(ano)) {
      return ano;
    }
  }

  return null;
}

/**
 * Deriva o ano (ou null) na ordem de confiança:
 *   1. data_publicacao / data_abertura (ISO) → ano da data.
 *   2. ano de 4 dígitos (19xx/20xx) em numero/titulo → o maior plausível.
 *   3. padrão "NNNN/AA" (Processo 0064/24) → 20AA.
 */
function extrairAno({ dataPublicacao = null, dataAbertura = null, numero = null, titulo = null } = {}) {
  for (const data of [dataPublicacao, dataAbertura]) {
    const ano = anoDeData(data);
    if (anoValido(ano)) {
      return ano;
    }
  }

  return extrairAnoDoTexto(numero, titulo);
}

/**
 * Deriva o ano oficial do INSTRUMENTO/PROCESSO (ex.: Processo 0117/2023 publicado
 * em jan/2024 → 2023; Emenda Estadual 2025 publicada em fev/2026 → 2025).
 * Quando o número ou título declara explicitamente o ano do processo/instrumento,
 * ele prevalece como `ano` do instrumento, enquanto `data_publicacao` guarda o ano
 * da publicação (permitindo acionar a flag `divergencia_ano_publicacao`).
 */
function extrairAnoInstrumento({ numero = null, titulo = null, dataPublicacao = null, dataAbertura = null } = {}) {
  const anoTexto = extrairAnoDoTexto(numero, titulo);
  if (anoValido(anoTexto)) {
    return anoTexto;
  }
  return extrairAno({ dataPublicacao, dataAbertura, numero, titulo });
}

// Extrai uma data brasileira (DD/MM/AAAA) de uma string com ruído ao redor,
// devolvendo ISO "AAAA-MM-DD". Aceita "(10/06/2026 07:46:39)", "10/06/2026", etc.
function parseDataBrasileira(texto) {
  const m = String(texto || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) {
    return null;
  }
  const [, dia, mes, ano] = m;
  return validarDataIso(`${ano}-${mes}-${dia}`);
}

/**
 * Normaliza qualquer string de data ('YYYY-MM-DD' ou 'DD/MM/YYYY') para ISO 'YYYY-MM-DD'
 * validada contra o calendário real, ou retorna null se inválida.
 */
function normalizarDataIso(valor) {
  if (!valor) {
    return null;
  }
  const str = String(valor).trim();
  const isoDireto = validarDataIso(str.slice(0, 10));
  if (isoDireto) {
    return isoDireto;
  }
  return parseDataBrasileira(str);
}

// Uma data de PUBLICAÇÃO não pode ser futura (§11.2). Devolve a data se for <=
// hoje, senão null (provavelmente é data de sessão/abertura, não de publicação).
function naoFutura(isoDate, hoje = new Date()) {
  const validada = validarDataIso(isoDate);
  if (!validada) {
    return null;
  }
  return validada <= hoje.toISOString().slice(0, 10) ? validada : null;
}

module.exports = {
  extrairAno,
  extrairAnoInstrumento,
  validarDataIso,
  normalizarDataIso,
  anoValido,
  anoDeData,
  parseDataBrasileira,
  naoFutura,
};
