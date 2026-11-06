'use strict';

/**
 * Backfill de licitação/modalidade dos empenhos originais já coletados. Lê a página pública de
 * detalhe de cada empenho (injetada em `buscarHtml`, normalmente pelo proxy de coleta) e grava
 * só `licitacao_ref` e `modalidade`, e só onde estão vazios. Dry-run por padrão. Uma falha de
 * leitura não interrompe os demais; a página precisa ser do mesmo empenho, senão não grava.
 */

const { parseDetalhamentoDespesa } = require('../coletores/portal-transparencia-thread');

const ESPERA_PADRAO_MS = 700;

const esperar = ms => new Promise(resolve => setTimeout(resolve, ms));

async function backfillLicitacaoModalidade({
  repo,
  buscarHtml,
  anoMin = 0,
  cnpj = null,
  limite,
  apply = false,
  delayMs = ESPERA_PADRAO_MS,
  aoProgredir = () => {},
}) {
  const alvos = repo.listarSemModalidade({ anoMin, cnpj, ...(limite ? { limite } : {}) });
  const total = { lidos: 0, encontrados: 0, gravados: 0, semDado: 0, falhas: 0, apply };
  for (const alvo of alvos) {
    total.lidos += 1;
    try {
      const detalhe = parseDetalhamentoDespesa(await buscarHtml(alvo));
      if (
        !detalhe ||
        detalhe.empenho !== alvo.empenho ||
        (!detalhe.licitacao && !detalhe.modalidade)
      ) {
        total.semDado += 1;
      } else {
        total.encontrados += 1;
        if (
          apply &&
          repo.gravarLicitacaoModalidade(alvo.id, detalhe.licitacao, detalhe.modalidade)
        ) {
          total.gravados += 1;
        }
      }
    } catch {
      total.falhas += 1;
    }
    aoProgredir(total);
    if (delayMs) {await esperar(delayMs);}
  }
  return total;
}

module.exports = { backfillLicitacaoModalidade };
