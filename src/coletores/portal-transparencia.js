'use strict';

/**
 * Coletor: Portal da Transparência da Prefeitura de Ritápolis
 * Sistema SH3 Informática — https://pt.ritapolis.mg.gov.br
 *
 * API pública e documentada em /api/relatorios/manual_relatorios.
 * Coleta despesas (empenhos, liquidações, pagamentos) mês a mês.
 * Não requer autenticação.
 */

const ColetorBase = require('./base');
const logger = require('../logger');
const config = require('../config');
const {
  upsertReceita,
  crosswalkDespesasDocumentos,
  enriquecerDetalhesComEmpenhos,
  upsertColetaLog,
  getColetaLog,
} = require('../db/transparencia-repo');
const { coletarDespesasJanelaViaThread } = require('./portal-transparencia-thread-http');
const { planCollectionYears } = require('../coletas/collection-cadence');
const { checkpointInput, processRows } = require('./financial-resume');

const BASE_URL = 'https://pt.ritapolis.mg.gov.br';

// Primeiro exercício coletado (inclusivo) — configurável via
// TRANSPARENCIA_ANO_INICIO; API SH3 tem dados desde 2019.
const ANO_INICIO = config.transparenciaAnoInicio;

class ColetorPortalTransparencia extends ColetorBase {
  constructor() {
    // Timeout maior: respostas da API chegam a 1-2MB por mês
    super({ fonte: 'portal_transparencia' });
    this.http.defaults.timeout = 90000;
  }

  async fetchJson(path, params = {}) {
    const searchParams = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
    ).toString();
    const url = `${BASE_URL}${path}${searchParams ? `?${searchParams}` : ''}`;

    const response = await this.buscarComRetry(url, {
      responseType: 'text',
      headers: {
        accept: 'application/json',
        referer: `${BASE_URL}/Tempo_Real_Despesa`,
      },
    });

    const text = typeof response.data === 'string' ? response.data : String(response.data || '');
    if (!text) {
      return null;
    }

    try {
      const parsed = JSON.parse(text);
      if (parsed.erros && parsed.erros.length > 0) {
        const msg = parsed.erros.map(e => e.titulo).join('; ');
        throw new Error(`API error: ${msg}`);
      }
      return parsed.resultado || null;
    } catch (err) {
      if (err.message.startsWith('API error:')) {
        throw err;
      }
      throw new Error(`JSON inválido: ${err.message}`);
    }
  }

  /**
   * Retorna todas as janelas semanais (segunda a domingo) de um intervalo de datas.
   * A API retorna timeout em janelas mensais — janelas de 7 dias são seguras (4-30s cada).
   */
  gerarJanelas(dataInicio, dataFim) {
    const janelas = [];
    const cursor = new Date(dataInicio);
    cursor.setUTCHours(0, 0, 0, 0);
    const fim = new Date(dataFim);
    fim.setUTCHours(23, 59, 59, 999);

    while (cursor <= fim) {
      const ini = cursor.toISOString().slice(0, 10);
      const fimSemana = new Date(cursor);
      fimSemana.setUTCDate(fimSemana.getUTCDate() + 6);
      if (fimSemana > fim) {
        fimSemana.setTime(fim.getTime());
      }
      janelas.push({ ini, fim: fimSemana.toISOString().slice(0, 10) });
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
    return janelas;
  }

  /**
   * Coleta despesas de uma janela de datas.
   *
   * Usa o fluxo "thread" (sessão + geração assíncrona + CSV), não o
   * endpoint JSON /api/relatorios/despesa — esse quebrou no lado do
   * portal (SH3) em algo entre 30/07/2026 e 28/08/2026, devolve HTML pra
   * qualquer requisição válida. Ver
   * memory reference_portal_transparencia_fluxo_thread para o fluxo
   * completo mapeado e validado com dado real.
   *
   * @returns {{ novos, atualizados, registros }}
   */
  async coletarDespesasJanela(exercicio, dataInicial, dataFinal) {
    return coletarDespesasJanelaViaThread(exercicio, dataInicial, dataFinal, {
      progress: this.progress,
    });
  }

  /**
   * Coleta orçamento anual de receita de um exercício.
   * Endpoint: GET /api/relatorios/orcamento_anual_de_receita?exercicio={ano}
   * @returns {{ novos, atualizados, registros }}
   */
  async coletarReceitas(exercicio) {
    const key = `revenue:${exercicio}`;
    const itens = await checkpointInput(this.progress, key, async () => {
      const resultado = await this.fetchJson('/api/relatorios/orcamento_anual_de_receita', {
        exercicio,
      });
      return resultado?.orcamentoAnualDeReceita || [];
    });
    return processRows(
      this.progress,
      key,
      itens,
      async item => item,
      item => upsertReceita(exercicio, item)
    );
  }

  async executar(resultado, { force = false } = {}) {
    const hoje = new Date();

    let totalNovos = 0;
    let totalAtualizados = 0;
    let totalRegistros = 0;

    const planned = this.progress?.load('financial-years') || {
      through: hoje.toISOString().slice(0, 10),
      despesas: planCollectionYears({
        anoInicio: ANO_INICIO,
        now: hoje,
        force,
        getLog: ano => getColetaLog('despesas', ano, null),
      }),
      receitas: planCollectionYears({
        anoInicio: ANO_INICIO,
        now: hoje,
        force,
        getLog: ano => getColetaLog('receitas', ano, null),
      }),
    };
    this.progress?.save('financial-years', planned);
    const anosDespesas = planned.despesas;
    for (const ano of anosDespesas) {
      const dataInicio = `${ano}-01-01`;
      const dataFim =
        ano === Number(planned.through.slice(0, 4)) ? planned.through : `${ano}-12-31`;

      const janelas = this.gerarJanelas(dataInicio, dataFim);
      let anoNovos = 0;
      let anoAtualizados = 0;
      let anoSemAlteracao = 0;
      let anoRegistros = 0;
      let anoErros = 0;

      for (const janela of janelas) {
        try {
          logger.info('portal-transparencia: coletando despesas', { ano, janela });
          const step = `expense-window-accounted:${ano}:${janela.ini}:${janela.fim}`;
          let stats = this.progress?.load(step);
          if (!stats) {
            stats = await this.coletarDespesasJanela(ano, janela.ini, janela.fim);
            const complete = () => {
              resultado.itens_novos += stats.novos;
              resultado.itens_atualizados += stats.atualizados;
              resultado.itens_sem_alteracao =
                (resultado.itens_sem_alteracao || 0) + (stats.semAlteracao || 0);
              this.progress?.save(step, stats);
              this.progress?.save('collector-result', resultado);
            };
            if (this.progress) {
              this.progress.commit(complete);
            } else {
              complete();
            }
          }
          anoNovos += stats.novos;
          anoAtualizados += stats.atualizados;
          anoSemAlteracao += stats.semAlteracao || 0;
          anoRegistros += stats.registros;
        } catch (err) {
          if (err.code === 'PIPELINE_YIELD') {
            throw err;
          }
          if ([401, 403].includes(Number(err?.response?.status))) {
            throw new Error(
              `Portal da Transparencia bloqueou a coleta: HTTP ${err.response.status}`
            );
          }
          anoErros++;
          logger.warn('portal-transparencia: erro na janela', {
            ano,
            janela,
            erro: err.message,
          });
          this.registrarErroItem(resultado, { tipo: 'despesas', ano, ...janela }, err);
        }
      }

      totalNovos += anoNovos;
      totalAtualizados += anoAtualizados;
      totalRegistros += anoRegistros;

      const logStep = `expense-year-logged:${ano}`;
      if (!this.progress?.load(logStep)) {
        upsertColetaLog({
          tipo: 'despesas',
          exercicio: ano,
          mes: null,
          registros: anoRegistros,
          novos: anoNovos,
          atualizados: anoAtualizados,
          status: anoErros > 0 ? 'erro_parcial' : 'ok',
          erro: anoErros > 0 ? `${anoErros} janelas com erro` : null,
        });

        resultado.detalhes.push({
          tipo: 'despesas',
          ano,
          registros: anoRegistros,
          novos: anoNovos,
          atualizados: anoAtualizados,
          sem_alteracao: anoSemAlteracao,
        });
        if (!anoErros) {
          this.completeItem(logStep, resultado);
        }
      }
    }

    // Receitas: orçamento anual previsto
    logger.info('portal-transparencia: coletando orçamento de receitas');
    const anosReceitas = planned.receitas;
    for (const ano of anosReceitas) {
      const step = `revenue-year-accounted:${ano}`;
      if (this.progress?.load(step)) {
        continue;
      }
      try {
        const stats = await this.coletarReceitas(ano);
        const complete = () => {
          upsertColetaLog({
            tipo: 'receitas',
            exercicio: ano,
            mes: null,
            registros: stats.registros,
            novos: stats.novos,
            atualizados: stats.atualizados,
            status: 'ok',
            erro: null,
          });
          resultado.detalhes.push({
            tipo: 'receitas',
            ano,
            registros: stats.registros,
            novos: stats.novos,
            atualizados: stats.atualizados,
            sem_alteracao: stats.semAlteracao || 0,
          });
          resultado.itens_novos += stats.novos;
          resultado.itens_atualizados += stats.atualizados;
          resultado.itens_sem_alteracao =
            (resultado.itens_sem_alteracao || 0) + (stats.semAlteracao || 0);
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
        this.registrarErroItem(resultado, { tipo: 'receitas', ano }, err);
        logger.warn('portal-transparencia: erro ao coletar receitas', { ano, erro: err.message });
        upsertColetaLog({
          tipo: 'receitas',
          exercicio: ano,
          mes: null,
          registros: 0,
          novos: 0,
          atualizados: 0,
          status: 'erro',
          erro: err.message,
        });
      }
    }

    // Crosswalk: linkar despesas com documentos do acervo
    logger.info('portal-transparencia: executando crosswalk despesas→documentos');
    try {
      const vinculados = crosswalkDespesasDocumentos();
      if (vinculados > 0) {
        logger.info('portal-transparencia: crosswalk concluído', { vinculados });
        resultado.detalhes.push({ etapa: 'crosswalk', vinculados });
      }
    } catch (err) {
      logger.warn('portal-transparencia: erro no crosswalk', { erro: err.message });
    }

    // Enriquecer licitacoes_detalhes com dados reais de empenho
    logger.info('portal-transparencia: enriquecendo licitacoes_detalhes');
    try {
      const enriquecidos = enriquecerDetalhesComEmpenhos();
      if (enriquecidos > 0) {
        logger.info('portal-transparencia: enriquecimento concluído', { enriquecidos });
        resultado.detalhes.push({ etapa: 'enriquecimento', enriquecidos });
      }
    } catch (err) {
      logger.warn('portal-transparencia: erro no enriquecimento', { erro: err.message });
    }

    logger.info('portal-transparencia: coleta concluída', {
      totalRegistros,
      totalNovos,
      totalAtualizados,
    });
  }
}

module.exports = ColetorPortalTransparencia;
