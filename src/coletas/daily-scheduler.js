'use strict';

/**
 * Scheduler diário de transparência — Monitor Ritápolis.
 *
 * Complementa o collection-scheduler (documentos) e o ai-daily-scheduler (resumos).
 * Responsabilidades:
 *   • Despesas + Receitas: coleta incremental diária (02:00-03:00 local)
 *   • PNCP sync: sincronização semanal de vencedores/valores finais
 *   • Fornecedores: consolidação após cada coleta bem-sucedida
 *
 * Não duplica lógica — apenas chama as funções já existentes nos coletores.
 */

const logger = require('../logger');
const config = require('../config');
const { db } = require('../db');
const { consolidarFornecedores } = require('../db');
const { backfillClassificacoesDespesas } = require('../db/transparencia-repo');
const { enriquecerCredores } = require('../integracoes/enriquecer-credores');

// Máximo de empenhos reclassificados por tick quando a versão da classificação
// de finalidade muda. Empenhos novos já são classificados no insert; isto só
// dilui o reprocessamento do acervo antigo em lotes, evitando um passe pesado.
const LIMITE_RECLASSIFICACAO_TICK = 2000;

// Máximo de CNPJs enriquecidos por tick. Bounded para não sobrecarregar a
// BrasilAPI; quando o cache está fresco, a seleção volta vazia e sai barato.
const LIMITE_ENRIQUECIMENTO_TICK = 50;

// ── Controle de estado ────────────────────────────────────────────────────────

let timerDiario = null;
let timerPncp = null;
let rodandoTransparencia = false;
let rodandoPncp = false;

// ── Helpers de agendamento ────────────────────────────────────────────────────

/**
 * Retorna true se a última execução de um tipo foi há mais de `minHoras` horas.
 */
function isDue(tipo, minHoras) {
  const row = db
    .prepare(
      "SELECT MAX(coletado_em) AS last FROM transparencia_coletas_log WHERE tipo = ? AND status = 'ok'"
    )
    .get(tipo);
  if (!row?.last) {return true;}
  const elapsedMs = Date.now() - new Date(row.last).getTime();
  return elapsedMs >= minHoras * 60 * 60 * 1000;
}

/**
 * 'despesas' loga UMA linha por exercício (não uma por ciclo, como 'pncp') —
 * isDue() com MAX(coletado_em) global tratava "um ano qualquer OK recente"
 * como "tudo em dia", travando a re-tentativa dos outros anos ainda com erro
 * por até `minHoras`. Aqui exige que TODOS os anos de config.transparenciaAnoInicio
 * até o atual tenham 'ok' dentro da janela — qualquer um faltando, ainda é due.
 */
function despesasEmDia(minHoras) {
  const anoAtual = new Date().getFullYear();
  const cutoffMs = Date.now() - minHoras * 60 * 60 * 1000;
  const rows = db
    .prepare(
      `SELECT exercicio, MAX(coletado_em) AS last
         FROM transparencia_coletas_log
        WHERE tipo = 'despesas' AND status = 'ok'
        GROUP BY exercicio`
    )
    .all();
  const okPorAno = new Map(rows.map((r) => [r.exercicio, new Date(r.last).getTime()]));
  for (let ano = config.transparenciaAnoInicio; ano <= anoAtual; ano += 1) {
    const ts = okPorAno.get(ano);
    if (!ts || ts < cutoffMs) {return false;}
  }
  return true;
}

// ── Coleta de transparência (despesas + receitas) ─────────────────────────────

async function coletarTransparencia() {
  if (rodandoTransparencia) {
    logger.debug('daily-scheduler: transparência já em andamento, ignorando tick');
    return;
  }
  if (despesasEmDia(config.dailySchedulerTransparenciaIntervalHoras)) {
    logger.debug('daily-scheduler: transparência dentro do intervalo (todos os anos em dia)');
    return;
  }

  rodandoTransparencia = true;
  logger.info('daily-scheduler: iniciando coleta de transparência (despesas + receitas)');

  try {
    // Importação dinâmica para evitar ciclo no momento da injeção
    const ColetorPortalTransparencia = require('../coletores/portal-transparencia');
    const coletor = new ColetorPortalTransparencia();
    const resultado = {
      fonte: 'portal_transparencia',
      status: 'processando',
      itens_novos: 0,
      itens_atualizados: 0,
      itens_com_erro: 0,
      detalhes: []
    };
    await coletor.executar(resultado);

    logger.info('daily-scheduler: transparência concluída', resultado);

    // Consolidar fornecedores após coleta de dados financeiros
    try {
      const r = consolidarFornecedores();
      logger.info('daily-scheduler: fornecedores consolidados', { salvos: r.salvos });
    } catch (err) {
      logger.warn('daily-scheduler: erro ao consolidar fornecedores', { erro: err.message });
    }
  } catch (err) {
    logger.error('daily-scheduler: erro na coleta de transparência', { erro: err.message });
  } finally {
    rodandoTransparencia = false;
  }
}

// ── Sync PNCP ────────────────────────────────────────────────────────────────

async function sincronizarPncp() {
  if (rodandoPncp) {
    logger.debug('daily-scheduler: PNCP sync já em andamento');
    return;
  }
  // PNCP: semanal (168h)
  if (!isDue('pncp', config.dailySchedulerPncpIntervalHoras)) {
    logger.debug('daily-scheduler: PNCP dentro do intervalo semanal');
    return;
  }

  rodandoPncp = true;
  logger.info('daily-scheduler: iniciando PNCP sync');

  try {
    const { gerarContratacoesPorCnpj, extrairVencedor } = require('../integracoes/pncp-orgaos');
    const { getDocumentoByNumeroPncp, updateLicitacaoVencedor } = require('../db');
    const anoAtual = new Date().getFullYear();
    const anos = [anoAtual - 1, anoAtual];
    const cnpjs = [config.cnpjPrefeitura, config.cnpjCamara];

    let atualizados = 0;
    for (const cnpj of cnpjs) {
      for (const ano of anos) {
        const dataInicial = `${ano}0101`;
        const dataFinal = `${ano}1231`;
        try {
          for await (const contratacao of gerarContratacoesPorCnpj({
            cnpj,
            codigoMunicipioIbge: config.ibgeCode,
            dataInicial,
            dataFinal,
          })) {
            const doc = getDocumentoByNumeroPncp(contratacao.numeroPncp);
            if (!doc) {continue;}
            const vencedor = extrairVencedor(contratacao);
            if (!vencedor?.nome) {continue;}
            updateLicitacaoVencedor(doc.id, vencedor);
            atualizados++;
          }
        } catch (err) {
          logger.warn('daily-scheduler: erro PNCP parcial', { cnpj, ano, erro: err.message });
        }
      }
    }

    logger.info('daily-scheduler: PNCP sync concluído', { atualizados });

    // Registrar como coleta bem-sucedida para controle de intervalo
    db.prepare(
      "INSERT INTO transparencia_coletas_log (tipo, exercicio, status, novos, atualizados) VALUES ('pncp', ?, 'ok', 0, ?)"
    ).run(anoAtual, atualizados);
  } catch (err) {
    logger.error('daily-scheduler: erro no PNCP sync', { erro: err.message });
  } finally {
    rodandoPncp = false;
  }
}

// ── Reprocessamento de classificação de finalidade ────────────────────────────

/**
 * Reclassifica em lote os empenhos com versão de finalidade defasada. Quando
 * nenhuma versão está defasada, não seleciona nada e sai barato.
 */
function reprocessarFinalidades() {
  try {
    const r = backfillClassificacoesDespesas({ limite: LIMITE_RECLASSIFICACAO_TICK });
    if (r.atualizadas > 0) {
      logger.info('daily-scheduler: finalidades reclassificadas', {
        atualizadas: r.atualizadas,
        pendentes: r.pendentes,
        versao: r.versao,
      });
    }
  } catch (err) {
    logger.warn('daily-scheduler: erro ao reclassificar finalidades', { erro: err.message });
  }
}

// ── Enriquecimento cadastral de credores ──────────────────────────────────────

/**
 * Enriquece em lote os CNPJs de credores sem cadastro fresco (fonte Receita).
 * Bounded por tick; quando nada está defasado, não consulta nada.
 */
async function enriquecerCredoresTick() {
  try {
    const r = await enriquecerCredores({ limite: LIMITE_ENRIQUECIMENTO_TICK });
    if (r.enriquecidos > 0 || r.erros > 0) {
      logger.info('daily-scheduler: credores enriquecidos', r);
    }
  } catch (err) {
    logger.warn('daily-scheduler: erro ao enriquecer credores', { erro: err.message });
  }
}

// ── Tick ─────────────────────────────────────────────────────────────────────

async function tick() {
  await coletarTransparencia();
  reprocessarFinalidades();
  await enriquecerCredoresTick();
  await sincronizarPncp();
}

// ── Interface pública ─────────────────────────────────────────────────────────

function start() {
  if (!config.dailySchedulerEnabled) {
    logger.info('daily-scheduler: desabilitado (DAILY_SCHEDULER_ENABLED=false)');
    return;
  }
  if (timerDiario) {return;}

  logger.info('daily-scheduler: iniciado', {
    transparencia_intervalo_h: config.dailySchedulerTransparenciaIntervalHoras,
    pncp_intervalo_h: config.dailySchedulerPncpIntervalHoras,
    check_intervalo_min: Math.round(config.dailySchedulerCheckMs / 60000),
  });

  // Primeiro tick com delay de 60s para a API subir completamente
  setTimeout(() => tick().catch((e) => logger.error('daily-scheduler: tick erro', { erro: e.message })), 60_000);

  // Verificação periódica (padrão: a cada 30 min)
  timerDiario = setInterval(
    () => tick().catch((e) => logger.error('daily-scheduler: tick erro', { erro: e.message })),
    config.dailySchedulerCheckMs
  );
  timerDiario.unref?.();
}

function stop() {
  if (timerDiario) { clearInterval(timerDiario); timerDiario = null; }
  if (timerPncp) { clearInterval(timerPncp); timerPncp = null; }
}

function getStatus() {
  const isDueTransp = isDue('despesas', config.dailySchedulerTransparenciaIntervalHoras);
  const isDuePncp = isDue('pncp', config.dailySchedulerPncpIntervalHoras);

  const lastTransp = db.prepare("SELECT MAX(coletado_em) last FROM transparencia_coletas_log WHERE tipo='despesas' AND status='ok'").get();
  const lastPncp = db.prepare("SELECT MAX(coletado_em) last FROM transparencia_coletas_log WHERE tipo='pncp' AND status='ok'").get();

  return {
    enabled: config.dailySchedulerEnabled,
    rodando_transparencia: rodandoTransparencia,
    rodando_pncp: rodandoPncp,
    proxima_transparencia_due: isDueTransp,
    proxima_pncp_due: isDuePncp,
    ultima_transparencia: lastTransp?.last || null,
    ultima_pncp: lastPncp?.last || null,
  };
}

module.exports = { start, stop, getStatus };
