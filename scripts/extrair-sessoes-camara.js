'use strict';

// Sessões da Câmara a partir das atas (presença e votações).
//
//   node scripts/extrair-sessoes-camara.js              extrai as atas pendentes (IA)
//   node scripts/extrair-sessoes-camara.js --limite 10  só as 10 primeiras pendentes
//   node scripts/extrair-sessoes-camara.js --forcar     reextrai todas
//   node scripts/extrair-sessoes-camara.js --revalidar  confere de novo o que está gravado, sem IA
//
// Pendente = ata nunca extraída, com texto novo (outro OCR) ou de versão antiga do extrator.

const logger = require('../src/logger');

function argumento(nome) {
  const i = process.argv.indexOf(nome);
  return i === -1 ? null : process.argv[i + 1];
}

async function main() {
  require('../src/db/setup').setupDatabase();
  const servico = require('../src/services/sessoes-camara-service');

  if (process.argv.includes('--revalidar')) {
    logger.info('sessoes revalidadas', servico.revalidarSessoes());
    return;
  }
  const limite = Number(argumento('--limite')) || Infinity;
  const forcar = process.argv.includes('--forcar');
  logger.info('extracao de sessoes concluida', await servico.extrairSessoesPendentes({ limite, forcar }));
}

main().catch((error) => {
  logger.error('extrair-sessoes-camara falhou', { erro: error.message });
  process.exit(1);
});
