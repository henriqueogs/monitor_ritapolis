const fs = require('fs');
const path = require('path');
const config = require('../config');
const { db } = require('./index');

function setupDatabase() {
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  fs.mkdirSync(config.logDir, { recursive: true });

  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schemaSql);
}

module.exports = {
  setupDatabase
};
