'use strict';

/**
 * Marca anexos de PDF escaneado (imagem) com a flag `status_extracao='requer_ocr'`.
 *
 * Critério: extração falhou com erro "texto vazio" — o PDF abre, mas não tem
 * camada de texto. Re-extrair sem OCR sempre falha; a flag tira esses anexos do
 * ciclo de retry (ver listAnexosResultadoParaExtracao) e os deixa enfileirados
 * para um futuro pipeline de OCR (Gemini visão ou tesseract local).
 *
 * Importância: ~69 anexos, majoritariamente atas/homologações 2017–2021 — são a
 * única fonte de vencedor/valor de ~36 processos antigos ainda sem resultado.
 *
 * Uso:
 *   node scripts/marcar-requer-ocr.js            # dry-run
 *   node scripts/marcar-requer-ocr.js --apply    # efetiva
 */

const { setupDatabase } = require('../src/db/setup');
const { db } = require('../src/db');

const ERRO_TEXTO_VAZIO = 'texto vazio';
const STATUS_REQUER_OCR = 'requer_ocr';
// Anexos que são imagem pura (foto/scan da ata) — o parser de PDF falha com
// "Invalid PDF structure"; só OCR resolve
const EXTENSOES_IMAGEM = "'%.jpg', '%.jpeg', '%.png', '%.tif', '%.tiff'";

const SQL_ALVOS = `
  a.status_extracao = 'erro_pdf'
  AND (
    a.erro = @erro
    OR ${EXTENSOES_IMAGEM.split(', ')
      .map((ext) => `LOWER(IFNULL(a.nome, '')) LIKE ${ext}`)
      .join(' OR ')}
  )`;

function listarAlvos() {
  return db
    .prepare(
      `SELECT a.id, a.documento_id, a.tipo, a.nome, d.ano
         FROM documentos_anexos a
         JOIN documentos d ON d.id = a.documento_id
        WHERE ${SQL_ALVOS}
        ORDER BY d.ano DESC, a.documento_id, a.id`
    )
    .all({ erro: ERRO_TEXTO_VAZIO });
}

function main() {
  const apply = process.argv.includes('--apply');
  setupDatabase();

  const alvos = listarAlvos();
  const porAnoTipo = {};
  for (const a of alvos) {
    const chave = `${a.ano || 's/ano'}·${a.tipo}`;
    porAnoTipo[chave] = (porAnoTipo[chave] || 0) + 1;
  }

  console.warn(`Anexos escaneados a marcar como '${STATUS_REQUER_OCR}': ${alvos.length}`);
  console.warn('Distribuição (ano·tipo):', JSON.stringify(porAnoTipo));

  if (!apply) {
    console.warn('\nDry-run. Nada gravado. Rode com --apply para efetivar.');
    return;
  }

  const result = db
    .prepare(
      `UPDATE documentos_anexos
          SET status_extracao = @status, atualizado_em = CURRENT_TIMESTAMP
        WHERE id IN (
          SELECT a.id FROM documentos_anexos a WHERE ${SQL_ALVOS}
        )`
    )
    .run({ status: STATUS_REQUER_OCR, erro: ERRO_TEXTO_VAZIO });

  console.warn(`\n${result.changes} anexos marcados como '${STATUS_REQUER_OCR}'.`);
}

main();
