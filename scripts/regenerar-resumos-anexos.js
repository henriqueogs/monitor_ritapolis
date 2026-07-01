'use strict';

/**
 * Regenera o resumo de anexos já extraídos usando o novo pipeline de IA
 * (src/ai/summarize-anexo.js), substituindo o resumo heurístico antigo
 * (contrato "anexo-1.0", primeira-frase) por um resumo real de IA quando o
 * texto tem qualidade suficiente.
 *
 * Reentrante: só regenera anexos que ainda não têm resumo no contrato
 * "anexo-2.0" para o texto_hash atual (a UNIQUE constraint da tabela evita
 * duplicar). Use --force para regenerar mesmo os que já têm.
 *
 * Dry-run por padrão. Uso:
 *   node scripts/regenerar-resumos-anexos.js
 *   node scripts/regenerar-resumos-anexos.js --apply --limite=50
 *   node scripts/regenerar-resumos-anexos.js --apply --force
 *   node scripts/regenerar-resumos-anexos.js --apply --documento=643
 */

process.loadEnvFile?.() || require('dotenv').config();

const { setupDatabase } = require('../src/db/setup');
const { db } = require('../src/db');
const { getAnexoById } = require('../src/db/inteligencia-fatos-repo');
const { summarizeAnexo, CONTRACT_VERSION_IA } = require('../src/ai/summarize-anexo');
const { criarProgresso } = require('../src/utils/progress');

const DELAY_ENTRE_CHAMADAS_IA_MS = 1500; // respeita o orçamento de ~40 req/min da NVIDIA

function parseArgs(argv) {
  const o = { apply: false, force: false, limite: null, documentoId: null };
  for (const a of argv) {
    if (a === '--apply') { o.apply = true; }
    else if (a === '--force') { o.force = true; }
    else if (a.startsWith('--limite=')) { o.limite = Number(a.split('=')[1]); }
    else if (a.startsWith('--documento=')) { o.documentoId = Number(a.split('=')[1]); }
  }
  return o;
}

function listarAlvos(opts) {
  const limitClause = Number.isFinite(opts.limite) && opts.limite > 0 ? `LIMIT ${Math.floor(opts.limite)}` : '';
  const filtroDocumento = opts.documentoId ? 'AND a.documento_id = @documentoId' : '';
  const filtroJaAtualizado = opts.force
    ? ''
    : `AND NOT EXISTS (
         SELECT 1 FROM documentos_anexos_resumos_ai r
          WHERE r.anexo_id = a.id
            AND r.contrato_versao = '${CONTRACT_VERSION_IA}'
            AND r.texto_hash = a.texto_hash
       )`;
  return db
    .prepare(
      `SELECT a.id FROM documentos_anexos a
        WHERE a.status_extracao = 'ok'
          AND IFNULL(a.texto_completo, '') != ''
          ${filtroDocumento}
          ${filtroJaAtualizado}
        ORDER BY a.documento_id DESC, a.id ASC
        ${limitClause}`
    )
    .all(opts.documentoId ? { documentoId: opts.documentoId } : {});
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  setupDatabase();

  const alvos = listarAlvos(opts);
  console.warn(`Anexos a processar: ${alvos.length}${opts.apply ? '' : ' (dry-run)'}`);

  const prog = criarProgresso('regenerar-resumos-anexos', { total: alvos.length });
  const cont = { ia: 0, heuristico: 0, erro: 0 };

  for (let i = 0; i < alvos.length; i += 1) {
    const { id } = alvos[i];
    const tag = `[${i + 1}/${alvos.length}] anexo #${id}`;
    try {
      const anexo = getAnexoById(id);
      if (!anexo || !anexo.texto_completo) {
        cont.erro += 1;
        prog.tick(`${tag} sem texto`, 'erro');
        continue;
      }

      if (!opts.apply) {
        console.warn(`${tag} seria reprocessado (dry-run)`);
        prog.tick(`${tag} dry-run`, 'dry_run');
        continue;
      }

      const resultado = await summarizeAnexo(anexo, { documento: anexo.documento_pai });
      const categoria = resultado.contrato_versao === CONTRACT_VERSION_IA ? 'ia' : 'heuristico';
      cont[categoria] += 1;
      console.warn(`${tag} OK — ${categoria}${resultado.erro ? ` (${resultado.erro})` : ''}`);
      prog.tick(`${tag} ${categoria}`, categoria);

      if (categoria === 'ia') {
        await wait(DELAY_ENTRE_CHAMADAS_IA_MS);
      }
    } catch (err) {
      cont.erro += 1;
      console.error(`${tag} ERRO: ${err.message}`);
      prog.tick(`${tag} erro: ${err.message.slice(0, 60)}`, 'erro');
    }
  }

  const resumo = `IA: ${cont.ia} · heurístico: ${cont.heuristico} · erros: ${cont.erro}`;
  prog.finish(resumo);
  console.warn(`\n${opts.apply ? 'Aplicado' : 'Dry-run'} — ${resumo}`);
}

main().catch((e) => {
  console.error(`Falha: ${e.message}`);
  process.exitCode = 1;
});
