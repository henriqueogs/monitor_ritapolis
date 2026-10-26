'use strict';

/** Métricas determinísticas da geração: alucinação numérica, linguagem acusatória e cobertura de fatos. */

const VALOR = String.raw`(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)`;
// Valor monetário: "R$ 1.500,00", "1.500,00 reais/real/BRL" ou número decimal solto ("1.500,00").
// Sem marcador de moeda também conta: quem controla é o contexto, não o formato escolhido pelo modelo.
const REAIS = new RegExp(
  String.raw`R\$\s*${VALOR}|${VALOR}\s+(?:reais|real|brl)(?![\p{L}])|(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})(?!\d)`,
  'giu'
);
// Magnitude por extenso ("2 milhões", "3 mil"): só vale se o contexto traz a mesma expressão.
const MAGNITUDE = /\d[\d.,]*\s+(?:milh[\p{L}]*|bilh[\p{L}]*|mil)(?![\p{L}])/giu;

// Radicais (sem acento) que acusam sem decisão oficial — fiscal-privacidade N1/N2.
// Negação ("não há indício de fraude") conta como hit de propósito: o gate é conservador e o
// prompt já proíbe esses termos; ajuste só com decisão de produto.
const RADICAIS_ACUSATORIOS = [
  'fraud',
  'desvio',
  'corrup',
  'superfatur',
  'ilegal',
  'crimin',
  'crime',
  'lavagem de dinheiro',
  'propina',
  'ilicit',
  'improbidade',
  'peculato',
  'malversa',
  'sobrepre',
  'irregular',
];

const normalizar = t =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const paraNumero = texto => Number(texto.replace(/\./g, '').replace(',', '.'));

function valoresEmReais(texto) {
  return [...String(texto).matchAll(REAIS)].map(([citado, comRs, comMoeda, solto]) => ({
    citado: citado.trim(),
    numero: paraNumero(comRs ?? comMoeda ?? solto),
  }));
}

const compactar = t => normalizar(t).replace(/\s+/g, ' ');

/**
 * Valores citados na resposta que NÃO aparecem no contexto (fiscal-valores V6: número só vem do
 * documento). Números soltos sem decimais (item 3, ano 2025) não legitimam nem são conferidos.
 */
function numerosInventados(resposta, contexto) {
  const noContexto = new Set(contexto.flatMap(c => valoresEmReais(c.texto)).map(v => v.numero));
  const monetarios = valoresEmReais(resposta)
    .filter(v => !noContexto.has(v.numero))
    .map(v => v.citado);
  const textoContexto = compactar(contexto.map(c => c.texto).join(' '));
  const magnitudes = [...String(resposta).matchAll(MAGNITUDE)]
    .map(([citado]) => citado.trim())
    .filter(citado => !textoContexto.includes(compactar(citado)));
  return [...monetarios, ...magnitudes];
}

function termosAcusatorios(texto) {
  const alvo = normalizar(texto);
  return RADICAIS_ACUSATORIOS.filter(radical => alvo.includes(radical));
}

/** Fração dos fatos obrigatórios presentes na resposta; null quando o item não define fatos. */
function coberturaFatos(resposta, fatos) {
  if (!fatos?.length) {
    return null;
  }
  const alvo = normalizar(resposta);
  return fatos.filter(f => alvo.includes(normalizar(f))).length / fatos.length;
}

module.exports = { numerosInventados, termosAcusatorios, coberturaFatos };
