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
// Cache de pagina/mmap default do SQLite (2 MB) forcava releitura de disco a
// cada agregado pesado -- medido 5-10s frio na VM (1 GB) vs <1s com isto.
db.exec(`PRAGMA cache_size = -${config.sqliteCacheKb};`);
db.exec(`PRAGMA mmap_size = ${config.sqliteMmapBytes};`);
db.exec('PRAGMA temp_store = MEMORY;');

module.exports = { db };
