'use strict';

/**
 * Parser para emendas parlamentares estaduais e federais.
 * Funcoes puras - sem efeitos colaterais, sem acesso a DB.
 */

const ESFERA = { ESTADUAL: 'estadual', FEDERAL: 'federal' };

function extrairCampo(texto, rotulo) {
  const escaped = rotulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escaped + '[:\\s]+([^\\n]{1,300})', 'i');
  const match = String(texto || '').match(pattern);
  if (!match) { return null; }
  return match[1].trim().replace(/\s{2,}/g, ' ') || null;
}

function parsearValorMonetario(texto) {
  if (!texto) { return null; }
  const match = String(texto).match(/R\$\s*([\d.,]+)/i);
  if (!match) { return null; }
  const normalizado = match[1].replace(/\./g, '').replace(',', '.');
  const valor = parseFloat(normalizado);
  return Number.isFinite(valor) ? valor : null;
}

function parsearDataBR(texto) {
  if (!texto) { return null; }
  const match = String(texto).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) { return null; }
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function inferirEsfera(texto, titulo) {
  const src = `${titulo || ''} ${texto || ''}`;
  if (/emenda[s]?\s+estadua(?:l|is)/i.test(src)) { return ESFERA.ESTADUAL; }
  if (/emenda[s]?\s+federa(?:l|is)/i.test(src)) { return ESFERA.FEDERAL; }
  if (/assembleia legislativa/i.test(src)) { return ESFERA.ESTADUAL; }
  if (/c[aâ]mara dos deputados|senado federal/i.test(src)) { return ESFERA.FEDERAL; }
  return null;
}

function extrairParlamentar(texto) {
  const raw = extrairCampo(texto, 'NOME DO PARLAMENTAR');
  if (!raw) { return { nome: null, cargo: null }; }
  const sep = raw.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (sep) { return { nome: sep[1].trim(), cargo: sep[2].trim() }; }
  return { nome: raw, cargo: null };
}

function parseEmendaParlamentar(texto, opts) {
  const titulo = (opts && opts.titulo) || null;
  const src = String(texto || '');
  if (!src || src.length < 50) { return null; }
  if (!/emenda[s]?\s+(?:estadua(?:l|is)|federa(?:l|is)|parlamentar)/i.test(src)) { return null; }

  const parlamentar = extrairParlamentar(src);
  const valorRepasseRaw = extrairCampo(src, 'VALOR DO REPASSE');
  const valorContrapartidaRaw = extrairCampo(src, 'VALOR DA CONTRAPARTIDA');

  const dataInicioRaw = extrairCampo(src, 'INICIO') || extrairCampo(src, 'INÍCIO');
  const dataTerminoRaw = extrairCampo(src, 'TERMINO') || extrairCampo(src, 'TÉRMINO');
  const dataRecebimentoRaw = extrairCampo(src, 'DATA DE RECEBIMENTO DO RECURSO');

  return {
    numero_emenda:
      extrairCampo(src, 'N.o DA EMENDA') ||
      extrairCampo(src, 'No DA EMENDA') ||
      extrairCampo(src, 'Nº DA EMENDA') ||
      extrairCampo(src, 'N.º DA EMENDA'),
    nome_parlamentar: parlamentar.nome,
    cargo_parlamentar: parlamentar.cargo,
    partido: extrairCampo(src, 'PARTIDO DO PARLAMENTAR'),
    esfera: inferirEsfera(src, titulo),
    tipo_transferencia:
      extrairCampo(src, 'TIPO DE TRANSFERÊNCIA') ||
      extrairCampo(src, 'TIPO DE TRANSFERENCIA'),
    tipo_emenda: extrairCampo(src, 'TIPO DE EMENDA'),
    objeto: extrairCampo(src, 'OBJETO'),
    objeto_detalhado: extrairCampo(src, 'OBJETO DETALHADO'),
    valor_repasse: parsearValorMonetario(valorRepasseRaw),
    valor_repasse_raw: valorRepasseRaw,
    valor_contrapartida: parsearValorMonetario(valorContrapartidaRaw),
    orgao_transferidor:
      extrairCampo(src, 'ÓRGÃO TRANSFERIDOR') ||
      extrairCampo(src, 'ORGAO TRANSFERIDOR'),
    instrumento_legal: extrairCampo(src, 'INSTRUMENTO LEGAL'),
    categoria_economica:
      extrairCampo(src, 'CATEGORIA ECONÔMICA') ||
      extrairCampo(src, 'CATEGORIA ECONOMICA'),
    unidade_executora: extrairCampo(src, 'UNIDADE EXECUTORA'),
    gestor_responsavel:
      extrairCampo(src, 'GESTOR RESPONSÁVEL') ||
      extrairCampo(src, 'GESTOR RESPONSAVEL'),
    data_inicio: parsearDataBR(dataInicioRaw),
    data_termino: parsearDataBR(dataTerminoRaw),
    data_recebimento: parsearDataBR(dataRecebimentoRaw),
    dados_despesa: extrairCampo(src, 'DADOS DA DESPESA'),
  };
}

module.exports = {
  parseEmendaParlamentar,
  parsearValorMonetario,
  parsearDataBR,
  extrairCampo,
  inferirEsfera,
  extrairParlamentar,
  ESFERA,
};
