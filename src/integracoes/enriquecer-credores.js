'use strict';

/**
 * Orquestra o enriquecimento cadastral dos credores PJ: seleciona CNPJs
 * defasados, consulta a Receita (BrasilAPI) com throttle e grava no cache
 * auditável credores_enriquecimentos. Idempotente — reexecuções só reprocessam
 * o que está faltando, com falha, ou defasado.
 */

const logger = require('../logger');
const config = require('../config');
const { listCnpjsParaEnriquecer, upsertCredorEnriquecimento } = require('../db/credores-repo');
const { buscarCnpj, FONTE } = require('./receita-cnpj');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function gravar(alvo, { dados, confianca, status }) {
  upsertCredorEnriquecimento({
    credor_chave: alvo.chave,
    tipo_credor: 'cnpj',
    fonte: FONTE,
    identificador: alvo.cnpj,
    dados,
    confianca,
    status,
  });
}

async function enriquecerCredores({
  limite = 100,
  force = false,
  sleepMs = config.credorEnriquecimentoSleepMs,
  buscar = buscarCnpj,
} = {}) {
  const alvos = listCnpjsParaEnriquecer({
    limite,
    maxIdadeDias: config.credorEnriquecimentoIntervalDias,
    force,
  });

  const resumo = { selecionados: alvos.length, enriquecidos: 0, sem_registro: 0, erros: 0 };

  for (let i = 0; i < alvos.length; i += 1) {
    const alvo = alvos[i];
    try {
      const resultado = await buscar(alvo.cnpj);
      if (!resultado) {
        gravar(alvo, { dados: { motivo: 'nao_encontrado' }, confianca: 0, status: 'nao_encontrado' });
        resumo.sem_registro += 1;
      } else {
        gravar(alvo, { dados: resultado.dados, confianca: resultado.confianca, status: 'ok' });
        resumo.enriquecidos += 1;
      }
    } catch (err) {
      logger.warn('enriquecer-credores: falha ao consultar CNPJ', { cnpj: alvo.cnpj, erro: err.message });
      gravar(alvo, { dados: { erro: err.message }, confianca: 0, status: 'erro' });
      resumo.erros += 1;
    }
    // Throttle entre chamadas externas; dispensa a espera após o último item.
    if (sleepMs > 0 && i < alvos.length - 1) {
      await sleep(sleepMs);
    }
  }

  return resumo;
}

module.exports = { enriquecerCredores };
