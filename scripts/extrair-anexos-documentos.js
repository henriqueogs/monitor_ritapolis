'use strict';

process.loadEnvFile?.() || require('dotenv').config();

const crypto = require('crypto');
const axios = require('axios');
const { db, saveDocumentoAnexoTexto } = require('../src/db');
const { extractOfficialFileText } = require('../src/parsers/document-file');
const { classificarArquivoTecnicoVisual, STATUS_TECNICO_VISUAL } = require('../src/parsers/technical-visual');
const config = require('../src/config');

function readFlag(name, fallback = null) {
  const prefix = `--${name}=`;
  const arg = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function parseIds(value) {
  return String(value || '')
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
}

async function downloadBuffer(url) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: config.collectorTimeoutMs * 2,
    headers: {
      'user-agent': config.collectorUserAgent,
      accept: '*/*'
    }
  });
  return Buffer.from(response.data);
}

function listarAnexos({ documentoIds, force, status }) {
  const params = {};
  const filters = ["da.url LIKE 'http%'"];
  if (documentoIds.length) {
    const placeholders = documentoIds.map((_, index) => `@id${index}`);
    filters.push(`da.documento_id IN (${placeholders.join(',')})`);
    documentoIds.forEach((id, index) => {
      params[`id${index}`] = id;
    });
  }
  if (!force) {
    filters.push("(da.status_extracao IS NULL OR da.status_extracao <> 'ok' OR IFNULL(da.texto_completo, '') = '')");
  }
  if (status) {
    filters.push('da.status_extracao = @status');
    params.status = status;
  }

  return db
    .prepare(
      `SELECT da.id, da.documento_id, da.nome, da.tipo, da.url, da.status_extracao
         FROM documentos_anexos da
        WHERE ${filters.join(' AND ')}
        ORDER BY da.documento_id DESC, da.id ASC`
    )
    .all(params);
}

async function extrairAnexo(anexo, apply) {
  if (!apply) {
    return { ...anexo, status: 'dry_run', chars: 0 };
  }

  try {
    const buffer = await downloadBuffer(anexo.url);
    const arquivo = await extractOfficialFileText(buffer, { filename: anexo.nome, url: anexo.url });
    const texto = (arquivo.text || '').trim();
    if (!texto) {
      const statusSugerido = arquivo.info?.status_sugerido || 'requer_ocr';
      saveDocumentoAnexoTexto({
        id: anexo.id,
        texto: null,
        status: statusSugerido,
        erro: arquivo.error || 'texto vazio',
        parser: arquivo.info?.parser,
        paginas: arquivo.pages
      });
      return { ...anexo, status: statusSugerido, chars: 0 };
    }

    const tecnicoVisual = classificarArquivoTecnicoVisual({ nome: anexo.nome, texto, extension: anexo.url });

    saveDocumentoAnexoTexto({
      id: anexo.id,
      texto,
      textoHash: crypto.createHash('sha256').update(texto, 'utf8').digest('hex'),
      status: tecnicoVisual.visual ? STATUS_TECNICO_VISUAL : 'ok',
      erro: null,
      parser: arquivo.info?.parser,
      paginas: arquivo.pages
    });
    return { ...anexo, status: tecnicoVisual.visual ? STATUS_TECNICO_VISUAL : 'ok', chars: texto.length };
  } catch (error) {
    saveDocumentoAnexoTexto({
      id: anexo.id,
      texto: null,
      status: 'erro_pdf',
      erro: error.message,
      parser: null,
      paginas: null
    });
    return { ...anexo, status: 'erro_pdf', erro: error.message, chars: 0 };
  }
}

async function main() {
  const apply = hasFlag('apply');
  const force = hasFlag('force');
  const status = readFlag('status', null);
  const documentoIds = parseIds(readFlag('documentos', ''));
  const anexos = listarAnexos({ documentoIds, force, status });
  const resumo = { total: anexos.length, ok: 0, requer_ocr: 0, erro: 0, dry_run: 0 };

  for (const anexo of anexos) {
    const result = await extrairAnexo(anexo, apply);
    resumo[result.status] = (resumo[result.status] || 0) + 1;
    console.log(`#${result.documento_id} anexo#${result.id} ${result.tipo} ${result.status} chars=${result.chars || 0} ${result.nome}`);
  }

  console.log(JSON.stringify({ apply, force, status, documentos: documentoIds, resumo }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
