'use strict';

// Identidade de modalidade de licitação {tipo, numero, ano}, usada para vincular
// empenhos do portal de transparência ao edital correto. O vínculo por número
// solto (LIKE no título) casava o número da modalidade com o número do PROCESSO
// e ignorava o tipo — gerando ~46% de links errados. Aqui a correspondência é
// exata: tipo canônico + número + ano.

const { normalizeText } = require('../utils/text');

// Ordem importa: padrões mais específicos primeiro.
const TIPOS = [
  ['pregao', /preg[aã]o/],
  ['adesao', /ades[aã]o/],
  // O portal oficial publica com frequência a grafia abreviada/errada
  // "inexibilidade". Ela deve continuar sendo tratada como inexigibilidade
  // para que o vínculo entre empenho e processo não seja perdido.
  ['inexigibilidade', /inexig|inexibil/],
  ['dispensa', /dispensa/],
  ['tomada', /tomada\s+de\s+pre/],
  ['concorrencia', /concorr[eê]ncia/],
  ['chamamento', /chamada\s+p[uú]blica|chamamento|credenciamento/],
  ['leilao', /leil[aã]o/],
  ['concurso', /concurso/],
];

// Regexes de tipo com flag `i` — usadas para localizar a POSIÇÃO da palavra da
// modalidade dentro do segmento (as classes [aã] já cobrem acentuação).
const TIPOS_POSICIONAIS = TIPOS.map(([canonico, regex]) => [canonico, new RegExp(regex.source, 'i')]);

// "Lei 14.133/2021", "Decreto nº 10.024/2019", "8.666/93" — números de norma
// citados no título não são o número da modalidade.
const REFERENCIA_LEGAL =
  /\b(?:lei|leis|lc|decreto|decretos|medida\s+provis[oó]ria|mp|portaria|instru[cç][aã]o\s+normativa)\s*(?:complementar\s*)?(?:federal\s*|estadual\s*|municipal\s*)?n?[ºo°.]*\s*[\d.]+\s*\/\s*\d{2,4}/gi;
const NUMERO_COM_MILHAR = /\b\d{1,3}\.\d{3}\s*\/\s*\d{2,4}/g;

// Quantas palavras podem preceder a palavra da modalidade para que o número do
// segmento SEGUINTE seja adotado. O título vem de "Processo NNNN/AAAA -
// <Modalidade> - <objeto>": no segmento da modalidade a palavra está no início.
// Menção tardia ("contratação de empresa para leilão de bens" seguida de
// "003/2022") é objeto, não identificação da licitação.
const MAX_PALAVRAS_ANTES_DO_TIPO = 3;
// Só caracteres não numéricos podem separar a modalidade do seu número
// ("Adesão Ata Registro de Preço nº 003/2025"). Uma janela curta evita capturar
// o número de outra coisa citada adiante.
const JANELA_NUMERO_APOS_TIPO = 32;
const ANO_CURTO_LIMITE = 100;
const SECULO = 2000;

function normalizarTexto(value) {
  return normalizeText(String(value || ''))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function normalizarTipoModalidade(value) {
  const texto = normalizarTexto(value);
  if (!texto.trim()) {
    return null;
  }
  for (const [canonico, regex] of TIPOS) {
    // testa o regex sobre a versão sem acentos (regex já usa classes flexíveis)
    if (regex.test(value) || regex.test(texto)) {
      return canonico;
    }
  }
  return null;
}

// Despesa: "Pregão - 00482023" → {tipo:'pregao', numero:48, ano:2023}
function parseModalidadeDespesa(modalidade) {
  if (!modalidade) {
    return null;
  }
  const m = String(modalidade).match(/^(.+?)\s*-\s*(\d{6,8})\s*$/);
  if (!m) {
    return null;
  }
  const tipo = normalizarTipoModalidade(m[1]);
  const codigo = m[2];
  const ano = Number(codigo.slice(-4));
  if (!tipo || ano < 2010 || ano > 2050) {
    return null;
  }
  return { tipo, numero: Number(codigo.slice(0, -4)), ano };
}

function removerReferenciasLegais(texto) {
  return String(texto).replace(REFERENCIA_LEGAL, ' ').replace(NUMERO_COM_MILHAR, ' ');
}

// Localiza a palavra da modalidade no segmento e devolve onde ela começa/termina.
// Vence a que aparece primeiro no texto (empate: ordem de especificidade de
// TIPOS) — em títulos longos a primeira menção é a que identifica o processo.
function localizarTipoNoSegmento(segmento) {
  const alvo = String(segmento).toLowerCase();
  let melhor = null;
  for (const [canonico, regex] of TIPOS_POSICIONAIS) {
    const encontrado = regex.exec(alvo);
    if (!encontrado || (melhor && encontrado.index >= melhor.inicio)) {
      continue;
    }
    melhor = {
      tipo: canonico,
      inicio: encontrado.index,
      fim: encontrado.index + encontrado[0].length,
    };
  }
  return melhor;
}

function palavrasAntesDe(segmento, indice) {
  return String(segmento)
    .slice(0, indice)
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

// Só aceita o número quando ele vem DEPOIS da modalidade, separado apenas por
// texto sem dígitos ("Presencial RP nº 048/2023") e sem referência legal.
function numeroAposTipo(segmento, fim) {
  const trecho = removerReferenciasLegais(String(segmento).slice(fim));
  const padrao = new RegExp(`^[^\\d]{0,${JANELA_NUMERO_APOS_TIPO}}(\\d{1,4})\\s*/\\s*(\\d{2,4})`);
  return trecho.match(padrao);
}

function numeroEmSegmentoProprio(segmento) {
  return String(segmento || '').match(/^(?:n[ºo°]\s*)?(\d{1,4})\s*\/\s*(\d{2,4})$/i);
}

function montarModalidade(tipo, num) {
  if (!num) {
    return { tipo, numero: null, ano: null };
  }
  const anoBruto = Number(num[2]);
  const ano = anoBruto < ANO_CURTO_LIMITE ? anoBruto + SECULO : anoBruto;
  return { tipo, numero: Number(num[1]), ano };
}

// Edital: "Processo 0107/2023 - Pregão - 0048/2023 - ..." → modalidade após o
// processo. Pega o segmento de modalidade (ignora o "Processo NNNN/AAAA") e o
// primeiro NNN/AAAA que aparece DEPOIS do tipo (ignora "RP" e "nº").
function parseModalidadeEdital(titulo) {
  if (!titulo) {
    return null;
  }

  const segmentos = normalizeText(String(titulo))
    .split(/\s+[-–]\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (let i = 0; i < segmentos.length; i += 1) {
    const seg = segmentos[i];
    if (/^processo/i.test(seg)) {
      continue;
    }
    const encontrado = localizarTipoNoSegmento(seg);
    if (!encontrado) {
      continue;
    }
    const noInicio = palavrasAntesDe(seg, encontrado.inicio) <= MAX_PALAVRAS_ANTES_DO_TIPO;
    // número colado na modalidade ("Tomada de Preços nº 02/2023")...
    // ...ou no segmento seguinte quando ele é só o número ("Pregão - 0048/2023")
    const num =
      numeroAposTipo(seg, encontrado.fim) ||
      (noInicio ? numeroEmSegmentoProprio(segmentos[i + 1]) : null);
    // Menção no meio do objeto sem número próprio não identifica a licitação.
    if (!num && !noInicio) {
      continue;
    }
    return montarModalidade(encontrado.tipo, num);
  }

  return null;
}

function modalidadesCorrespondem(a, b) {
  if (!a || !b) {
    return false;
  }
  if (a.numero === null || a.numero === undefined || b.numero === null || b.numero === undefined) {
    return false;
  }
  return a.tipo === b.tipo && a.numero === b.numero && a.ano === b.ano;
}

/**
 * Retorna true somente quando a modalidade da despesa e a modalidade do
 * documento podem ser identificadas e coincidem em tipo, número e ano.
 * Sem os dois parses não há evidência suficiente para exibir o documento
 * como "licitação de origem".
 */
function vinculoDocumentoExato(modalidadeDespesa, tituloDocumento) {
  return modalidadesCorrespondem(
    parseModalidadeDespesa(modalidadeDespesa),
    parseModalidadeEdital(tituloDocumento)
  );
}

module.exports = {
  normalizarTipoModalidade,
  parseModalidadeDespesa,
  parseModalidadeEdital,
  modalidadesCorrespondem,
  vinculoDocumentoExato,
};
