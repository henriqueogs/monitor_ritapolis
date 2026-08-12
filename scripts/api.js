const { restoreDatabaseFromR2IfMissing, startBackupScheduler } = require('../src/storage/r2-database-backup');

async function main() {
  await restoreDatabaseFromR2IfMissing();
  // Importa módulos que abrem o SQLite somente depois da restauração.
  const { setupDatabase } = require('../src/db/setup');
  const { startServer } = require('../src/api/server');
  const collectionScheduler = require('../src/coletas/collection-scheduler');
  const aiScheduler = require('../src/ai/ai-daily-scheduler');
  const dailyScheduler = require('../src/coletas/daily-scheduler');
  const descobertasScheduler = require('../src/inteligencia/descobertas-scheduler');

  setupDatabase();
  await startServer();
    collectionScheduler.start();
    aiScheduler.start();
    dailyScheduler.start();
    descobertasScheduler.start();
    startBackupScheduler();
}

main().catch((error) => {
    console.error('Falha ao iniciar API:', error.message);
    process.exit(1);
});
