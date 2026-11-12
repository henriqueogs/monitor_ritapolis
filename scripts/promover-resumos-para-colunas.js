'use strict';

/**
 * Promove datas e valores já extraídos pelo resumo de IA (com trecho citado e confirmado no texto
 * do edital) para as colunas estruturadas: documentos.data_abertura, documentos.valor_estimado e
 * licitacoes_detalhes.data_homologacao. Coluna preenchida nunca é sobrescrita. Sem custo de IA.
 *
 * Uso:
 *   node scripts/promover-resumos-para-colunas.js            # dry-run (conta e mostra amostra)
 *   node scripts/promover-resumos-para-colunas.js --apply    # grava
 */

process.loadEnvFile?.() || require('dotenv').config();

const { setupDatabase } = require('../src/db/setup');
const { listarEditaisComResumos, gravarPromocao } = require('../src/db/promocao-resumo-repo');
const { promoverDoResumo } = require('../src/licitacoes/promover-resumo');

const AMOSTRA = 6;
const CAMPOS = ['data_abertura', 'valor_estimado', 'data_homologacao'];

// O primeiro resumo (o mais novo) que traz cada campo vale; os mais antigos só completam.
function promoverDocumento({ documento, resumos }) {
  const campos = {};
  const recusas = [];
  for (const resumo of resumos) {
    const r = promoverDoResumo({ resumo, documento: { ...documento, ...campos } });
    for (const campo of CAMPOS) {
      if (r[campo] !== undefined && campos[campo] === undefined) {
        campos[campo] = r[campo];
      }
    }
    recusas.push(...r.recusas);
  }
  return { campos, recusas };
}

function main() {
  const apply = process.argv.includes('--apply');
  setupDatabase();
  const total = { abertura: 0, estimado: 0, homologacao: 0, recusadas: 0, gravadas: 0 };
  const amostra = [];
  for (const item of listarEditaisComResumos()) {
    const { campos, recusas } = promoverDocumento(item);
    total.abertura += campos.data_abertura ? 1 : 0;
    total.estimado += campos.valor_estimado ? 1 : 0;
    total.homologacao += campos.data_homologacao ? 1 : 0;
    total.recusadas += recusas.length;
    if (Object.keys(campos).length && amostra.length < AMOSTRA) {
      amostra.push({ documento_id: item.documento.id, ...campos });
    }
    if (apply && Object.keys(campos).length) {
      total.gravadas += gravarPromocao(item.documento.id, campos);
    }
  }
  console.warn(JSON.stringify({ modo: apply ? 'apply' : 'dry-run', ...total, amostra }, null, 2));
}

main();
