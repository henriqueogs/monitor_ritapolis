'use strict';

/**
 * Verificador de procedência por número (Prefeitura). Consulta a fonte oficial ao
 * vivo pelo número do processo (endpoint ws_consulta) e confronta com o que está
 * gravado: confirma que o documento segue publicado e reconcilia a data de
 * publicação (datahora do anexo). O CMS não tem permalink por processo — esta é a
 * forma de provar a procedência sob demanda.
 *
 * Reentrante. Dry-run por padrão. Uso:
 *   node scripts/verificar-procedencia.js --documento-id=643
 *   node scripts/verificar-procedencia.js --documento-id=643 --apply
 *   node scripts/verificar-procedencia.js --tipo=edital --limite=20 --apply
 */

process.loadEnvFile?.() || require('dotenv').config();

const { setupDatabase } = require('../src/db/setup');
const { db } = require('../src/db');
const ColetorSitePrefeitura = require('../src/coletores/site-prefeitura');
const { naoFutura } = require('../src/utils/datas');
const { criarProgresso } = require('../src/utils/progress');

function parseArgs(argv) {
  const o = { apply: false, documentoId: null, tipo: null, limite: null };
  for (const a of argv) {
    if (a === '--apply') { o.apply = true; }
    else if (a.startsWith('--documento-id=')) { o.documentoId = Number(a.split('=')[1]); }
    else if (a.startsWith('--tipo=')) { o.tipo = a.split('=')[1]; }
    else if (a.startsWith('--limite=')) { o.limite = Number(a.split('=')[1]); }
  }
  return o;
}

function pageIdDeOrigem(urlOrigem) {
  const m = String(urlOrigem || '').match(/\/pagina\/(\d+)\b/);
  return m ? Number(m[1]) : null;
}

function listar(opts) {
  if (opts.documentoId) {
    return db.prepare('SELECT id, numero, tipo, data_publicacao, url_origem, dados_extras FROM documentos WHERE id = ?').all(opts.documentoId);
  }
  const limit = Number.isFinite(opts.limite) && opts.limite > 0 ? `LIMIT ${Math.floor(opts.limite)}` : '';
  const filtroTipo = opts.tipo ? 'AND tipo = @tipo' : '';
  return db
    .prepare(
      `SELECT id, numero, tipo, data_publicacao, url_origem, dados_extras FROM documentos
        WHERE fonte = 'site_prefeitura' AND numero IS NOT NULL
          AND url_origem LIKE '%/pagina/%' ${filtroTipo}
        ORDER BY id DESC ${limit}`
    )
    .all(opts.tipo ? { tipo: opts.tipo } : {});
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  setupDatabase();

  const docs = listar(opts);
  console.warn(`Documentos a verificar: ${docs.length}${opts.apply ? '' : ' (dry-run)'}`);

  const coletor = new ColetorSitePrefeitura();
  const update = db.prepare(
    `UPDATE documentos
        SET data_publicacao = @dp,
            dados_extras = json_set(IFNULL(dados_extras, '{}'), '$.procedencia_verificada_em', @agora),
            atualizado_em = CURRENT_TIMESTAMP
      WHERE id = @id`
  );

  const prog = criarProgresso('verificar-procedencia', { total: docs.length });
  const cont = { confirmados: 0, data_reconciliada: 0, nao_encontrados: 0, sem_pagina: 0, erro: 0 };

  for (let i = 0; i < docs.length; i += 1) {
    const d = docs[i];
    const tag = `[${i + 1}/${docs.length}] #${d.id} ${d.numero}`;
    let categoria = 'confirmado';
    let info = `#${d.id}`;
    try {
      const pageId = pageIdDeOrigem(d.url_origem);
      if (!pageId) {
        cont.sem_pagina += 1;
        categoria = 'sem_pagina';
        prog.tick(`#${d.id} sem pageId`, categoria);
        continue;
      }
      const r = await coletor.verificarProcedenciaPorNumero(d.numero, pageId);
      if (!r.encontrado) {
        cont.nao_encontrados += 1;
        categoria = 'nao_encontrado';
        console.warn(`${tag} NÃO encontrado na fonte (pode ter saído do ar)`);
        prog.tick(`#${d.id} não encontrado`, categoria);
        continue;
      }

      const dpFonte = naoFutura(r.registro.dataPublicacao);
      const divergeData = dpFonte && dpFonte !== d.data_publicacao;
      cont.confirmados += 1;
      if (divergeData) {
        cont.data_reconciliada += 1;
        info = `#${d.id} OK · data ${d.data_publicacao || 'null'} → ${dpFonte}`;
      } else {
        info = `#${d.id} OK`;
      }
      console.warn(`${tag} CONFIRMADO na fonte${divergeData ? ` · data → ${dpFonte}` : ''} (atualização fonte: ${r.atualizadoEmFonte || '—'})`);
      if (opts.apply) {
        update.run({ id: d.id, dp: divergeData ? dpFonte : d.data_publicacao, agora: new Date().toISOString() });
      }
    } catch (err) {
      cont.erro += 1;
      categoria = 'erro';
      info = `#${d.id} ERRO: ${err.message.slice(0, 60)}`;
      console.error(`${tag} ERRO: ${err.message}`);
    }
    prog.tick(info, categoria);
  }

  prog.finish(
    `confirmados: ${cont.confirmados} · data reconciliada: ${cont.data_reconciliada} · não encontrados: ${cont.nao_encontrados} · sem página: ${cont.sem_pagina} · erros: ${cont.erro}`
  );
  console.warn(
    `\n${opts.apply ? 'Aplicado' : 'Dry-run'} — confirmados: ${cont.confirmados} · data reconciliada: ${cont.data_reconciliada} · não encontrados: ${cont.nao_encontrados} · sem página: ${cont.sem_pagina} · erros: ${cont.erro}`
  );
}

main().catch((e) => {
  console.error(`Falha: ${e.message}`);
  process.exitCode = 1;
});
