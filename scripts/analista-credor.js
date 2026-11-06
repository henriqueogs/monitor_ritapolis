'use strict';

/**
 * Analista IA — protótipo manual (N2). SOMENTE LEITURA: nada é gravado.
 *
 * Uso:
 *   node scripts/analista-credor.js --top 10 [--ano-min 2025]   # credores PJ por valor empenhado
 *   node scripts/analista-credor.js --cnpj 18855014000152       # mede dossiê/prompt (sem modelo)
 *   node scripts/analista-credor.js --cnpj ... --chamar-modelo  # chama o modelo e verifica
 */

process.loadEnvFile?.() || require('dotenv').config();

const { setupDatabase } = require('../src/db/setup');
const repo = require('../src/db/analista-repo');
const { analisarCredor } = require('../src/ai/analista/analista-runner');

const argumento = nome => {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  setupDatabase();
  if (process.argv.includes('--top')) {
    const limite = Number(argumento('--top')) || undefined;
    const anoMin = Number(argumento('--ano-min')) || 0;
    for (const c of repo.listarCredoresPorValor({ limite, anoMin })) {
      console.warn(`${c.cnpj} | ${c.nome} | ${c.empenhos} empenhos | R$ ${c.total}`);
    }
    return;
  }
  const cnpj = argumento('--cnpj');
  if (!cnpj) {throw new Error('Informe --top N ou --cnpj <CNPJ>');}
  const chamarModelo = process.argv.includes('--chamar-modelo');
  const provider = chamarModelo
    ? require('../src/ai/providers').createAiProvider(process.env) // eslint-disable-line global-require
    : null;
  const r = await analisarCredor({ cnpj, provider, chamarModelo });
  const { aceitos, descartados, ...resumo } = r;
  console.warn(JSON.stringify(resumo, null, 2));
  console.warn(`aceitos: ${aceitos.length} | descartados: ${descartados.length}`);
  for (const a of aceitos)
    {console.warn(`  [OK] (${a.tipo}) ${a.achado}\n       ${a.por_que_suspeito}`);}
  for (const d of descartados)
    {console.warn(`  [DESCARTADO] ${d.achado?.achado} -> ${d.motivos.join('; ')}`);}
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
