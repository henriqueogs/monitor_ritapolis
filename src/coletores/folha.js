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
const { planCollectionYears } = require('../coletas/collection-cadence');

const ANO_INICIO = config.folhaAnoInicio;

class ColetorFolha extends ColetorBase {
  constructor() {
    super({ fonte: 'portal_transparencia_folha' });
  }

  async executar(resultado, { force = false } = {}) {
    const hoje = new Date();

    const anos =
      this.progress?.load('payroll-years') ||
      planCollectionYears({
        anoInicio: ANO_INICIO,
        now: hoje,
        force,
        getLog: ano => getColetaLog('folha', ano, null),
      });
    this.progress?.save('payroll-years', anos);
    for (const ano of anos) {
      const step = `payroll-year-complete:${ano}`;
      if (this.progress?.load(step)) {
        continue;
      }
      try {
        logger.info('folha: coletando exercício', { ano });
        const stats = await coletarFolhaExercicioViaThread(ano, { progress: this.progress });
        const complete = () => {
          resultado.itens_novos += stats.novos;
          resultado.itens_atualizados += stats.atualizados;
          resultado.itens_sem_alteracao =
            (resultado.itens_sem_alteracao || 0) + (stats.semAlteracao || 0);

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
          resultado.detalhes.push({
            tipo: 'folha',
            ano,
            registros: stats.registros,
            novos: stats.novos,
            atualizados: stats.atualizados,
            sem_alteracao: stats.semAlteracao || 0,
          });
          this.completeItem(step, resultado);
        };
        if (this.progress) {
          this.progress.commit(complete);
        } else {
          complete();
        }
      } catch (err) {
        if (err.code === 'PIPELINE_YIELD') {
          throw err;
        }
        if ([401, 403].includes(Number(err?.response?.status))) {
          throw new Error(
            `Portal da Transparencia (folha) bloqueou a coleta: HTTP ${err.response.status}`
          );
        }
        logger.warn('folha: erro ao coletar exercício', { ano, erro: err.message });
        upsertColetaLog({
          tipo: 'folha',
          exercicio: ano,
          mes: null,
          registros: 0,
          novos: 0,
          atualizados: 0,
          status: 'erro',
          erro: err.message,
        });
        this.registrarErroItem(resultado, { tipo: 'folha', ano }, err);
      }
    }

    logger.info('folha: coleta concluída', {
      totalNovos: resultado.itens_novos,
      totalAtualizados: resultado.itens_atualizados,
    });
  }
}

module.exports = ColetorFolha;
