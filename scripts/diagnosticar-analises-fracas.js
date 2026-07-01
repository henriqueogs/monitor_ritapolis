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

function mandatoInicio(ano) {
  return 2025 + Math.floor((Number(ano) - 2025) / 4) * 4;
}

function inferMotivos(row, options = {}) {
  const motivos = [];
  if (Number(row.confianca || 0) < 0.45) { motivos.push('confianca_baixa'); }
  if (!row.produtos_total) { motivos.push('sem_produtos'); }
  const lacunaPreco = classifyProdutoPrecoLacuna(row);
  if (lacunaPreco?.codigo) { motivos.push(lacunaPreco.codigo); }
  if (!row.valor_final) { motivos.push('sem_valor_final'); }
  if (!row.vencedor_nome) { motivos.push('sem_vencedor'); }
  if (!row.tem_grupo) { motivos.push('sem_grupo'); }
  if (options.considerarPncp && !row.tem_pncp) { motivos.push('sem_pncp'); }
  if (row.status_coleta === 'sem_pdf') { motivos.push('sem_pdf'); }
  if (Number(row.texto_chars || 0) < 1000) { motivos.push('texto_curto'); }
  return motivos;
}

function main() {
  const ano = readFlag('ano');
  const mandato = readFlag('mandato', '2025-2028');
  const limite = Math.min(Math.max(Number(readFlag('limite', 50)), 1), 500);
  const maxConfianca = Number(readFlag('max-confianca', 0.69));
  const json = hasFlag('json');
  const considerarPncp = hasFlag('considerar-pncp');

  const filtros = ["d.tipo = 'edital'"];
  const params = { maxConfianca, limite };

  if (ano) {
    filtros.push('d.ano = @ano');
    params.ano = Number(ano);
  } else if (mandato) {
    const [inicio, fim] = String(mandato).split('-').map(Number);
    if (Number.isFinite(inicio) && Number.isFinite(fim)) {
      filtros.push('d.ano BETWEEN @inicio AND @fim');
      params.inicio = inicio;
      params.fim = fim;
    }
  }

  const rows = db.prepare(`
    WITH latest AS (
      SELECT r.documento_id,
             r.id AS resumo_id,
             CAST(IFNULL(json_extract(r.resumo_json, '$.confianca'), 0) AS REAL) AS confianca
        FROM documentos_resumos_ai r
       WHERE r.status = 'ok'
         AND r.provider <> 'mock'
         AND r.contrato_versao LIKE '2.%'
         AND r.id = (
           SELECT r2.id
             FROM documentos_resumos_ai r2
            WHERE r2.documento_id = r.documento_id
              AND r2.status = 'ok'
              AND r2.provider <> 'mock'
              AND r2.contrato_versao LIKE '2.%'
            ORDER BY datetime(r2.criado_em) DESC, r2.id DESC
            LIMIT 1
         )
    ),
    produtos AS (
      SELECT documento_id,
             COUNT(*) AS total,
             SUM(CASE WHEN valor_total_final IS NOT NULL
                        OR valor_unitario_final IS NOT NULL
                        OR valor_lote_final IS NOT NULL
                        OR valor_global_final IS NOT NULL THEN 1 ELSE 0 END) AS com_preco
        FROM licitacoes_produtos
       GROUP BY documento_id
    ),
    anexos AS (
      SELECT documento_id,
             SUM(CASE WHEN tipo IN ('ata','classificacao','resultado','homologacao','contrato')
                        AND status_extracao='ok'
                        AND IFNULL(texto_completo,'') <> '' THEN 1 ELSE 0 END) AS resultado_ok,
             SUM(CASE WHEN tipo IN ('ata','classificacao','resultado','homologacao','contrato')
                        AND (status_extracao IS NULL OR status_extracao <> 'ok' OR IFNULL(texto_completo,'') = '') THEN 1 ELSE 0 END) AS resultado_pendente,
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
           d.status_coleta,
           LENGTH(TRIM(IFNULL(d.texto_completo, ''))) AS texto_chars,
           latest.resumo_id,
           latest.confianca,
           ld.vencedor_nome,
           ld.valor_final,
           IFNULL(produtos.total, 0) AS produtos_total,
           IFNULL(produtos.com_preco, 0) AS produtos_com_preco,
           IFNULL(anexos.resultado_ok, 0) AS resultado_ok,
           IFNULL(anexos.resultado_pendente, 0) AS resultado_pendente,
           IFNULL(anexos.anexo_edital_ou_tecnico_ok, 0) AS anexo_edital_ou_tecnico_ok,
           EXISTS(SELECT 1 FROM licitacoes_grupo_documentos gd WHERE gd.documento_id = d.id) AS tem_grupo,
           EXISTS(
             SELECT 1 FROM licitacoes_fontes_relacionadas fr
              WHERE fr.documento_id = d.id AND fr.fonte = 'pncp' AND fr.status_correspondencia <> 'rejeitada'
           ) AS tem_pncp
      FROM documentos d
      JOIN latest ON latest.documento_id = d.id
      LEFT JOIN licitacoes_detalhes ld ON ld.documento_id = d.id
      LEFT JOIN produtos ON produtos.documento_id = d.id
      LEFT JOIN anexos ON anexos.documento_id = d.id
     WHERE ${filtros.join(' AND ')}
       AND latest.confianca <= @maxConfianca
     ORDER BY latest.confianca ASC, d.ano DESC, d.id DESC
     LIMIT @limite
  `).all(params).map((row) => ({
    ...row,
    mandato: `${mandatoInicio(row.ano)}-${mandatoInicio(row.ano) + 3}`,
    lacuna_preco: classifyProdutoPrecoLacuna(row),
    motivos: inferMotivos(row, { considerarPncp }),
    comando_reprocessar: `npm run ai:correlacionar -- --documento-id=${row.id} --force`,
  }));

  const resumo = {
    filtros: {
      ano: ano ? Number(ano) : null,
      mandato: ano ? null : mandato,
      max_confianca: maxConfianca,
      limite,
      considerar_pncp: considerarPncp,
    },
    total_listado: rows.length,
    por_motivo: rows.reduce((acc, row) => {
      for (const motivo of row.motivos) {
        acc[motivo] = (acc[motivo] || 0) + 1;
      }
      return acc;
    }, {}),
    documentos: rows,
  };

  if (json) {
    console.log(JSON.stringify(resumo, null, 2));
    return;
  }

  console.log('Diagnostico de analises integradas fracas');
  console.log(`Filtro: ${ano ? `ano ${ano}` : `mandato ${mandato}`} | confianca <= ${maxConfianca}`);
  console.log(`Total listado: ${rows.length}`);
  console.log('');
  for (const row of rows) {
    console.log(
      `#${row.id} ${row.ano} conf=${Number(row.confianca).toFixed(2)} produtos=${row.produtos_total} valor=${row.valor_final || 'n/a'} ` +
      `vencedor=${row.vencedor_nome ? 'sim' : 'nao'} motivos=${row.motivos.join(',')}`
    );
    console.log(`  ${row.titulo.slice(0, 120)}`);
  }
  console.log('');
  console.log('Motivos');
  for (const [motivo, total] of Object.entries(resumo.por_motivo).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${motivo}: ${total}`);
  }
}

main();
