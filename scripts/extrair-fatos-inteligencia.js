#!/usr/bin/env node
'use strict';

process.loadEnvFile?.() || require('dotenv').config();

const { extrairFatosInteligencia } = require('../src/inteligencia/fatos-runner');

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

function main() {
  const apply = hasFlag('apply');
  const ano = readFlag('ano', null);
  const limite = Number(readFlag('limite', 0)) || null;
  const documentoIds = parseIds(readFlag('documentos', ''));
  const resultado = extrairFatosInteligencia({ ano, documentoIds, limite, apply });

  for (const item of resultado.itens) {
    console.log(
      `#${item.documento_id} fatos=${item.fatos_salvos}/${item.fatos_encontrados} anexos=${item.anexos} resumos=${item.resumos_anexos}`
    );
  }

  const { itens: _itens, ...resumo } = resultado;
  console.log(JSON.stringify(resumo, null, 2));
}

if (require.main === module) {
  main();
}
