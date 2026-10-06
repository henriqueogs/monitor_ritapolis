'use strict';

/**
 * Aplica o texto OCR exportado por `ocr-documentos-imagem.js --exportar=...`
 * (feito numa máquina com recursos) no banco deste ambiente — pensado para
 * rodar na VM. Casa por url_pdf (os ids do snapshot de origem NÃO valem aqui);
 * cada linha é revalidada: ainda 'imagem' e sem texto. Nada é sobrescrito. Mesmo caminho de gravação do
 * pipeline (saveDocumento), procedência dados_extras.texto_origem='ocr'.
 *
 *   node scripts/aplicar-ocr-exportado.js ocr.json          # dry-run
 *   node scripts/aplicar-ocr-exportado.js ocr.json --apply
 */

process.loadEnvFile?.() || require('dotenv').config();

const fs = require('fs');
const { setupDatabase } = require('../src/db/setup');
const { db, getDocumentoById, saveDocumento } = require('../src/db');
const { motivoRecusaImportacao, escolherPorUrl } = require('../src/utils/ocr-lote');
const { resumirTextoLimpo } = require('../src/utils/text');

function aplicar(item, doc) {
  saveDocumento({
    ...doc,
    resumo: doc.resumo || resumirTextoLimpo(item.texto),
    texto_completo: item.texto,
    status_coleta: 'ok',
    dados_extras: {
      ...(doc.dados_extras || {}),
      texto_origem: 'ocr',
      parser_pdf: {
        ...(doc.dados_extras?.parser_pdf || {}),
        paginas: item.paginas,
        engine: 'ocr',
        erro: null,
      },
    },
  });
}

function main() {
  const [arquivo, ...flags] = process.argv.slice(2);
  if (!arquivo) { throw new Error('uso: aplicar-ocr-exportado.js arquivo.json [--apply]'); }
  const apply = flags.includes('--apply');
  const itens = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  setupDatabase();

  const contagem = {};
  for (const item of itens) {
    const alvo = escolherPorUrl(
      db.prepare('SELECT id FROM documentos WHERE url_pdf = ?').all(item.url_pdf)
    );
    const doc = alvo.id ? getDocumentoById(alvo.id) : null;
    const motivo = alvo.motivo || motivoRecusaImportacao(item, doc) || 'aplicavel';
    contagem[motivo] = (contagem[motivo] || 0) + 1;
    if (motivo === 'aplicavel' && apply) { aplicar(item, doc); }
  }
  console.warn(`${apply ? 'APLICADO' : 'dry-run'} — ${itens.length} itens:`, contagem);
}

try {
  main();
} catch (err) {
  console.error(`Falha: ${err.message}`);
  process.exitCode = 1;
}
