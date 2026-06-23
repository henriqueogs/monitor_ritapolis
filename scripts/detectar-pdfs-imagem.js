'use strict';

/**
 * Detecta automaticamente documentos cujo texto extraído é "lixo" (OCR mal feito
 * ou encoding quebrado) e os marca como status_coleta='imagem' para processamento
 * via OCR com Tesseract.
 *
 * Uso:
 *   node scripts/detectar-pdfs-imagem.js                 # dry-run
 *   node scripts/detectar-pdfs-imagem.js --apply --limite=50
 *
 * Critérios de detecção:
 * 1. Texto muito curto (< 100 chars por página)
 * 2. Proporção baixa de caracteres alfanuméricos (< 70%)
 * 3. Presença de sequências longas de caracteres aleatórios
 */

process.loadEnvFile?.() || require('dotenv').config();

const { setupDatabase } = require('../src/db/setup');
const { db } = require('../src/db');
const { isImageBasedPdf } = require('../src/parsers/pdf');

function parseArgs(argv) {
  const o = { apply: false, limite: null };
  for (const a of argv) {
    if (a === '--apply') {
      o.apply = true;
    } else if (a.startsWith('--limite=')) {
      o.limite = Number(a.split('=')[1]);
    }
  }
  return o;
}

function listar(limite) {
  const limitClause = Number.isFinite(limite) && limite > 0 ? `LIMIT ${Math.floor(limite)}` : '';
  return db
    .prepare(
      `SELECT id, tipo, ano, texto_completo FROM documentos
        WHERE texto_completo IS NOT NULL AND texto_completo != ''
          AND status_coleta != 'imagem'
          AND LENGTH(texto_completo) > 0
        ORDER BY ano DESC, id ${limitClause}`
    )
    .all();
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  setupDatabase();

  const docs = listar(opts.limite);
  console.warn(`Documentos a verificar: ${docs.length}${opts.apply ? '' : ' (dry-run)'}`);

  if (!opts.apply) {
    return;
  }

  const update = db.prepare(
    `UPDATE documentos
        SET status_coleta = 'imagem',
            dados_extras = json_set(IFNULL(dados_extras, '{}'), '$.auto_detect_imagem', 1),
            atualizado_em = CURRENT_TIMESTAMP
      WHERE id = @id`
  );

  const cont = { detectados: 0, ok: 0, erro: 0 };

  for (let i = 0; i < docs.length; i += 1) {
    const d = docs[i];
    const tag = `[${i + 1}/${docs.length}] #${d.id} (${d.tipo} / ${d.ano})`;

    try {
      // Estimar número de páginas a partir do tamanho do texto
      // Estimativa: ~3000 chars por página
      const estimatedPages = Math.max(1, Math.ceil(d.texto_completo.length / 3000));

      const isImage = isImageBasedPdf(d.texto_completo, estimatedPages);

      if (isImage) {
        update.run({ id: d.id });
        cont.detectados += 1;
        console.warn(
          `${tag} DETECTADO — ${d.texto_completo.length} chars / ~${estimatedPages}p (lixo de extração)`
        );
      } else {
        cont.ok += 1;
      }
    } catch (err) {
      cont.erro += 1;
      console.error(`${tag} ERRO: ${err.message}`);
    }
  }

  console.warn(
    `\nDetecção completa — marcados: ${cont.detectados} · OK: ${cont.ok} · erros: ${cont.erro}`
  );
  if (cont.detectados > 0) {
    console.warn(
      `\nPróximo: executar OCR nos marcados\n  npm run ocr:documentos -- --apply --limite=50`
    );
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
