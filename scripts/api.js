const { restoreDatabaseFromR2IfMissing, startBackupScheduler } = require('../src/storage/r2-database-backup');

async function main() {
  await restoreDatabaseFromR2IfMissing();
  // Importa módulos que abrem o SQLite somente depois da restauração.
  const { setupDatabase } = require('../src/db/setup');
  // setupDatabase() PRECISA rodar antes de qualquer require que toque em
  // repositórios -- vários (ex.: camara-repo.js) preparam statements contra
  // tabelas no topo do módulo (fora de função), e isso já executa no
  // `require`. Achado real em produção 09/09/2026: server.js sendo
  // requerido antes de setupDatabase() derrubou a API em crash-loop assim
  // que uma tabela nova (camara_vereadores) apareceu no schema.sql.
  setupDatabase();

  const { startServer } = require('../src/api/server');
  const collectionScheduler = require('../src/coletas/collection-scheduler');
  const aiScheduler = require('../src/ai/ai-daily-scheduler');
  const dailyScheduler = require('../src/coletas/daily-scheduler');
  const descobertasScheduler = require('../src/inteligencia/descobertas-scheduler');
  const logger = require('../src/logger');
  const {
    crosswalkDespesasDocumentos,
    enriquecerDetalhesComEmpenhos,
  } = require('../src/db/transparencia-repo');

  try {
    const vinculados = crosswalkDespesasDocumentos();
    const enriquecidos = vinculados > 0 ? enriquecerDetalhesComEmpenhos() : 0;
    if (vinculados > 0) {
      logger.info('reconciliacao de vinculos despesas-documentos concluida', {
        vinculados,
        enriquecidos,
      });
    }
  } catch (error) {
    logger.error('falha na reconciliacao de vinculos despesas-documentos', { erro: error.message });
  }
  const server = await startServer();
  collectionScheduler.start();
  aiScheduler.start();
  dailyScheduler.start();
  descobertasScheduler.start();
  startBackupScheduler();

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) { return; }
    shuttingDown = true;
    console.info(`Encerramento gracioso iniciado (${signal})`);

    const forceExit = setTimeout(() => {
      console.error('Encerramento gracioso excedeu o limite');
      process.exit(1);
    }, 110_000);
    forceExit.unref?.();

    server.close((error) => {
      clearTimeout(forceExit);
      if (error) {
        console.error('Falha ao encerrar servidor:', error.message);
        process.exit(1);
      }
      process.exit(0);
    });
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('Falha ao iniciar API:', error.message);
  process.exit(1);
});
