const { setupDatabase } = require('../src/db/setup');
const { startServer } = require('../src/api/server');

setupDatabase();
startServer();
