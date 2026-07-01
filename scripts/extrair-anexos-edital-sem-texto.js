'use strict';

/**
 * Recupera texto para documentos sem texto_completo (PDF principal escaneado,
 * ausente ou com erro) a partir dos seus anexos de edital.
 *
 * Pipeline por documento sem texto útil:
 *   1. Extrai os anexos pendentes promovíveis (tipo edital/outro): download +
 *      extractOfficialFileText + saveDocumentoAnexoTexto.
 *      Anexo escaneado ("texto vazio") vira status 'requer_ocr' (fila de OCR).
 *   2. Promove o melhor texto de anexo (ver src/parsers/anexo-texto.js) para
 *      documentos.texto_completo, registrando a procedência em
 *      dados_extras.texto_origem. status_coleta NÃO muda — segue descrevendo o
 *      PDF principal.
 *
 * Com texto, o documento entra no pipeline de resumo IA do scheduler.
 *
 * Uso:
 *   node scripts/extrair-anexos-edital-sem-texto.js            # dry-run
 *   node scripts/extrair-anexos-edital-sem-texto.js --apply
 */

process.loadEnvFile?.() || require('dotenv').config();

const crypto = require('crypto');
const axios = require('axios');
const { setupDatabase } = require('../src/db/setup');
const { db, saveDocumentoAnexoTexto } = require('../src/db');
const { extractOfficialFileText } = require('../src/parsers/document-file');
const { escolherMelhorTextoAnexo, MIN_CHARS_TEXTO_UTIL } = require('../src/parsers/anexo-texto');
const { classificarArquivoTecnicoVisual, STATUS_TECNICO_VISUAL } = require('../src/parsers/technical-visual');
const config = require('../src/config');

const TIPOS_PROMOVIVEIS = "'edital', 'outro'";
const STATUS_REQUER_OCR = 'requer_ocr';

function listarDocumentosSemTexto() {
  return db
    .prepare(
      `SELECT d.id, d.numero, d.ano, d.status_coleta
         FROM documentos d
        WHERE LENGTH(IFNULL(d.texto_completo, '')) < @minChars
          AND EXISTS (
            SELECT 1 FROM documentos_anexos a
            WHERE a.documento_id = d.id AND a.tipo IN (${TIPOS_PROMOVIVEIS})
          )
        ORDER BY d.ano DESC, d.id`
    )
    .all({ minChars: MIN_CHARS_TEXTO_UTIL });
}

function listarAnexosPromoviveis(documentoId) {
  return db
    .prepare(
      `SELECT id, tipo, nome, url, texto_completo, status_extracao
         FROM documentos_anexos
        WHERE documento_id = ? AND tipo IN (${TIPOS_PROMOVIVEIS})`
    )
    .all(documentoId);
}

async function baixarBuffer(url) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: config.collectorTimeoutMs * 2,
    headers: { 'user-agent': config.collectorUserAgent, accept: '*/*' },
  });
  return Buffer.from(response.data);
}

async function extrairAnexoPendente(anexo) {
  try {
    const buffer = await baixarBuffer(anexo.url);
    const arquivo = await extractOfficialFileText(buffer, { filename: anexo.nome, url: anexo.url });
    const texto = (arquivo.text || '').trim();

    if (!texto) {
      const statusSugerido = arquivo.info?.status_sugerido || STATUS_REQUER_OCR;
      saveDocumentoAnexoTexto({
        id: anexo.id,
        texto: null,
        status: statusSugerido,
        erro: arquivo.error || 'texto vazio',
        parser: arquivo.info?.parser || arquivo.parser,
        paginas: arquivo.pages,
      });
      return { ...anexo, status_extracao: statusSugerido, texto_completo: null };
    }

    const tecnicoVisual = classificarArquivoTecnicoVisual({ nome: anexo.nome, texto, extension: anexo.url });

    saveDocumentoAnexoTexto({
      id: anexo.id,
      texto,
      textoHash: crypto.createHash('sha256').update(texto).digest('hex'),
      status: tecnicoVisual.visual ? STATUS_TECNICO_VISUAL : 'ok',
      erro: null,
      parser: arquivo.info?.parser || arquivo.parser,
      paginas: arquivo.pages,
    });
    return { ...anexo, status_extracao: tecnicoVisual.visual ? STATUS_TECNICO_VISUAL : 'ok', texto_completo: texto };
  } catch (err) {
    saveDocumentoAnexoTexto({ id: anexo.id, texto: null, status: 'erro_pdf', erro: err.message });
    return { ...anexo, status_extracao: 'erro_pdf', texto_completo: null };
  }
}

function promoverTexto(documentoId, anexo) {
  db.prepare(
    `UPDATE documentos
        SET texto_completo = @texto,
            dados_extras = json_set(IFNULL(dados_extras, '{}'),
              '$.texto_origem', 'anexo:' || @anexoId || ':' || IFNULL(@nome, '')),
            atualizado_em = CURRENT_TIMESTAMP
      WHERE id = @id`
  ).run({ id: documentoId, texto: anexo.texto_completo, anexoId: anexo.id, nome: anexo.nome });
}

async function main() {
  const apply = process.argv.includes('--apply');
  setupDatabase();

  const docs = listarDocumentosSemTexto();
  console.warn(`Documentos sem texto com anexos promovíveis: ${docs.length}`);

  let promovidos = 0;
  let semCandidato = 0;
  let anexosExtraidos = 0;
  let anexosOcr = 0;

  for (const doc of docs) {
    const anexos = listarAnexosPromoviveis(doc.id);

    if (apply) {
      for (let i = 0; i < anexos.length; i += 1) {
        if (anexos[i].status_extracao === 'pendente') {
          anexos[i] = await extrairAnexoPendente(anexos[i]);
          anexosExtraidos += 1;
          if (anexos[i].status_extracao === STATUS_REQUER_OCR) {
            anexosOcr += 1;
          }
        }
      }
    }

    const melhor = escolherMelhorTextoAnexo(anexos);
    if (!melhor) {
      semCandidato += 1;
      console.warn(`  doc #${doc.id} (${doc.ano}, ${doc.status_coleta}) — sem anexo aproveitável`);
      continue;
    }

    if (apply) {
      promoverTexto(doc.id, melhor);
    }
    promovidos += 1;
    console.warn(
      `  doc #${doc.id} (${doc.ano}, ${doc.status_coleta}) — texto do anexo #${melhor.id} (${melhor.tipo}, ${(melhor.texto_completo || '').length} chars)`
    );
  }

  console.warn(
    `\n${apply ? 'Aplicado' : 'Dry-run (anexos pendentes só são baixados com --apply)'} — promovidos: ${promovidos} · sem candidato: ${semCandidato} · anexos extraídos: ${anexosExtraidos} (${anexosOcr} p/ fila OCR)`
  );
}

main().catch((error) => {
  console.error(`Falha: ${error.message}`);
  process.exitCode = 1;
});
