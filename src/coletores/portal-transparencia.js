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
    cursor.setHours(0, 0, 0, 0);
    const fim = new Date(dataFim);
    fim.setHours(23, 59, 59, 999);

    while (cursor <= fim) {
      const ini = cursor.toISOString().slice(0, 10);
      const fimSemana = new Date(cursor);
      fimSemana.setDate(fimSemana.getDate() + 6);
      if (fimSemana > fim) {
        fimSemana.setTime(fim.getTime());
      }
      janelas.push({ ini, fim: fimSemana.toISOString().slice(0, 10) });
      cursor.setDate(cursor.getDate() + 7);
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
    return coletarDespesasJanelaViaThread(exercicio, dataInicial, dataFinal);
  }

  /**
   * Coleta orçamento anual de receita de um exercício.
   * Endpoint: GET /api/relatorios/orcamento_anual_de_receita?exercicio={ano}
   * @returns {{ novos, atualizados, registros }}
   */
  async coletarReceitas(exercicio) {
    const resultado = await this.fetchJson('/api/relatorios/orcamento_anual_de_receita', {
      exercicio,
    });

    if (!resultado) {
      return { novos: 0, atualizados: 0, registros: 0 };
    }

    const itens = resultado.orcamentoAnualDeReceita || [];
    let novos = 0;
    let atualizados = 0;

    for (const item of itens) {
      try {
        const action = upsertReceita(exercicio, item);
        if (action === 'inserted') {
          novos++;
        } else if (action === 'updated') {
          atualizados++;
        }
      } catch (err) {
        logger.warn('portal-transparencia: erro ao salvar receita', {
          exercicio,
          codigo: item?.codigoDaReceita,
          erro: err.message,
        });
      }
    }

    return { novos, atualizados, registros: itens.length };
  }

  async executar(resultado) {
    const hoje = new Date();
    const anoAtual = hoje.getFullYear();

    let totalNovos = 0;
    let totalAtualizados = 0;
    let totalRegistros = 0;

    for (let ano = ANO_INICIO; ano <= anoAtual; ano++) {
      // Verificar se este ano já foi coletado hoje (com sucesso) — pular meses completos
      const logAno = getColetaLog('despesas', ano, null);
      const hojeStr = hoje.toISOString().slice(0, 10);
      if (logAno && logAno.coletado_em.startsWith(hojeStr) && logAno.status === 'ok') {
        logger.debug('portal-transparencia: ano já coletado hoje, pulando', { ano });
        continue;
      }

      const dataInicio = `${ano}-01-01`;
      const dataFim = ano === anoAtual ? hoje.toISOString().slice(0, 10) : `${ano}-12-31`;

      const janelas = this.gerarJanelas(dataInicio, dataFim);
      let anoNovos = 0;
      let anoAtualizados = 0;
      let anoRegistros = 0;
      let anoErros = 0;

      for (const janela of janelas) {
        try {
          logger.info('portal-transparencia: coletando despesas', { ano, janela });
          const stats = await this.coletarDespesasJanela(ano, janela.ini, janela.fim);
          anoNovos += stats.novos;
          anoAtualizados += stats.atualizados;
          anoRegistros += stats.registros;
        } catch (err) {
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

      resultado.detalhes.push({ tipo: 'despesas', ano, registros: anoRegistros, novos: anoNovos });
    }

    resultado.itens_novos += totalNovos;
    resultado.itens_atualizados += totalAtualizados;

    // Receitas: orçamento anual previsto
    logger.info('portal-transparencia: coletando orçamento de receitas');
    for (let ano = ANO_INICIO; ano <= anoAtual; ano++) {
      const logReceita = getColetaLog('receitas', ano, null);
      const hojeStr = hoje.toISOString().slice(0, 10);
      if (logReceita && logReceita.coletado_em.startsWith(hojeStr) && logReceita.status === 'ok') {
        logger.debug('portal-transparencia: receitas já coletadas hoje, pulando', { ano });
        continue;
      }
      try {
        const stats = await this.coletarReceitas(ano);
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
        });
        resultado.itens_novos += stats.novos;
        resultado.itens_atualizados += stats.atualizados;
      } catch (err) {
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
