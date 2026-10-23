'use strict';

// Grava os documentos fictícios do município de exemplo (src/demo/documentos-exemplo.js).
// Uso: MUNICIPIO=_exemplo node scripts/seed-exemplo.js [--forcar]
// Recusa rodar em município real sem --forcar. Reexecutar não duplica (saveDocumento faz upsert).

const { setupDatabase } = require('../src/db/setup');

setupDatabase();

const config = require('../src/config');
const logger = require('../src/logger');
const { lerMunicipio } = require('../src/municipio');
const { saveDocumento } = require('../src/db');
const { rebuildFtsIndex } = require('../src/db/fts-repo');
const { montarDocumentosExemplo, podeSemearExemplo } = require('../src/demo/documentos-exemplo');

function main() {
  const forcar = process.argv.includes('--forcar');
  const permissao = podeSemearExemplo({ slug: config.municipio, forcar });
  if (!permissao.pode) {
    logger.error(`seed-exemplo recusado: ${permissao.motivo}`);
    process.exitCode = 1;
    return;
  }

  const municipio = lerMunicipio({ slug: config.municipio });
  const contagem = {};
  for (const documento of montarDocumentosExemplo({ municipio })) {
    const { action } = saveDocumento(documento);
    contagem[action] = (contagem[action] || 0) + 1;
  }
  rebuildFtsIndex();
  logger.info('seed-exemplo concluído', { municipio: municipio.slug, ...contagem });
}

main();
