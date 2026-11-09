'use strict';

/**
 * Preenche licitacao_ref e modalidade dos empenhos originais já coletados, lendo a página
 * pública de detalhe pelo proxy de coleta. Grava só esses dois campos, só onde estão vazios.
 *
 * Uso:
 *   node scripts/backfill-licitacao-modalidade.js --ano-min 2025 --limite 50            # dry-run
 *   node scripts/backfill-licitacao-modalidade.js --ano-min 2025 --limite 50 --apply    # grava
 *   Opções: --cnpj <CNPJ> restringe a um credor; --atraso-ms <n> (padrão 700).
 *   --itens: em vez de licitação/modalidade, grava os itens da nota fiscal dos empenhos que já
 *   têm modalidade (rode depois do backfill de modalidade).
 */

process.loadEnvFile?.() || require('dotenv').config();

const axios = require('axios');
const { setupDatabase } = require('../src/db/setup');
const repo = require('../src/db/backfill-detalhe-repo');
const { proxyCollectorRequest } = require('../src/http/collector-proxy');
const { buildPortalDespesaLink } = require('../src/transparencia/portal-links');
const itensRepo = require('../src/db/despesa-itens-repo');
const {
  backfillLicitacaoModalidade,
  backfillItens,
} = require('../src/transparencia/backfill-licitacao-modalidade');

const TIMEOUT_MS = 60000;
const argumento = nome => {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function buscarHtml({ empenho, exercicio_orcamento: exercicio, tipo }) {
  const url = buildPortalDespesaLink({ empenho, exercicio, tipo }).url;
  const req = proxyCollectorRequest({
    method: 'get',
    url,
    options: { timeout: TIMEOUT_MS, responseType: 'arraybuffer', validateStatus: () => true },
  });
  const r = await axios({ method: req.method, url: req.url, data: req.data, ...req.options });
  if (r.status !== 200) {
    throw new Error(`HTTP ${r.status}`);
  }
  return Buffer.from(r.data).toString('latin1');
}

async function main() {
  setupDatabase();
  const apply = process.argv.includes('--apply');
  if (process.argv.includes('--itens')) {
    const r = await backfillItens({
      repo: itensRepo,
      buscarHtml,
      apply,
      anoMin: Number(argumento('--ano-min')) || 0,
      limite: Number(argumento('--limite')) || undefined,
      delayMs: argumento('--atraso-ms') ? Number(argumento('--atraso-ms')) : undefined,
    });
    console.warn(`${apply ? '' : '[dry-run] '}itens: ${JSON.stringify(r)}`);
    return;
  }
  const resultado = await backfillLicitacaoModalidade({
    repo,
    buscarHtml,
    apply,
    anoMin: Number(argumento('--ano-min')) || 0,
    cnpj: argumento('--cnpj') || null,
    limite: Number(argumento('--limite')) || undefined,
    delayMs: argumento('--atraso-ms') ? Number(argumento('--atraso-ms')) : undefined,
    aoProgredir: t => {
      if (t.lidos % 50 === 0) {
        console.warn(`... ${JSON.stringify(t)}`);
      }
    },
  });
  console.warn(`${apply ? '' : '[dry-run] '}${JSON.stringify(resultado)}`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
