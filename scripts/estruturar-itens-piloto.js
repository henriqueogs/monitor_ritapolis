'use strict';

/**
 * Piloto da reextração de itens via IA — roda numa amostra pequena (docs
 * conhecidos-problemáticos + amostra aleatória com/sem lote) e imprime a
 * saída completa pra inspeção manual antes de decidir escalar (Fase G).
 * NÃO enfileira job nem persiste por padrão — roda direto e mostra o
 * resultado. Use --apply pra persistir os resultados do piloto também.
 *
 * Uso:
 *   node scripts/estruturar-itens-piloto.js              # amostra padrão
 *   node scripts/estruturar-itens-piloto.js --documentos=5,605,321
 *   node scripts/estruturar-itens-piloto.js --apply       # também persiste
 */

process.loadEnvFile?.() || require('dotenv').config();

const { setupDatabase } = require('../src/db/setup');
const { getDocumentoById } = require('../src/db');
const { estruturarItensProcesso, gerarItensProcesso, listarAtasDoDocumento } = require('../src/ai/estruturar-itens-processo');
const { createAiProvider } = require('../src/ai/providers');

// Casos conhecidos: doc 5 (registro de preços por lote, teto homologado),
// doc 605 (cronograma de medição de obra — NÃO é lista de itens), + amostra
// com lote (11,39,46,62) e sem lote (191,391,202,163,90).
const DOCUMENTOS_PADRAO = [5, 605, 11, 39, 46, 62, 191, 391, 202, 163, 90];

function readFlag(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

function resumoLinha(label, valor) {
  console.log(`  ${label}: ${valor}`);
}

async function rodarUm(documentoId, provider, apply) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Documento #${documentoId}`);
  console.log('='.repeat(70));

  const documento = getDocumentoById(documentoId);
  if (!documento) {
    console.log('  [ERRO] documento não encontrado');
    return { documentoId, erro: 'nao_encontrado' };
  }
  if (!documento.texto_completo) {
    console.log('  [SKIP] sem texto_completo');
    return { documentoId, erro: 'sem_texto' };
  }

  const atas = listarAtasDoDocumento(documentoId);
  resumoLinha('título', String(documento.titulo || '').slice(0, 80));
  resumoLinha('atas vinculadas', atas.length);

  const inicio = Date.now();
  try {
    const resultado = apply
      ? await estruturarItensProcesso(documento, { provider, atas })
      : await gerarItensProcesso(documento, { provider, atas });

    const ms = Date.now() - inicio;
    const dados = resultado.itens_json;
    resumoLinha('tempo', `${ms}ms`);
    resumoLinha('tem_tabela_itens', dados.tem_tabela_itens);
    resumoLinha('itens_solicitados', dados.itens_solicitados.length);
    resumoLinha('resultado_lotes', dados.resultado_lotes.length);
    resumoLinha('resultado_global', dados.resultado_global ? 'sim' : 'não');
    resumoLinha('confiança', dados.confianca);
    if (dados.lacunas.length) {
      console.log('  lacunas:');
      dados.lacunas.forEach((l) => console.log(`    - ${l}`));
    }
    if (dados.resultado_lotes.length) {
      console.log('  lotes:');
      dados.resultado_lotes.slice(0, 5).forEach((l) =>
        console.log(`    lote ${l.lote_numero || '?'}: ${l.objeto} — ${l.fornecedor_nome || '?'} — R$ ${l.teto_homologado ?? '?'}`)
      );
    }
    return { documentoId, ok: true, ms, ...dados };
  } catch (err) {
    console.log(`  [ERRO] ${err.message}`);
    return { documentoId, erro: err.message };
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const listaFlag = readFlag('documentos');
  const documentos = listaFlag ? listaFlag.split(',').map(Number) : DOCUMENTOS_PADRAO;

  setupDatabase();
  const provider = createAiProvider();
  console.log(`Piloto de reextração de itens — modelo: ${provider.model} | ${documentos.length} documentos | apply=${apply}`);

  const resultados = [];
  for (const id of documentos) {
    // eslint-disable-next-line no-await-in-loop
    const r = await rodarUm(id, provider, apply);
    resultados.push(r);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 1500)); // respeita rate limit
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('RESUMO');
  console.log('='.repeat(70));
  const ok = resultados.filter((r) => r.ok);
  const semTabela = ok.filter((r) => r.tem_tabela_itens === false);
  const comErro = resultados.filter((r) => r.erro);
  console.log(`ok: ${ok.length}/${resultados.length} | tem_tabela_itens=false: ${semTabela.length} | erro: ${comErro.length}`);
  if (semTabela.length) {
    console.log('Documentos sem tabela de itens (verificar se é o esperado, ex: doc 605):');
    semTabela.forEach((r) => console.log(`  #${r.documentoId}`));
  }
  if (comErro.length) {
    console.log('Documentos com erro:');
    comErro.forEach((r) => console.log(`  #${r.documentoId}: ${r.erro}`));
  }
}

main().catch((err) => {
  console.error('Piloto falhou:', err);
  process.exitCode = 1;
});
