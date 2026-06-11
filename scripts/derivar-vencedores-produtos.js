'use strict';

/**
 * Deriva o vencedor de licitações a partir dos produtos já extraídos.
 *
 * Muitas atas de pregão (formato tabular) tiveram seus itens extraídos com
 * fornecedor por item, mas o parser de prosa não preencheu o vencedor no nível
 * do documento (licitacoes_detalhes.vencedor_nome fica NULL). Este script
 * promove o fornecedor dominante dos produtos ao nível do documento.
 *
 * Alvos: editais com anexo de resultado extraído, SEM vencedor em detalhes,
 * que tenham produtos com fornecedor. Conservador: não inventa valor_final.
 *
 * Uso:
 *   node scripts/derivar-vencedores-produtos.js            # dry-run
 *   node scripts/derivar-vencedores-produtos.js --apply    # efetiva
 */

const { setupDatabase } = require('../src/db/setup');
const {
  db,
  getLicitacaoProdutosByDocumentoId,
  upsertLicitacaoDetalhesExtraidos,
} = require('../src/db');
const { derivarVencedorDeProdutos } = require('../src/licitacoes/vencedor');

const CONFIANCA_DERIVADA = 0.7;
const CONFIANCA_DERIVADA_MULTIPLOS = 0.6;

function listarAlvos() {
  return db
    .prepare(
      `SELECT DISTINCT d.id, ld.modalidade
         FROM documentos d
         JOIN documentos_anexos a ON a.documento_id = d.id
         LEFT JOIN licitacoes_detalhes ld ON ld.documento_id = d.id
        WHERE d.tipo = 'edital'
          AND a.tipo IN ('ata', 'homologacao', 'resultado')
          AND a.status_extracao = 'ok'
          AND LENGTH(IFNULL(a.texto_completo, '')) > 200
          AND ld.vencedor_nome IS NULL
        ORDER BY d.id`
    )
    .all();
}

function planejar() {
  const plano = [];
  for (const alvo of listarAlvos()) {
    const produtos = getLicitacaoProdutosByDocumentoId(alvo.id).dados || [];
    const derivado = derivarVencedorDeProdutos(produtos);
    if (derivado) {
      plano.push({ documentoId: alvo.id, modalidade: alvo.modalidade, derivado });
    }
  }
  return plano;
}

function main() {
  const apply = process.argv.includes('--apply');
  setupDatabase();

  const plano = planejar();
  console.warn(`Editais com vencedor derivável dos produtos: ${plano.length}`);
  for (const p of plano) {
    const tag = p.derivado.multiplos ? `[${p.derivado.n_fornecedores} fornecedores]` : '[único]';
    console.warn(`  doc #${p.documentoId} ${tag} → ${p.derivado.vencedor_nome}`);
  }

  if (!apply) {
    console.warn('\nDry-run. Nada gravado. Rode com --apply para efetivar.');
    return;
  }

  let gravados = 0;
  db.exec('BEGIN');
  try {
    for (const p of plano) {
      const changes = upsertLicitacaoDetalhesExtraidos(
        { id: p.documentoId, modalidade: p.modalidade },
        {
          vencedor_nome: p.derivado.vencedor_nome,
          vencedor_cnpj: p.derivado.vencedor_cnpj,
          origem: 'derivado_produtos',
          origem_detalhe: p.derivado.multiplos
            ? `dominante entre ${p.derivado.n_fornecedores} fornecedores`
            : 'fornecedor único nos itens',
          trecho_fonte: p.derivado.trecho,
          confianca: p.derivado.multiplos ? CONFIANCA_DERIVADA_MULTIPLOS : CONFIANCA_DERIVADA,
        }
      );
      gravados += changes;
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  console.warn(`\n${gravados} vencedores derivados e gravados.`);
}

main();
