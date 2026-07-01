'use strict';

const { DatabaseSync } = require('node:sqlite');
const config = require('../src/config');

const db = new DatabaseSync(config.dbPath, { readOnly: true });

function readFlag(name, fallback = null) {
  const prefix = `--${name}=`;
  const arg = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function main() {
  const ano = readFlag('ano');
  const limite = Math.min(Math.max(Number(readFlag('limite', 30)), 1), 500);
  const json = hasFlag('json');
  const filterParams = {};
  const listParams = { limite };
  const filters = ["d.tipo = 'edital'"];

  if (ano) {
    filters.push('d.ano = @ano');
    filterParams.ano = Number(ano);
    listParams.ano = Number(ano);
  }

  const where = filters.join(' AND ');
  const porAno = db.prepare(`
    SELECT d.ano,
           COUNT(*) AS editais_sem_produtos,
           SUM(CASE WHEN LENGTH(TRIM(IFNULL(d.texto_completo,''))) > 0 THEN 1 ELSE 0 END) AS com_texto,
           SUM(CASE WHEN EXISTS (
             SELECT 1 FROM documentos_resumos_ai r
              WHERE r.documento_id = d.id AND r.status = 'ok' AND r.provider <> 'mock'
           ) THEN 1 ELSE 0 END) AS com_resumo,
           SUM(CASE WHEN IFNULL(d.url_pdf,'') = '' THEN 1 ELSE 0 END) AS sem_pdf
      FROM documentos d
     WHERE ${where}
       AND NOT EXISTS (SELECT 1 FROM licitacoes_produtos p WHERE p.documento_id = d.id)
     GROUP BY d.ano
     ORDER BY d.ano DESC
  `).all(filterParams);

  const documentos = db.prepare(`
    SELECT d.id, d.ano, d.numero, d.status_coleta, d.titulo,
           LENGTH(TRIM(IFNULL(d.texto_completo,''))) AS texto_chars,
           CASE WHEN EXISTS (
             SELECT 1 FROM documentos_resumos_ai r
              WHERE r.documento_id = d.id AND r.status = 'ok' AND r.provider <> 'mock'
           ) THEN 1 ELSE 0 END AS tem_resumo,
           CASE WHEN EXISTS (
             SELECT 1 FROM licitacoes_detalhes ld
              WHERE ld.documento_id = d.id AND IFNULL(ld.vencedor_nome,'') <> ''
           ) THEN 1 ELSE 0 END AS tem_vencedor
      FROM documentos d
     WHERE ${where}
       AND NOT EXISTS (SELECT 1 FROM licitacoes_produtos p WHERE p.documento_id = d.id)
     ORDER BY d.ano DESC, d.id DESC
     LIMIT @limite
  `).all(listParams);

  const result = {
    filtros: {
      ano: ano ? Number(ano) : null,
      limite,
    },
    total: porAno.reduce((sum, row) => sum + row.editais_sem_produtos, 0),
    por_ano: porAno,
    documentos,
    comandos_sugeridos: porAno.map((row) => ({
      ano: row.ano,
      estruturar: `npm run licitacoes:estruturar -- --ano=${row.ano}`,
      enriquecer: `npm run licitacoes:enriquecer-produtos -- --ano=${row.ano} --sem-download`,
    })),
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('Diagnostico de editais sem produtos estruturados');
  console.log(`Total no filtro: ${result.total}`);
  console.log('');
  console.log('Por ano');
  for (const row of porAno) {
    console.log(
      `${row.ano}: ${row.editais_sem_produtos} sem produtos | com_texto=${row.com_texto} | com_resumo=${row.com_resumo} | sem_pdf=${row.sem_pdf}`
    );
  }
  console.log('');
  console.log('Amostra');
  for (const doc of documentos) {
    console.log(
      `#${doc.id} ${doc.ano} texto=${doc.texto_chars} resumo=${doc.tem_resumo ? 'sim' : 'nao'} vencedor=${doc.tem_vencedor ? 'sim' : 'nao'} ${doc.titulo.slice(0, 90)}`
    );
  }
  console.log('');
  console.log('Comandos sugeridos');
  for (const cmd of result.comandos_sugeridos.slice(0, 8)) {
    console.log(`${cmd.ano}: ${cmd.estruturar}`);
    console.log(`${cmd.ano}: ${cmd.enriquecer}`);
  }
}

main();
