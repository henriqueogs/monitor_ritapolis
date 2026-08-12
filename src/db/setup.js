const fs = require('fs');
const path = require('path');
const config = require('../config');
const { db } = require('./connection');

function setupDatabase() {
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  fs.mkdirSync(config.logDir, { recursive: true });

  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schemaSql);

  // O índice principal aplica as migrações incrementais de runtime. Ele só
  // pode ser carregado depois que o schema base existir em discos novos.
  require('./index');
}

module.exports = {
  setupDatabase
};
