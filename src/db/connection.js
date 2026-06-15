'use strict';

/**
 * Singleton da conexão SQLite.
 * Todos os repos importam daqui para evitar múltiplas conexões e deps circulares.
 */

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const config = require('../config');

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
// Espera por locks em vez de estourar imediatamente — permite que processos
// concorrentes (API + schedulers + scripts de lote) escrevam sem derrubar uns
// aos outros com SQLITE_BUSY.
db.exec('PRAGMA busy_timeout = 15000;');

module.exports = { db };
