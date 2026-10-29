'use strict';

/**
 * Parser para emendas parlamentares estaduais e federais.
 * Funcoes puras - sem efeitos colaterais, sem acesso a DB.
 */

const { ANO_PLAUSIVEL_MIN } = require('../utils/mandato');

const ESFERA = { ESTADUAL: 'estadual', FEDERAL: 'federal' };

// Rótulos conhecidos do formulário de emenda. A fonte federal vem em LINHA ÚNICA
// (sem \n entre campos), então o valor de um campo precisa parar quando começa o
// PRÓXIMO rótulo — não no fim da linha (senão engole o registro inteiro). Parar só
// em rótulos conhecidos evita cortar no meio de um valor (datas, números, nomes).
const ROTULOS = [
  'N.o DA EMENDA', 'No DA EMENDA', 'Nº DA EMENDA', 'N.º DA EMENDA',
  'NOME DO PARLAMENTAR', 'PARTIDO DO PARLAMENTAR', 'UNIDADE PARLAMENTAR',
  'TIPO DE TRANSFERÊNCIA', 'TIPO DE TRANSFERENCIA', 'TIPO DE EMENDA',
  'OBJETO DETALHADO', 'OBJETO', 'VALOR DO REPASSE', 'VALOR DA CONTRAPARTIDA',
  'ÓRGÃO TRANSFERIDOR', 'ORGAO TRANSFERIDOR', 'INSTRUMENTO LEGAL',
  'CATEGORIA ECONÔMICA', 'CATEGORIA ECONOMICA', 'UNIDADE EXECUTORA',
  'GESTOR RESPONSÁVEL', 'GESTOR RESPONSAVEL', 'DATA DE RECEBIMENTO DO RECURSO',
  'DADOS DA DESPESA', 'INÍCIO', 'INICIO', 'TÉRMINO', 'TERMINO',
];

// Alternância ordenada do mais longo p/ o mais curto (evita "OBJETO" casar antes
// de "OBJETO DETALHADO").
const PROXIMO_ROTULO =
  '(?=\\s+(?:' +
  ROTULOS.slice()
    .sort((a, b) => b.length - a.length)
    .map((r) => r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|') +
  ')\\s*[:]' +
  // ...ou um cabeçalho de seção do formulário ("2 – PLANO DE APLICAÇÃO").
  '|\\s+\\d{1,2}\\s*[\\u2013\\u2014-]\\s*[A-ZÀ-Ÿ]' +
  '|\\n|$)';

function extrairCampo(texto, rotulo) {
  const escaped = rotulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Exige ':' logo após o rótulo (com espaços opcionais). Sem isto, 'OBJETO'
  // casava dentro de 'OBJETO DETALHADO' (separador aceitava só espaço).
  // {0,800}: campo pode ser vazio (federais "OBJETO :" seguido do próximo rótulo)
  // e objetos longos passam dos 300 chars. \\s* no lookahead porque os espaços
  // após o ':' já foram consumidos.
  const stop = PROXIMO_ROTULO.replace('(?=\\s+(?:', '(?=\\s*(?:');
  const pattern = new RegExp(escaped + '\\s*:\\s*(.{0,800}?)' + stop, 'i');
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

// Ano no número da emenda: federal "AAAA" + 8 dígitos (202539600001); estadual "Resolução N.x/AAAA".
const ANO_NUMERO_FEDERAL = /^(20\d{2})\d{8}$/;
const ANO_NUMERO_ESTADUAL = /\/\s*(20\d{2})\b/;

// O número pode ser do orçamento do ano seguinte (LOA votada em dezembro); datas, não.
const MARGEM_ANO_NUMERO = 1;

function anoPlausivel(ano, maximo) {
  return Number.isInteger(ano) && ano >= ANO_PLAUSIVEL_MIN && ano <= maximo ? ano : null;
}

function anoDeIso(data, maximo) {
  const match = String(data || '').match(/^(\d{4})-\d{2}-\d{2}/);
  return match ? anoPlausivel(Number(match[1]), maximo) : null;
}

function anoDoNumeroEmenda(numero, maximo) {
  const texto = String(numero || '');
  const federal = texto.replace(/\D/g, '').match(ANO_NUMERO_FEDERAL);
  if (federal && /^\s*\d[\d\s.]*$/.test(texto)) { return anoPlausivel(Number(federal[1]), maximo); }
  const estadual = texto.match(ANO_NUMERO_ESTADUAL);
  return estadual ? anoPlausivel(Number(estadual[1]), maximo) : null;
}

/**
 * Ano a que a emenda se refere: recebimento do recurso, depois o ano do número da emenda,
 * depois o início. Nunca o ano em que a ficha foi postada no site (CLAUDE.md §11.1).
 * Ano implausível ou futuro (erro de digitação) passa para o próximo critério.
 */
function anoReferenciaEmenda(
  { data_recebimento, numero_emenda, data_inicio } = {},
  { anoAtual = new Date().getFullYear() } = {}
) {
  return (
    anoDeIso(data_recebimento, anoAtual) ??
    anoDoNumeroEmenda(numero_emenda, anoAtual + MARGEM_ANO_NUMERO) ??
    anoDeIso(data_inicio, anoAtual)
  );
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

  const numeroEmenda =
    extrairCampo(src, 'N.o DA EMENDA') ||
    extrairCampo(src, 'No DA EMENDA') ||
    extrairCampo(src, 'Nº DA EMENDA') ||
    extrairCampo(src, 'N.º DA EMENDA');
  const dataInicio = parsearDataBR(dataInicioRaw);
  const dataRecebimento = parsearDataBR(dataRecebimentoRaw);

  return {
    numero_emenda: numeroEmenda,
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
    data_inicio: dataInicio,
    data_termino: parsearDataBR(dataTerminoRaw),
    data_recebimento: dataRecebimento,
    dados_despesa: extrairCampo(src, 'DADOS DA DESPESA'),
    ano_referencia: anoReferenciaEmenda({
      data_recebimento: dataRecebimento,
      numero_emenda: numeroEmenda,
      data_inicio: dataInicio,
    }),
  };
}

module.exports = {
  parseEmendaParlamentar,
  anoReferenciaEmenda,
  parsearValorMonetario,
  parsearDataBR,
  extrairCampo,
  inferirEsfera,
  extrairParlamentar,
  ESFERA,
};
