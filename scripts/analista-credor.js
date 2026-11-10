'use strict';

/**
 * Analista IA — protótipo manual (N2). SOMENTE LEITURA: nada é gravado.
 *
 * Uso:
 *   node scripts/analista-credor.js --top 10 [--ano-min 2025]   # credores PJ por valor empenhado
 *   node scripts/analista-credor.js --cnpj <CNPJ>               # mede dossiê/prompt (sem modelo)
 *   node scripts/analista-credor.js --cnpj ... --chamar-modelo  # chama o modelo e verifica
 *   node scripts/analista-credor.js --lote 10 [--ano-min 2025] --saida lote.json
 *                                                               # top N em sequência, JSON p/ revisão
 *   node scripts/analista-credor.js --gravar-de lote.json --so "trecho do titulo|outro" [--apply]
 *                                      # grava em REVISÃO os achados escolhidos (dry-run sem --apply)
 */

process.loadEnvFile?.() || require('dotenv').config();

const { setupDatabase } = require('../src/db/setup');
const repo = require('../src/db/analista-repo');
const { upsertAlerta } = require('../src/db/alertas-repo');
const fs = require('node:fs');
const { achadoParaCandidato } = require('../src/ai/analista/para-candidato');
const { persistirCandidatos } = require('../src/alertas/vertentes/persistencia');
const { analisarCredor, analisarLote } = require('../src/ai/analista/analista-runner');
const { filtrarAnalisaveis, mascararCpf } = require('../src/ai/analista/selecao');

const argumento = nome => {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function rodarLote() {
  const limite = Number(argumento('--lote')) || 10;
  const anoMin = Number(argumento('--ano-min')) || 0;
  const saida = argumento('--saida');
  const credores = filtrarAnalisaveis(
    repo.listarCredoresPorValor({ limite: limite * 10, anoMin }),
    limite
  );
  const provider = require('../src/ai/providers').createAiProvider(process.env); // eslint-disable-line global-require
  const parciais = [];
  const resultados = await analisarLote({
    credores,
    provider,
    aoConcluir: r => {
      parciais.push(r);
      console.warn(`${r.chave} | aceitos ${r.aceitos.length} | ${r.erro || 'ok'}`);
      if (saida) {
        fs.writeFileSync(saida, JSON.stringify(parciais, null, 2));
      }
    },
  });
  console.warn(`lote concluído: ${resultados.length} credores`);
}

function gravarEscolhidos() {
  const resultados = JSON.parse(fs.readFileSync(argumento('--gravar-de'), 'utf8'));
  const termos = String(argumento('--so') || '')
    .split('|')
    .filter(Boolean);
  const ano = new Date().getFullYear();
  const candidatos = resultados.flatMap(resultado =>
    resultado.aceitos
      .filter(a => termos.some(t => a.achado.includes(t)))
      .map(achado => achadoParaCandidato({ resultado, achado, ano }))
  );
  for (const c of candidatos) {
    console.warn(`- ${c.titulo}`);
  }
  const apply = process.argv.includes('--apply');
  const r = persistirCandidatos(candidatos, { upsert: upsertAlerta, dryRun: !apply });
  console.warn(`${candidatos.length} selecionados | gravados ${r.gravados} | falhas ${r.falhas}`);
}

async function main() {
  setupDatabase();
  if (process.argv.includes('--gravar-de')) {
    gravarEscolhidos();
    return;
  }
  if (process.argv.includes('--lote')) {
    await rodarLote();
    return;
  }
  if (process.argv.includes('--top')) {
    const limite = Number(argumento('--top')) || 10;
    const anoMin = Number(argumento('--ano-min')) || 0;
    // Busca mais que o pedido: folha, INSS, entidades e PF saem e ainda sobram `limite`.
    const candidatos = repo.listarCredoresPorValor({ limite: limite * 10, anoMin });
    for (const c of filtrarAnalisaveis(candidatos, limite)) {
      console.warn(`${c.cnpj} | ${mascararCpf(c.nome)} | ${c.empenhos} empenhos | R$ ${c.total}`);
    }
    return;
  }
  const cnpj = argumento('--cnpj');
  if (!cnpj) {
    throw new Error('Informe --top N ou --cnpj <CNPJ>');
  }
  const chamarModelo = process.argv.includes('--chamar-modelo');
  const provider = chamarModelo
    ? require('../src/ai/providers').createAiProvider(process.env) // eslint-disable-line global-require
    : null;
  const r = await analisarCredor({ cnpj, provider, chamarModelo });
  const { aceitos, descartados, ...resumo } = r;
  console.warn(JSON.stringify(resumo, null, 2));
  console.warn(`aceitos: ${aceitos.length} | descartados: ${descartados.length}`);
  for (const a of aceitos) {
    console.warn(`  [OK] (${a.tipo}) ${a.achado}\n       ${a.por_que_suspeito}`);
  }
  for (const d of descartados) {
    console.warn(`  [DESCARTADO] ${d.achado?.achado} -> ${d.motivos.join('; ')}`);
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
