'use strict';

/**
 * Runner do Analista IA para um credor: dossiê → prompt → (opcional) modelo → verificação.
 * Não grava nada: devolve o que mediu e o que passou/foi descartado. Sem `chamarModelo` só mede
 * o tamanho do prompt (dry-run de tokens). O repositório de leitura é injetável.
 */

const analistaRepo = require('../../db/analista-repo');
const { estimateTokensFromText } = require('../estimate-tokens');
const { montarDossieCredor } = require('./dossie-credor');
const { montarPromptAnalista, lerRespostaAnalista } = require('./prompt');
const { verificarAchados } = require('./verificador');

async function perguntarAoModelo({ provider, prompt }) {
  const inicio = Date.now();
  const bruto = await provider.generateJson({ prompt });
  return { bruto, duracao_ms: Date.now() - inicio };
}

async function analisarCredor({
  cnpj,
  provider,
  repo = analistaRepo,
  maxEmpenhos,
  chamarModelo = false,
}) {
  const credor = repo.buscarCredor(cnpj);
  if (!credor) {
    throw new Error(`Credor ${cnpj} não encontrado nos empenhos`);
  }
  const dossie = montarDossieCredor({
    credor,
    empenhos: repo.listarEmpenhosDoCredor(cnpj),
    licitacoes: repo.listarLicitacoesDoCredor(cnpj),
    ...(maxEmpenhos ? { maxEmpenhos } : {}),
  });
  const prompt = montarPromptAnalista(dossie);
  const medida = {
    chave: dossie.chave,
    titulo: dossie.titulo,
    fontes: dossie.fontes.length,
    amostra: dossie.amostra,
    tokens_prompt_estimados: estimateTokensFromText(prompt),
    chamou: false,
    aceitos: [],
    descartados: [],
  };
  if (!chamarModelo) {
    return medida;
  }

  const { bruto, duracao_ms: duracao } = await perguntarAoModelo({ provider, prompt });
  const resposta = lerRespostaAnalista(bruto);
  const base = {
    ...medida,
    chamou: true,
    duracao_ms: duracao,
    tokens_resposta_estimados: estimateTokensFromText(bruto),
  };
  if (!resposta) {
    return {
      ...base,
      erro: 'Resposta do modelo não contém JSON válido',
      bruta: String(bruto).slice(0, 500),
    };
  }
  return { ...base, ...verificarAchados(resposta, dossie) };
}

module.exports = { analisarCredor };
