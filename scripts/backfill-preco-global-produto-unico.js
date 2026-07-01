'use strict';

const { DatabaseSync } = require('node:sqlite');
const config = require('../src/config');

const db = new DatabaseSync(config.dbPath, { timeout: 15000 });
db.exec('PRAGMA busy_timeout = 15000;');

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function readFlag(name, fallback = null) {
  const prefix = `--${name}=`;
  const arg = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function parseMoney(value) {
  const parsed = Number(String(value || '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function extrairValorGlobalTexto(texto) {
  const text = String(texto || '').replace(/\s+/g, ' ');
  const patterns = [
    /\bValor\s+Global\b\s*[-–:]?\s*R\$\s*([\d.]+,\d{2})/i,
    /\bValor\s+do\s+contrato\b\s*[:\-–]?\s*R\$\s*([\d.]+,\d{2})/i,
    /\bquantia\s+de\s+R\$\s*([\d.]+,\d{2})/i,
    /\bTotal\s*\(R\$\)\s*:\s*([\d.]+,\d{2})/i,
    /\bTOTAL\s+[\d.]+\s+([\d.]+,\d{2})\b/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const valor = parseMoney(match?.[1]);
    if (valor) {
      return {
        valor,
        trecho: text.slice(Math.max(0, match.index - 120), Math.min(text.length, match.index + 260)).trim()
      };
    }
  }

  return null;
}

function main() {
  const apply = hasFlag('apply');
  const anoInicio = Number(readFlag('ano-inicio', 2025));
  const anoFim = Number(readFlag('ano-fim', 2026));
  const limite = Math.min(Math.max(Number(readFlag('limite', 500)), 1), 5000);

  const candidates = db.prepare(`
    WITH produtos AS (
      SELECT documento_id,
             COUNT(*) AS total,
             SUM(CASE WHEN valor_unitario_final IS NOT NULL
                        OR valor_total_final IS NOT NULL
                        OR valor_lote_final IS NOT NULL
                        OR valor_global_final IS NOT NULL THEN 1 ELSE 0 END) AS com_preco,
             MIN(id) AS produto_id
        FROM licitacoes_produtos
       GROUP BY documento_id
    )
    SELECT d.id AS documento_id,
           d.ano,
           d.titulo,
           lp.id AS produto_id,
           lp.descricao,
           ld.valor_final,
           ld.vencedor_nome,
           ld.origem AS detalhes_origem,
           ld.trecho_fonte AS detalhes_trecho
      FROM documentos d
      JOIN produtos p ON p.documento_id = d.id
      JOIN licitacoes_produtos lp ON lp.id = p.produto_id
      LEFT JOIN licitacoes_detalhes ld ON ld.documento_id = d.id
     WHERE d.tipo = 'edital'
       AND d.ano BETWEEN @anoInicio AND @anoFim
       AND p.total = 1
       AND IFNULL(p.com_preco, 0) = 0
     ORDER BY d.ano DESC, d.id DESC
     LIMIT @limite
  `).all({ anoInicio, anoFim, limite });

  const anexosStmt = db.prepare(`
    SELECT id, nome, tipo, texto_completo
      FROM documentos_anexos
     WHERE documento_id = @documento_id
       AND tipo IN ('ata', 'classificacao', 'resultado', 'homologacao', 'contrato')
       AND status_extracao = 'ok'
       AND IFNULL(texto_completo, '') <> ''
     ORDER BY id ASC
  `);

  const rows = candidates
    .map((row) => {
      if (Number(row.valor_final || 0) > 0) {
        return {
          ...row,
          valor_global_final: Number(row.valor_final),
          origem_detalhe_backfill: `licitacoes_detalhes:${row.detalhes_origem || 'valor_final_local'}`,
          trecho_fonte_backfill: row.detalhes_trecho || `Valor final do processo: R$ ${Number(row.valor_final).toFixed(2)}`
        };
      }

      const anexos = anexosStmt.all({ documento_id: row.documento_id });
      for (const anexo of anexos) {
        const extraido = extrairValorGlobalTexto(anexo.texto_completo);
        if (extraido?.valor) {
          return {
            ...row,
            valor_global_final: extraido.valor,
            origem_detalhe_backfill: `documentos_anexos:${anexo.id}:${anexo.tipo}:${anexo.nome}`,
            trecho_fonte_backfill: extraido.trecho
          };
        }
      }

      return null;
    })
    .filter(Boolean);

  const resumo = {
    apply,
    ano_inicio: anoInicio,
    ano_fim: anoFim,
    candidatos: rows.length,
    atualizados: 0,
    documentos: rows.map((row) => ({
      documento_id: row.documento_id,
      ano: row.ano,
      produto_id: row.produto_id,
      valor_global_final: row.valor_global_final,
      vencedor_nome: row.vencedor_nome,
      descricao: row.descricao,
      titulo: row.titulo
    }))
  };

  if (!apply) {
    console.log(JSON.stringify(resumo, null, 2));
    console.log('\nUse: node scripts/backfill-preco-global-produto-unico.js --apply');
    return;
  }

  const update = db.prepare(`
    UPDATE licitacoes_produtos
       SET valor_final_tipo = 'global',
           valor_global_final = @valor_global_final,
           fornecedor_nome = COALESCE(fornecedor_nome, @fornecedor_nome),
           origem = CASE
             WHEN IFNULL(origem, '') LIKE '%detalhes_valor_final%'
             THEN origem
             ELSE TRIM(IFNULL(origem, '') || CASE WHEN IFNULL(origem, '') = '' THEN '' ELSE '+' END || 'detalhes_valor_final')
           END,
           origem_detalhe = TRIM(IFNULL(origem_detalhe, '') || CASE WHEN IFNULL(origem_detalhe, '') = '' THEN '' ELSE ' | ' END || @origem_detalhe),
           trecho_fonte = COALESCE(trecho_fonte, @trecho_fonte),
           confianca = MAX(IFNULL(confianca, 0), 0.82),
           atualizado_em = @atualizado_em
     WHERE id = @produto_id
       AND valor_unitario_final IS NULL
       AND valor_total_final IS NULL
       AND valor_lote_final IS NULL
       AND valor_global_final IS NULL
  `);

  db.exec('BEGIN');
  try {
    for (const row of rows) {
      const result = update.run({
        produto_id: row.produto_id,
        valor_global_final: row.valor_global_final,
        fornecedor_nome: row.vencedor_nome || null,
        origem_detalhe: row.origem_detalhe_backfill,
        trecho_fonte: row.trecho_fonte_backfill,
        atualizado_em: new Date().toISOString()
      });
      resumo.atualizados += result.changes || 0;
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  console.log(JSON.stringify(resumo, null, 2));
}

main();
