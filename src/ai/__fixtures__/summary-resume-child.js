'use strict';
// Synthetic text and an isolated database: never opens canonical project data.
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const db = new DatabaseSync(process.argv[2]);
db.exec(
  'CREATE TABLE IF NOT EXISTS audit(prompt TEXT); CREATE TABLE IF NOT EXISTS final(value TEXT);'
);
const documento = {
  id: 1,
  titulo: 'Teste isolado',
  texto_completo: Array.from(
    { length: 140 },
    (_, i) => `Linha ${String(i).padStart(3, '0')} municipal oficial. `
  ).join(''),
};
const config = require('../../config');
Object.assign(config, {
  aiSummaryEnabled: true,
  aiChunkSizeChars: 1500,
  aiChunkOverlapChars: 0,
  aiMaxCharsDirect: 100,
  aiMaxChunksPerDocument: 100,
});
require.cache[require.resolve('../../db')] = {
  exports: {
    getDocumentoById: () => documento,
    getResumoAiByDocumentoHash: () => null,
    saveResumoAi: data => {
      db.prepare('INSERT INTO final VALUES (?)').run(JSON.stringify(data));
      return data;
    },
  },
};
require.cache[require.resolve('../../logger')] = { exports: { info() {}, warn() {}, error() {} } };
const { createProgress } = require('../../pipeline/progress');
const { summarizeDocument } = require('../summarize-document');
const progress = createProgress(db, 'same-job');
if (process.argv[3] === 'interrupt') {
  const save = progress.save;
  progress.save = (key, value) => {
    save(key, value);
    process.exit(23);
  };
}
const provider = {
  provider: 'synthetic',
  model: 'test',
  generateJson: async ({ prompt }) => {
    db.prepare('INSERT INTO audit VALUES (?)').run(
      crypto.createHash('sha256').update(prompt).digest('hex')
    );
    return JSON.stringify({
      tipo_documento: 'lei',
      titulo_curto: 'Lei municipal',
      resumo_cidadao: 'Conteudo oficial resumido.',
      resumo_tecnico: 'Conteudo tecnico verificado.',
      confianca: 0.8,
    });
  },
};
summarizeDocument(1, { provider, progress })
  .then(() => {
    db.close();
  })
  .catch(() => {
    process.exitCode = 1;
    db.close();
  });
