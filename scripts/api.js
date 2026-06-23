const { setupDatabase } = require('../src/db/setup');
const { startServer } = require('../src/api/server');
const collectionScheduler = require('../src/coletas/collection-scheduler');
const aiScheduler = require('../src/ai/ai-daily-scheduler');
const dailyScheduler = require('../src/coletas/daily-scheduler');

setupDatabase();

startServer()
  .then(() => {
    collectionScheduler.start();
    aiScheduler.start();
    dailyScheduler.start();
  })
  .catch((error) => {
    console.error('Falha ao iniciar API:', error.message);
    process.exit(1);
  });
