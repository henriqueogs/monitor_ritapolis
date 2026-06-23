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

const axios = require('axios');
const { setupDatabase } = require('../src/db/setup');
const { db } = require('../src/db');
const ColetorSitePrefeitura = require('../src/coletores/site-prefeitura');
const { naoFutura } = require('../src/utils/datas');
const { criarProgresso } = require('../src/utils/progress');
const config = require('../src/config');

// Procedência via arquivo: quando a busca por número não acha na listagem de
// editais (ex.: concursos ficam em outro cadastro), mas o PDF oficial está vivo.
async function urlPdfVivo(url) {
  if (!url || !/^https?:/.test(url)) {
    return false;
  }
  try {
    const r = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: config.collectorTimeoutMs * 2,
      headers: { 'user-agent': config.collectorUserAgent, accept: '*/*' },
    });
    return r.status === 200 && r.data && r.data.byteLength > 1000;
  } catch {
    return false;
  }
}

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
    return db.prepare('SELECT id, numero, tipo, data_publicacao, url_origem, url_pdf, dados_extras FROM documentos WHERE id = ?').all(opts.documentoId);
  }
  const limit = Number.isFinite(opts.limite) && opts.limite > 0 ? `LIMIT ${Math.floor(opts.limite)}` : '';
  const filtroTipo = opts.tipo ? 'AND tipo = @tipo' : '';
  return db
    .prepare(
      `SELECT id, numero, tipo, data_publicacao, url_origem, url_pdf, dados_extras FROM documentos
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
  // Confirmado: reconcilia data + marca status/data de verificação.
  const update = db.prepare(
    `UPDATE documentos
        SET data_publicacao = @dp,
            dados_extras = json_set(
              json_set(IFNULL(dados_extras, '{}'), '$.procedencia_status', 'confirmado'),
              '$.procedencia_verificada_em', @agora),
            atualizado_em = CURRENT_TIMESTAMP
      WHERE id = @id`
  );
  // Registro durável do resultado para os demais casos (não-encontrado etc.).
  const marcarProcedencia = db.prepare(
    `UPDATE documentos
        SET dados_extras = json_set(
              json_set(IFNULL(dados_extras, '{}'), '$.procedencia_status', @status),
              '$.procedencia_verificada_em', @agora)
      WHERE id = @id`
  );

  const prog = criarProgresso('verificar-procedencia', { total: docs.length });
  const cont = { confirmados: 0, confirmado_arquivo: 0, data_reconciliada: 0, nao_encontrados: 0, sem_pagina: 0, erro: 0 };

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
        if (opts.apply) {
          marcarProcedencia.run({ id: d.id, status: 'sem_pagina', agora: new Date().toISOString() });
        }
        prog.tick(`#${d.id} sem pageId`, categoria);
        continue;
      }
      const r = await coletor.verificarProcedenciaPorNumero(d.numero, pageId);
      if (!r.encontrado) {
        // Busca por número não achou — mas se o arquivo oficial está vivo, a
        // procedência existe (concursos ficam em outro cadastro, etc.).
        if (await urlPdfVivo(d.url_pdf)) {
          cont.confirmado_arquivo += 1;
          categoria = 'confirmado_arquivo';
          if (opts.apply) {
            marcarProcedencia.run({ id: d.id, status: 'confirmado_arquivo', agora: new Date().toISOString() });
          }
          console.warn(`${tag} confirmado via ARQUIVO (não está na listagem de editais)`);
          prog.tick(`#${d.id} via arquivo`, categoria);
          continue;
        }
        cont.nao_encontrados += 1;
        categoria = 'nao_encontrado';
        if (opts.apply) {
          marcarProcedencia.run({ id: d.id, status: 'nao_encontrado', agora: new Date().toISOString() });
        }
        console.warn(`${tag} NÃO encontrado na fonte (sem arquivo vivo)`);
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
    `confirmados: ${cont.confirmados} · via arquivo: ${cont.confirmado_arquivo} · data reconciliada: ${cont.data_reconciliada} · não encontrados: ${cont.nao_encontrados} · sem página: ${cont.sem_pagina} · erros: ${cont.erro}`
  );
  console.warn(
    `\n${opts.apply ? 'Aplicado' : 'Dry-run'} — confirmados: ${cont.confirmados} · via arquivo: ${cont.confirmado_arquivo} · data reconciliada: ${cont.data_reconciliada} · não encontrados: ${cont.nao_encontrados} · sem página: ${cont.sem_pagina} · erros: ${cont.erro}`
  );
}

main().catch((e) => {
  console.error(`Falha: ${e.message}`);
  process.exitCode = 1;
});
