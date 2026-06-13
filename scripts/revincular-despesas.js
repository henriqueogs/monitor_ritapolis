'use strict';

/**
 * Re-vincula despesas ↔ edital com correspondência EXATA de modalidade
 * (tipo + número + ano) e recompõe os vencedores derivados de empenho.
 *
 * Corrige o crosswalk antigo (LIKE de número solto), que casava o número da
 * modalidade com o número do processo e ignorava o tipo — ~46% dos empenhos
 * vinculados estavam no edital errado, contaminando "licitado vs pago" e o
 * dossiê de fornecedor.
 *
 * Etapas:
 *   1. crosswalk relink: limpa documento_id e reconstrói por match exato.
 *   2. reset dos vencedores origem='portal_transparencia' (derivados do crosswalk).
 *   3. enriquecerDetalhesComEmpenhos: re-deriva vencedor a partir dos links corretos.
 *
 * Uso:
 *   node scripts/revincular-despesas.js            # dry-run (só relatório)
 *   node scripts/revincular-despesas.js --apply
 */

const { setupDatabase } = require('../src/db/setup');
const { db } = require('../src/db');
const {
  crosswalkDespesasDocumentos,
  enriquecerDetalhesComEmpenhos,
} = require('../src/db/transparencia-repo');
const { parseModalidadeDespesa, parseModalidadeEdital } = require('../src/licitacoes/modalidade');

// Conta links cujo tipo de modalidade da despesa diverge do tipo do edital
// vinculado — proxy de links falsos.
function contarLinksDivergentes() {
  const rows = db
    .prepare(
      `SELECT td.modalidade desp_mod, d.titulo
         FROM transparencia_despesas td
         JOIN documentos d ON d.id = td.documento_id
        WHERE td.documento_id IS NOT NULL`
    )
    .all();

  let total = 0;
  let divergentes = 0;
  for (const r of rows) {
    const desp = parseModalidadeDespesa(r.desp_mod);
    const edital = parseModalidadeEdital(r.titulo);
    if (!desp || !edital) {
      continue;
    }
    total += 1;
    if (desp.tipo !== edital.tipo) {
      divergentes += 1;
    }
  }
  return { total, divergentes };
}

function snapshot(rotulo) {
  const links = db.prepare('SELECT COUNT(*) n FROM transparencia_despesas WHERE documento_id IS NOT NULL').get().n;
  const { total, divergentes } = contarLinksDivergentes();
  const venc = db
    .prepare("SELECT COUNT(*) n FROM licitacoes_detalhes WHERE origem = 'portal_transparencia' AND vencedor_nome IS NOT NULL")
    .get().n;
  console.warn(
    `[${rotulo}] empenhos vinculados: ${links} · tipo divergente: ${divergentes}/${total} · vencedores via empenho: ${venc}`
  );
}

function main() {
  const apply = process.argv.includes('--apply');
  setupDatabase();

  snapshot('antes');

  if (!apply) {
    console.warn('\nDry-run. Rode com --apply para re-vincular.');
    return;
  }

  db.exec('BEGIN');
  try {
    const vinculados = crosswalkDespesasDocumentos({ relink: true });
    // Zera vencedores derivados do crosswalk antigo para re-derivar dos links corretos
    db.prepare(
      `UPDATE licitacoes_detalhes
          SET vencedor_nome = NULL, vencedor_cnpj = NULL, valor_final = NULL,
              origem = NULL, origem_detalhe = NULL, atualizado_em = CURRENT_TIMESTAMP
        WHERE origem = 'portal_transparencia'`
    ).run();
    db.exec('COMMIT');
    console.warn(`\nRe-vinculados (match exato): ${vinculados} empenhos.`);
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const enriquecidos = enriquecerDetalhesComEmpenhos();
  console.warn(`Vencedores re-derivados dos empenhos: ${enriquecidos}`);

  snapshot('depois');
}

main();
