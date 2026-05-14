const { db } = require('../src/db');

function main() {
  const rows = db
    .prepare("SELECT id, documento_id, modelo, status FROM documentos_resumos_ai WHERE provider = 'mock'")
    .all();

  if (!rows.length) {
    console.log('Nenhum resumo mock encontrado.');
    return;
  }

  console.log(`Removendo ${rows.length} resumo(s) mock:`);
  for (const row of rows) {
    console.log(`#${row.id} documento=${row.documento_id} modelo=${row.modelo} status=${row.status}`);
  }

  const result = db.prepare("DELETE FROM documentos_resumos_ai WHERE provider = 'mock'").run();
  console.log(`Resumos mock removidos: ${result.changes}`);
}

main();
