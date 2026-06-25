'use strict';

/**
 * Re-parseia as emendas parlamentares já coletadas a partir do texto bruto do
 * documento (documentos.texto_completo), aplicando o parser corrigido.
 *
 * Motivo: as emendas FEDERAIS vêm em LINHA ÚNICA na fonte; o parser antigo
 * (parar no \n) fazia cada campo engolir o registro inteiro (cargo/instrumento/
 * unidade com 260+ chars). O parser novo para no próximo rótulo conhecido.
 *
 * Idempotente (upsert por documento_id). Dry-run por padrão.
 *   node scripts/reparsear-emendas.js            # dry-run
 *   node scripts/reparsear-emendas.js --apply
 */

process.loadEnvFile?.() || require('dotenv').config();

const { setupDatabase } = require('../src/db/setup');
const { db } = require('../src/db');
const { salvarEmendaDetalhes } = require('../src/db/emendas-repo');
const { parseEmendaParlamentar } = require('../src/parsers/emenda-parlamentar');
const { criarProgresso } = require('../src/utils/progress');

const LIMITE_CAMPO_SUJO = 80;

function main() {
  const apply = process.argv.includes('--apply');
  setupDatabase();

  const alvos = db
    .prepare(
      `SELECT e.documento_id, e.esfera, e.cargo_parlamentar, e.instrumento_legal,
              d.titulo, d.texto_completo
         FROM emendas_detalhes e
         JOIN documentos d ON d.id = e.documento_id
        WHERE IFNULL(d.texto_completo, '') <> ''
        ORDER BY e.documento_id`
    )
    .all();

  console.warn(`Emendas a re-parsear: ${alvos.length}${apply ? '' : ' (dry-run)'}`);

  const prog = criarProgresso('reparsear-emendas', { total: alvos.length });
  const cont = { atualizadas: 0, limpas: 0, sem_parse: 0, inalteradas: 0 };

  for (const a of alvos) {
    const eraSujo =
      (a.cargo_parlamentar || '').length > LIMITE_CAMPO_SUJO ||
      (a.instrumento_legal || '').length > LIMITE_CAMPO_SUJO;

    const parsed = parseEmendaParlamentar(a.texto_completo, { titulo: a.titulo });
    if (!parsed) {
      cont.sem_parse += 1;
      prog.tick(`#${a.documento_id} sem parse`, 'sem_parse');
      continue;
    }

    const limpou =
      eraSujo &&
      (parsed.cargo_parlamentar || '').length <= LIMITE_CAMPO_SUJO &&
      (parsed.instrumento_legal || '').length <= LIMITE_CAMPO_SUJO;

    if (apply) {
      salvarEmendaDetalhes(a.documento_id, parsed);
    }
    cont.atualizadas += 1;
    if (limpou) {
      cont.limpas += 1;
    }
    prog.tick(`#${a.documento_id} ${limpou ? 'limpa' : 'ok'}`, limpou ? 'limpa' : 'ok');
  }

  const resumo = `atualizadas: ${cont.atualizadas} · campos sujos limpos: ${cont.limpas} · sem parse: ${cont.sem_parse}`;
  prog.finish(resumo);
  console.warn(`\n${apply ? 'Aplicado' : 'Dry-run'} — ${resumo}`);
}

main();
