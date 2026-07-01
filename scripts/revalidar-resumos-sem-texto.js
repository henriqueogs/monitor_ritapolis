'use strict';

const { db } = require('../src/db/connection');

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function main() {
  const apply = hasFlag('apply');
  const rows = db
    .prepare(
      `SELECT r.id, r.documento_id, r.contrato_versao, d.ano, d.titulo, d.status_coleta
         FROM documentos_resumos_ai r
         JOIN documentos d ON d.id = r.documento_id
        WHERE r.status = 'ok'
          AND LENGTH(TRIM(IFNULL(d.texto_completo, ''))) = 0
        ORDER BY d.ano DESC, d.id DESC, r.id`
    )
    .all();

  console.log(`${apply ? 'Aplicando' : 'Dry-run'} revalidacao de resumos sem texto-fonte`);
  console.log(`Candidatos: ${rows.length}`);
  rows.forEach((row) => {
    console.log(`#${row.documento_id} resumo=${row.id} ano=${row.ano} contrato=${row.contrato_versao} status_doc=${row.status_coleta} ${row.titulo.slice(0, 90)}`);
  });

  if (!apply) {
    console.log('\nUse: npm run dados:revalidar-resumos -- --apply');
    return;
  }

  const result = db
    .prepare(
      `UPDATE documentos_resumos_ai
          SET status = 'revisar_sem_texto_fonte',
              erro = 'Documento sem texto_completo no momento da auditoria; resumo preservado, mas removido do conjunto ok verificavel.',
              atualizado_em = CURRENT_TIMESTAMP
        WHERE id IN (${rows.map(() => '?').join(',')})`
    )
    .run(...rows.map((row) => row.id));

  console.log(`Resumos marcados para revisao: ${result.changes || 0}`);
}

main();
