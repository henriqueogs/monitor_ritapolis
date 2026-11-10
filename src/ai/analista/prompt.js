'use strict';

/**
 * Prompt do Analista IA (Na Lupa v4, trilha 2) e leitura da resposta. O modelo recebe só o
 * dossiê (fatos com id), aponta padrões incomuns com evidência literal e responde em JSON; o
 * verificador confere cada evidência depois. As url_origem não vão no prompt: o sistema as
 * anexa pela fonte citada.
 */

const { extrairObjetoJson, RespostaNaoJsonError } = require('../ports/json-resposta');
const { TIPOS_ACHADO } = require('./verificador');

const REGRAS = [
  'Você é um analista de dados públicos municipais. Aponte padrões incomuns, incoerências, valores atípicos, repetições ou lacunas que um cidadão curioso gostaria de conferir.',
  'Use SOMENTE os fatos abaixo. Cada achado precisa de evidências: o "fonte_id" e um "trecho" copiado LITERALMENTE do texto da fonte (sem reescrever).',
  'Não some, não calcule e não estime valores: cite apenas números que aparecem nas fontes (os totais estão no [RESUMO], calculados pelo sistema).',
  'Linguagem neutra: descreva o fato, o critério e o que falta confirmar. Não acuse ninguém, não atribua intenção e não use termos como fraude, desvio, irregular ou ilegal. Uma repetição pode ter explicação legítima.',
  'Não relate o trivial: numeração de empenho reiniciada a cada exercício, erro de digitação ou grafia, campo de texto truncado e repetição de histórico padrão não são achados.',
  'Se não houver nada incomum, responda com "achados" vazio. Não force uma suspeita.',
];

const ESQUEMA = `{
  "achados": [
    {
      "achado": "frase curta com o que chama atenção",
      "tipo": "um de: ${TIPOS_ACHADO.join(' | ')}",
      "evidencias": [{ "fonte_id": "E123", "trecho": "trecho literal da fonte" }],
      "por_que_suspeito": "por que isso merece conferência, só com números das fontes",
      "o_que_falta_para_confirmar": "o que um humano precisa checar",
      "confianca": 0.0
    }
  ]
}`;

function montarPromptAnalista(dossie) {
  const fontes = dossie.fontes.map(f => `[${f.fonte_id}] ${f.texto}`).join('\n');
  return [
    REGRAS.join('\n'),
    `Responda somente com JSON neste formato (ou {"achados": []} se nada incomum):\n${ESQUEMA}`,
    `Dossiê: ${dossie.titulo}\nFatos:\n${fontes}`,
  ].join('\n\n');
}

function lerRespostaAnalista(bruto) {
  try {
    return extrairObjetoJson(bruto);
  } catch (error) {
    if (error instanceof RespostaNaoJsonError) {
      return null;
    }
    throw error;
  }
}

module.exports = { montarPromptAnalista, lerRespostaAnalista };
