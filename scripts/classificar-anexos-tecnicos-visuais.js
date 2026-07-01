'use strict';

process.loadEnvFile?.() || require('dotenv').config();

const { db } = require('../src/db');
const { STATUS_TECNICO_VISUAL, classificarArquivoTecnicoVisual } = require('../src/parsers/technical-visual');

function readFlag(name, fallback = null) {
  const prefix = `--${name}=`;
  const arg = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function listarAlvos({ documentoId, limite }) {
  const params = {};
  const filtros = [
    "da.status_extracao = 'ok'",
    "IFNULL(da.texto_completo, '') <> ''",
    "lower(IFNULL(da.nome, da.url)) LIKE '%.pdf%'"
  ];

  if (documentoId) {
    filtros.push('da.documento_id = @documentoId');
    params.documentoId = Number(documentoId);
  }

  const limitClause = limite ? 'LIMIT @limite' : '';
  if (limite) {
    params.limite = Math.max(Number(limite), 1);
  }

  return db
    .prepare(
      `SELECT da.id, da.documento_id, da.nome, da.url, da.texto_completo, da.parser, da.paginas
         FROM documentos_anexos da
        WHERE ${filtros.join(' AND ')}
        ORDER BY da.documento_id DESC, da.id ASC
        ${limitClause}`
    )
    .all(params);
}

function aplicarStatus(anexo) {
  return db
    .prepare(
      `UPDATE documentos_anexos
          SET status_extracao = @status,
              atualizado_em = @atualizadoEm
        WHERE id = @id`
    )
    .run({
      id: anexo.id,
      status: STATUS_TECNICO_VISUAL,
      atualizadoEm: new Date().toISOString()
    }).changes || 0;
}

function main() {
  const apply = hasFlag('apply');
  const documentoId = readFlag('documento-id', null);
  const limite = readFlag('limite', null);
  const alvos = listarAlvos({ documentoId, limite });
  const resumo = { analisados: 0, tecnico_visual: 0, atualizados: 0 };

  for (const anexo of alvos) {
    resumo.analisados++;
    const resultado = classificarArquivoTecnicoVisual({
      nome: anexo.nome || anexo.url,
      texto: anexo.texto_completo,
      extension: anexo.url
    });

    if (!resultado.visual) {
      continue;
    }

    resumo.tecnico_visual++;
    if (apply) {
      resumo.atualizados += aplicarStatus(anexo);
    }

    console.log(
      `doc#${anexo.documento_id} anexo#${anexo.id} ${apply ? 'marcado' : 'dry'} ` +
        `score=${resultado.score} sinais=${resultado.sinais.join(',')} ${anexo.nome}`
    );
  }

  console.log(JSON.stringify({ apply, documentoId: documentoId ? Number(documentoId) : null, limite, resumo }, null, 2));
}

main();
