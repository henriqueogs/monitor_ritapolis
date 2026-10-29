'use strict';

/**
 * Troca por NULL a string "undefined" gravada antes do conserto de cleanField
 * (unidade, lote, CNPJ/nome do fornecedor, trecho e prefixo de origem_detalhe).
 *
 *   node scripts/limpar-undefined.js           # dry-run: só conta
 *   node scripts/limpar-undefined.js --apply
 */

process.loadEnvFile?.() || require('dotenv').config();

const { setupDatabase } = require('../src/db/setup');
const { db } = require('../src/db');
const { limparTextoUndefined } = require('../src/db/limpeza-undefined');
const logger = require('../src/logger');

setupDatabase();
const apply = process.argv.includes('--apply');
const resumo = limparTextoUndefined(db, { apply });
logger.info(`limpar-undefined ${apply ? 'APLICADO' : 'dry-run'}: ${JSON.stringify(resumo)}`);
