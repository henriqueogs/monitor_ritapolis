const { setupDatabase } = require('../src/db/setup');
const { startServer } = require('../src/api/server');

setupDatabase();
startServer().catch((error) => {
  console.error('Falha ao iniciar API:', error.message);
  process.exit(1);
});
