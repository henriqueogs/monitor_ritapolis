'use strict';

/**
 * Coletor: Folha Salarial do Portal da Transparência (mesmo portal SH3
 * usado por ColetorPortalTransparencia, módulo "Folha" em vez de
 * "Tempo_Real_Despesa"). Sem janelamento — 1 requisição por exercício
 * inteiro (Mes='%'), o CSV de um ano fica em torno de 1MB, bem abaixo do
 * que exige janelas semanais como despesas.
 */

const ColetorBase = require('./base');
const logger = require('../logger');
const config = require('../config');
const { upsertColetaLog, getColetaLog } = require('../db/transparencia-repo');
const { coletarFolhaExercicioViaThread } = require('./folha-thread-http');

const ANO_INICIO = config.folhaAnoInicio;

class ColetorFolha extends ColetorBase {
  constructor() {
    super({ fonte: 'portal_transparencia_folha' });
  }

  async executar(resultado) {
    const hoje = new Date();
    const anoAtual = hoje.getFullYear();
    const hojeStr = hoje.toISOString().slice(0, 10);

    let totalNovos = 0;
    let totalAtualizados = 0;

    for (let ano = ANO_INICIO; ano <= anoAtual; ano += 1) {
      const logAno = getColetaLog('folha', ano, null);
      if (logAno && logAno.coletado_em.startsWith(hojeStr) && logAno.status === 'ok') {
        logger.debug('folha: ano já coletado hoje, pulando', { ano });
        continue;
      }

      try {
        logger.info('folha: coletando exercício', { ano });
        const stats = await coletarFolhaExercicioViaThread(ano);
        totalNovos += stats.novos;
        totalAtualizados += stats.atualizados;

        upsertColetaLog({
          tipo: 'folha',
          exercicio: ano,
          mes: null,
          registros: stats.registros,
          novos: stats.novos,
          atualizados: stats.atualizados,
          status: 'ok',
          erro: null,
        });
        resultado.detalhes.push({ tipo: 'folha', ano, registros: stats.registros, novos: stats.novos });
      } catch (err) {
        if ([401, 403].includes(Number(err?.response?.status))) {
          throw new Error(`Portal da Transparencia (folha) bloqueou a coleta: HTTP ${err.response.status}`);
        }
        logger.warn('folha: erro ao coletar exercício', { ano, erro: err.message });
        upsertColetaLog({
          tipo: 'folha', exercicio: ano, mes: null,
          registros: 0, novos: 0, atualizados: 0,
          status: 'erro', erro: err.message,
        });
        this.registrarErroItem(resultado, { tipo: 'folha', ano }, err);
      }
    }

    resultado.itens_novos += totalNovos;
    resultado.itens_atualizados += totalAtualizados;

    logger.info('folha: coleta concluída', { totalNovos, totalAtualizados });
  }
}

module.exports = ColetorFolha;
