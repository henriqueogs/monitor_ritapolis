'use strict';

/** Métricas determinísticas da geração: alucinação numérica, linguagem acusatória e cobertura de fatos. */

const VALOR = String.raw`(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)`;
// valor em reais: "R$ 1.500,00" ou "1.500,00 reais"
const REAIS = new RegExp(String.raw`R\$\s*${VALOR}|${VALOR}\s+reais`, 'gi');

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
];

const normalizar = t =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const paraNumero = texto => Number(texto.replace(/\./g, '').replace(',', '.'));

function valoresEmReais(texto) {
  return [...String(texto).matchAll(REAIS)].map(([citado, comRs, comReais]) => ({
    citado: citado.trim(),
    numero: paraNumero(comRs ?? comReais),
  }));
}

/**
 * Valores em reais citados na resposta que NÃO aparecem como valor em reais no contexto
 * (fiscal-valores V6: número só vem do documento). Números soltos (item 3, ano 2025) não legitimam.
 */
function numerosInventados(resposta, contexto) {
  const noContexto = new Set(contexto.flatMap(c => valoresEmReais(c.texto)).map(v => v.numero));
  return valoresEmReais(resposta)
    .filter(v => !noContexto.has(v.numero))
    .map(v => v.citado);
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
