'use strict';

const { DatabaseSync } = require('node:sqlite');
const config = require('../src/config');
const { classifyProdutoPrecoLacuna } = require('./lib/produtos-lacunas');

const db = new DatabaseSync(config.dbPath, { readOnly: true, timeout: 15000 });
db.exec('PRAGMA query_only = ON;');
db.exec('PRAGMA busy_timeout = 15000;');

function readFlag(name, fallback = null) {
  const prefix = `--${name}=`;
  const arg = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function main() {
  const anoInicio = Number(readFlag('ano-inicio', 2025));
  const anoFim = Number(readFlag('ano-fim', 2026));
  const limite = Math.min(Math.max(Number(readFlag('limite', 200)), 1), 1000);
  const json = hasFlag('json');

  const rows = db.prepare(`
    WITH produtos AS (
      SELECT documento_id,
             COUNT(*) AS produtos_total,
             SUM(CASE WHEN valor_unitario_final IS NOT NULL
                        OR valor_total_final IS NOT NULL
                        OR valor_lote_final IS NOT NULL
                        OR valor_global_final IS NOT NULL THEN 1 ELSE 0 END) AS produtos_com_preco
        FROM licitacoes_produtos
       GROUP BY documento_id
    ),
    anexos AS (
      SELECT documento_id,
             SUM(CASE WHEN tipo IN ('ata','classificacao','resultado','homologacao','contrato')
                        AND status_extracao='ok'
                        AND IFNULL(texto_completo,'') <> '' THEN 1 ELSE 0 END) AS resultado_ok,
             SUM(CASE WHEN tipo IN ('ata','classificacao','resultado','homologacao','contrato')
                        AND (status_extracao IS NULL OR status_extracao <> 'ok' OR IFNULL(texto_completo,'') = '') THEN 1 ELSE 0 END) AS resultado_pendente
             ,
             SUM(CASE WHEN tipo IN ('edital','outro')
                        AND status_extracao='ok'
                        AND IFNULL(texto_completo,'') <> '' THEN 1 ELSE 0 END) AS anexo_edital_ou_tecnico_ok
        FROM documentos_anexos
       GROUP BY documento_id
    )
    SELECT d.id,
           d.ano,
           d.numero,
           d.titulo,
           ld.valor_final,
           ld.vencedor_nome,
           produtos.produtos_total,
           IFNULL(produtos.produtos_com_preco, 0) AS produtos_com_preco,
           IFNULL(anexos.resultado_ok, 0) AS resultado_ok,
           IFNULL(anexos.resultado_pendente, 0) AS resultado_pendente,
           IFNULL(anexos.anexo_edital_ou_tecnico_ok, 0) AS anexo_edital_ou_tecnico_ok
      FROM documentos d
      JOIN produtos ON produtos.documento_id = d.id
      LEFT JOIN licitacoes_detalhes ld ON ld.documento_id = d.id
      LEFT JOIN anexos ON anexos.documento_id = d.id
     WHERE d.tipo = 'edital'
       AND d.ano BETWEEN @anoInicio AND @anoFim
       AND produtos.produtos_total > 0
       AND IFNULL(produtos.produtos_com_preco, 0) = 0
     ORDER BY d.ano DESC, d.id DESC
     LIMIT @limite
  `).all({ anoInicio, anoFim, limite }).map((row) => {
    const lacuna = classifyProdutoPrecoLacuna(row);
    return {
      ...row,
      lacuna_preco_codigo: lacuna?.codigo || null,
      lacuna_preco_detalhe: lacuna?.detalhe || null
    };
  });

  const porTipo = rows.reduce((acc, row) => {
    const key = row.lacuna_preco_codigo || 'sem_lacuna';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const result = {
    filtros: { ano_inicio: anoInicio, ano_fim: anoFim, limite },
    total: rows.length,
    por_tipo: porTipo,
    documentos: rows
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('Classificacao de lacunas de preco em produtos');
  console.log(`Filtro: ${anoInicio}-${anoFim} | total=${rows.length}`);
  console.log('');
  console.log('Por tipo');
  for (const [tipo, total] of Object.entries(porTipo).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${tipo}: ${total}`);
  }
  console.log('');
  for (const row of rows) {
    console.log(
      `#${row.id} ${row.ano} produtos=${row.produtos_total} valor=${row.valor_final || 'n/a'} ` +
      `anexos_ok=${row.resultado_ok} pend=${row.resultado_pendente} ` +
      `lacuna=${row.lacuna_preco_codigo}:${row.lacuna_preco_detalhe}`
    );
    console.log(`  ${row.titulo.slice(0, 130)}`);
  }
}

main();
