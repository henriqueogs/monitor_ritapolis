'use strict';

/**
 * Remove de licitacoes_detalhes o valor_final que foi derivado da soma de
 * empenhos (origem_detalhe `empenho_agregado`, ou legado origem='portal_transparencia'
 * sem origem_detalhe): empenhado não é homologado. O vencedor e a origem permanecem
 * para auditoria. Valores com nome de arquivo em origem_detalhe (ata/contrato) NÃO são
 * tocados.
 *
 * A limpeza é irreversível: com --apply, o script grava ANTES um backup JSON com
 * (documento_id, vencedor, valor_final, origem, origem_detalhe) em data/backups/.
 *
 * Antes de aplicar, rode a reavaliação de plausibilidade de produtos
 * (produtos-plausibilidade-repo): ela usa esse valor como referência
 * ("contexto_empenho") e docs limpos deixam de ser reavaliados.
 *
 * Uso:
 *   node scripts/limpar-valor-final-empenho.js            # dry-run (não grava)
 *   node scripts/limpar-valor-final-empenho.js --apply    # backup + efetiva
 *
 * Depois de aplicar, rode `node scripts/consolidar-fornecedores.js` (ou o scheduler diário)
 * para regravar fornecedores_perfil.
 */

const fs = require('fs');
const path = require('path');
const config = require('../src/config');
const { setupDatabase } = require('../src/db/setup');
const { db } = require('../src/db');
const {
  diagnosticarValorFinalDeEmpenho,
  listarValorFinalDeEmpenho,
  limparValorFinalDeEmpenho,
} = require('../src/transparencia/valor-final-empenho');

function gravarBackup(linhas) {
  const dir = path.join(config.rootDir, 'data', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const arquivo = path.join(dir, `valor-final-empenho-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(arquivo, JSON.stringify(linhas, null, 2));
  return arquivo;
}

function main() {
  const apply = process.argv.includes('--apply');
  setupDatabase();

  const antes = diagnosticarValorFinalDeEmpenho(db);
  console.warn(`valor_final derivado de empenho: ${antes.n} registro(s), R$ ${antes.valor_total}`);

  if (!apply) {
    console.warn('Dry-run: nada gravado. Use --apply para efetivar (grava backup antes).');
    return;
  }
  const backup = gravarBackup(listarValorFinalDeEmpenho(db));
  console.warn(`Backup gravado em ${backup}`);
  const r = limparValorFinalDeEmpenho(db);
  console.warn(`Limpos: ${r.n} registro(s).`);
}

main();
