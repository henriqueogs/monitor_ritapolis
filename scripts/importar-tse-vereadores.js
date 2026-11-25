#!/usr/bin/env node
'use strict';

/**
 * Importa vereadores eleitos e suplentes do TSE (dados abertos, resultados-<ano>) para
 * camara_candidaturas_tse. Uso: node scripts/importar-tse-vereadores.js [--ano=2024]
 * Baixa o zip nacional de votação (~50 MB) e lê só o CSV da UF do ente.
 */

require('dotenv').config();
// setupDatabase antes dos repositórios: eles preparam statements no require.
const { setupDatabase } = require('../src/db/setup');
setupDatabase();
const logger = require('../src/logger');
const { ente } = require('../src/ente');
const {
  baixarVotacaoUf,
  parsearVotacaoVereadores,
  urlDatasetResultados,
} = require('../src/integracoes/tse-votacao');
const { salvarCandidaturasTse } = require('../src/db/candidaturas-tse-repo');
const { upsertCamaraColetaLog } = require('../src/db/camara-repo');

const ANO_PADRAO = 2024;
const TIPO_LOG = 'tse_vereadores';

async function main() {
  const argAno = process.argv.find(a => a.startsWith('--ano='));
  const ano = argAno ? Number(argAno.split('=')[1]) : ANO_PADRAO;
  if (!ente.codigoTse) {
    throw new Error('codigoTse não configurado (municipio.json ou TSE_CODIGO_MUNICIPIO)');
  }
  try {
    const csv = await baixarVotacaoUf({ ano, uf: ente.uf });
    const candidaturas = parsearVotacaoVereadores(csv, { codigoMunicipio: ente.codigoTse });
    if (candidaturas.length === 0) {
      throw new Error(`nenhum vereador eleito ou suplente para SG_UE ${ente.codigoTse} em ${ano}`);
    }
    const { novos, atualizados } = salvarCandidaturasTse(candidaturas, {
      urlOrigem: urlDatasetResultados(ano),
    });
    upsertCamaraColetaLog({
      tipo: TIPO_LOG,
      exercicio: ano,
      registros: candidaturas.length,
      novos,
      atualizados,
      status: 'ok',
    });
    logger.info('TSE: vereadores importados', {
      ano,
      registros: candidaturas.length,
      novos,
      atualizados,
    });
  } catch (err) {
    upsertCamaraColetaLog({
      tipo: TIPO_LOG,
      exercicio: ano,
      registros: 0,
      status: 'erro',
      erro: err.message,
    });
    throw err;
  }
}

main().catch(err => {
  logger.error('importar-tse-vereadores falhou', { erro: err.message });
  process.exit(1);
});
