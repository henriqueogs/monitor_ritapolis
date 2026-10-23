'use strict';

/**
 * Gera descobertas internas "sócio que é servidor": sócio (QSA da Receita) de
 * empresa credora com o mesmo nome de servidor na folha, no mesmo ano em que a
 * empresa recebeu empenhos. Grava em 'revisao', só para o admin; nunca é
 * publicável. A saída não imprime nome de pessoa (LGPD) — veja no admin.
 *
 * Uso:
 *   node scripts/gerar-descobertas-socio-servidor.js            # grava
 *   node scripts/gerar-descobertas-socio-servidor.js --dry-run  # só lista sinais
 */

process.loadEnvFile?.() || require('dotenv').config();

const { setupDatabase } = require('../src/db/setup');
const { gerarDescobertasSocioServidor } = require('../src/alertas/socio-servidor-runner');

function main() {
  const dryRun = process.argv.includes('--dry-run');
  setupDatabase();

  const resultado = gerarDescobertasSocioServidor({ dryRun });
  for (const s of resultado.sinais) {
    console.warn(`- ${s.razao_social} (${s.cnpj}) · sócio na folha como ${s.cargo} · ${s.anos.join(', ')} · empenhado ${s.valor_empenhado}`);
  }
  console.warn(
    `${dryRun ? '[dry-run] ' : ''}${resultado.sinais.length} sinal(is), ${resultado.gravados} descoberta(s) gravada(s).`
  );
}

main();
