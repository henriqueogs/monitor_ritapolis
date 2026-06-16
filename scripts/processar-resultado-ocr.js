'use strict';

/**
 * Converte o texto OCR'd dos anexos de resultado (parser='ocr_tesseract') em
 * produtos + vencedor + valor, usando os mesmos parsers do pipeline normal.
 * Roda DEPOIS do ocr-anexos.js — fecha a cadeia OCR → dados estruturados.
 *
 * Uso:
 *   node scripts/processar-resultado-ocr.js            # dry-run
 *   node scripts/processar-resultado-ocr.js --apply
 */

process.loadEnvFile?.() || require('dotenv').config();

const { setupDatabase } = require('../src/db/setup');
const db = require('../src/db');
const { parseLicitacaoDetalhes } = require('../src/parsers/licitacao-detalhes');

const TIPOS_RESULTADO = ['ata', 'homologacao', 'resultado', 'contrato', 'classificacao'];

function listarAnexosOcr() {
  return db.db
    .prepare(
      `SELECT id, documento_id, nome, tipo, texto_completo
         FROM documentos_anexos
        WHERE parser = 'ocr_tesseract' AND status_extracao = 'ok'
          AND texto_completo IS NOT NULL AND LENGTH(texto_completo) > 80
          AND tipo IN (${TIPOS_RESULTADO.map((t) => `'${t}'`).join(',')})
        ORDER BY documento_id, id`
    )
    .all();
}

function main() {
  const apply = process.argv.includes('--apply');
  setupDatabase();

  const anexos = listarAnexosOcr();
  console.warn(`Anexos de resultado OCR'd a processar: ${anexos.length}${apply ? '' : ' (dry-run)'}`);

  const cont = { produtos: 0, vencedores: 0, docs: new Set() };
  for (const a of anexos) {
    let produtosSalvos = 0;
    let vencedor = false;

    if (apply) {
      try {
        const prod = db.enriquecerProdutosComResultadosAnexo({
          documentoId: a.documento_id,
          anexoId: a.id,
          texto: a.texto_completo,
        });
        produtosSalvos = (prod.produtos_criados || 0) + (prod.produtos_atualizados || 0);
      } catch (err) {
        console.error(`  #${a.id} produtos falhou: ${err.message}`);
      }
      try {
        const detalhes = parseLicitacaoDetalhes(a.texto_completo, { anexos: [{ nome: a.nome || '' }] });
        if (detalhes && (detalhes.vencedor_nome || detalhes.valor_final)) {
          db.upsertLicitacaoDetalhesExtraidos({ id: a.documento_id }, detalhes);
          vencedor = true;
        }
      } catch (err) {
        console.error(`  #${a.id} detalhes falhou: ${err.message}`);
      }
    }

    if (produtosSalvos || vencedor) {
      cont.produtos += produtosSalvos;
      if (vencedor) {cont.vencedores += 1;}
      cont.docs.add(a.documento_id);
      console.warn(`  doc #${a.documento_id} [${a.tipo}] — ${produtosSalvos} produtos${vencedor ? ' + vencedor' : ''}`);
    }
  }

  console.warn(
    `\n${apply ? 'Aplicado' : 'Dry-run'} — ${cont.docs.size} documentos afetados · ${cont.produtos} produtos · ${cont.vencedores} vencedores`
  );
  if (!apply) {console.warn('Rode com --apply para gravar.');}
}

main();
