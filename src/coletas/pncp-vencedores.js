'use strict';

// Sincronização de vencedores e valores homologados do PNCP para os documentos
// locais (licitacoes_detalhes). Orquestra: consulta de contratações por órgão/ano
// → casa pelo número de controle PNCP → itens/resultados → regra pura de
// consolidação (src/licitacoes/pncp-resultados.js) → upsertDadosPncp.
//
// Achado 28/10/2026: a versão anterior, dentro do daily-scheduler, chamava o
// gerador com a assinatura errada, tratava lotes como contratações e chamava uma
// função de banco inexistente; registrava "ok" toda semana com 0 atualizações.

const pncpOrgaos = require('../integracoes/pncp-orgaos');
const db = require('../db');
const { parseControleCompra, consolidarResultadosCompra } = require('../licitacoes/pncp-resultados');

const DEPS_PADRAO = {
  gerarContratacoesPorCnpj: pncpOrgaos.gerarContratacoesPorCnpj,
  extrairNumeroPncp: pncpOrgaos.extrairNumeroPncp,
  buscarItensComResultados: pncpOrgaos.buscarItensComResultados,
  getDocumentoByNumeroPncp: (numero) => db.getDocumentoByNumeroPncp(numero),
  upsertDadosPncp: (id, dados) => db.upsertDadosPncp(id, dados),
};

function statsVazias() {
  return { consultadas: 0, correspondencias: 0, atualizadas: 0, sem_resultado: 0, erros: 0 };
}

async function processarCompra(numeroPncp, documento, { dryRun, deps, stats }) {
  const controle = parseControleCompra(numeroPncp);
  if (!controle) {return;}
  const consolidado = consolidarResultadosCompra(await deps.buscarItensComResultados(controle));
  if (!consolidado.vencedor_nome && consolidado.valor_final === null) {
    stats.sem_resultado += 1;
    return;
  }
  if (dryRun) {
    stats.atualizadas += 1;
    return;
  }
  const alteradas = deps.upsertDadosPncp(documento.id, {
    vencedor_nome: consolidado.vencedor_nome,
    vencedor_cnpj: consolidado.vencedor_cnpj,
    valor_final: consolidado.valor_final,
    numero_pncp: numeroPncp,
    data_resultado: consolidado.data_resultado,
  });
  if (alteradas > 0) {stats.atualizadas += 1;}
}

async function processarOrgaoAno(cnpj, ano, contexto) {
  const { deps, stats } = contexto;
  for await (const { items } of deps.gerarContratacoesPorCnpj(cnpj, ano)) {
    for (const item of items) {
      stats.consultadas += 1;
      const numeroPncp = deps.extrairNumeroPncp(item);
      const documento = numeroPncp ? deps.getDocumentoByNumeroPncp(numeroPncp) : null;
      if (!documento) {continue;}
      stats.correspondencias += 1;
      try {
        await processarCompra(numeroPncp, documento, contexto);
      } catch (err) {
        stats.erros += 1;
        contexto.falhas.push({ cnpj, ano, numeroPncp, erro: err.message });
      }
    }
  }
}

/**
 * @param {{ cnpjs: string[], anos: number[], dryRun?: boolean }} opcoes
 * @returns {Promise<{consultadas, correspondencias, atualizadas, sem_resultado, erros, falhas}>}
 */
async function sincronizarVencedoresPncp({ cnpjs, anos, dryRun = false }, deps = DEPS_PADRAO) {
  const stats = statsVazias();
  const contexto = { dryRun, deps, stats, falhas: [] };
  for (const cnpj of cnpjs) {
    for (const ano of anos) {
      try {
        await processarOrgaoAno(cnpj, ano, contexto);
      } catch (err) {
        stats.erros += 1;
        contexto.falhas.push({ cnpj, ano, erro: err.message });
      }
    }
  }
  return { ...stats, falhas: contexto.falhas };
}

const STATUS = { OK: 'ok', ERRO: 'erro' };

// 'erro' só quando nada chegou do PNCP por falha (o agendador tenta de novo no próximo
// tick); resposta vazia é 'ok' (o órgão não publicou), e falha parcial também.
function statusDaSincronizacao({ consultadas, erros }) {
  return erros > 0 && consultadas === 0 ? STATUS.ERRO : STATUS.OK;
}

module.exports = { sincronizarVencedoresPncp, statusDaSincronizacao, STATUS };
