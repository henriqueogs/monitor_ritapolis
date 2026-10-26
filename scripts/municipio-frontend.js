'use strict';

// Gera frontend/lib/municipios.json a partir de municipios/*/municipio.json (ADR 0007).
// O frontend (raiz `frontend/` na Vercel) não lê fora da sua pasta; tests/frontend-municipios.test.js
// falha se a cópia ficar diferente da origem. Uso: npm run municipio:frontend

const fs = require('fs');
const path = require('path');
const logger = require('../src/logger');
const { exportarMunicipios, SLUG_PADRAO } = require('../src/municipio');

const DESTINO = path.resolve(__dirname, '..', 'frontend', 'lib', 'municipios.json');

const municipios = exportarMunicipios();
fs.writeFileSync(DESTINO, `${JSON.stringify({ padrao: SLUG_PADRAO, municipios }, null, 2)}\n`);
logger.info('frontend/lib/municipios.json atualizado', { municipios: Object.keys(municipios) });
