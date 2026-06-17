'use strict';

/**
 * Valida os produtos pendentes conferindo, via IA, os campos extraídos contra o
 * trecho_fonte. Substitui a revisão manual em /admin/qualidade:
 *   confere=sim → validado · nao → rejeitado · parcial/erro → segue pendente.
 *
 * Uso:
 *   node scripts/validar-produtos-ia.js                 # dry-run (amostra de 8)
 *   node scripts/validar-produtos-ia.js --apply
 *   node scripts/validar-produtos-ia.js --apply --limite=50 --delay-ms=800
 */

process.loadEnvFile?.() || require('dotenv').config();

const { setupDatabase } = require('../src/db/setup');
const { db } = require('../src/db');
const { setProdutoStatusRevisao } = require('../src/db/produtos-revisao-repo');
const { createAiProvider } = require('../src/ai/providers');
const { validarProdutoComIA } = require('../src/ai/validate-produto');
const { criarProgresso } = require('../src/utils/progress');

function parseArgs(argv) {
  const o = { apply: false, limite: null, delayMs: 600, amostra: 8 };
  for (const a of argv) {
    if (a === '--apply') {o.apply = true;}
    else if (a.startsWith('--limite=')) {o.limite = Number(a.split('=')[1]);}
    else if (a.startsWith('--delay-ms=')) {o.delayMs = Number(a.split('=')[1]);}
    else if (a.startsWith('--amostra=')) {o.amostra = Number(a.split('=')[1]);}
  }
  return o;
}

function listarPendentes(limite) {
  const limitClause = Number.isFinite(limite) && limite > 0 ? `LIMIT ${Math.floor(limite)}` : '';
  return db
    .prepare(
      `SELECT id, descricao, unidade, quantidade, valor_unitario_final, valor_total_final,
              fornecedor_nome, trecho_fonte, confianca
         FROM licitacoes_produtos
        WHERE status_revisao = 'pendente'
          AND trecho_fonte IS NOT NULL AND LENGTH(trecho_fonte) > 10
        ORDER BY IFNULL(confianca, 0) ASC, id
        ${limitClause}`
    )
    .all();
}

const aguardar = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  setupDatabase();

  const pendentes = listarPendentes(opts.apply ? opts.limite : opts.amostra);
  const semTrecho = db
    .prepare("SELECT COUNT(*) n FROM licitacoes_produtos WHERE status_revisao='pendente' AND (trecho_fonte IS NULL OR LENGTH(trecho_fonte)<=10)")
    .get().n;

  console.warn(`Produtos pendentes com trecho a validar: ${pendentes.length}${opts.apply ? '' : ' (amostra dry-run)'}`);
  if (semTrecho) {
    console.warn(`(${semTrecho} pendentes SEM trecho_fonte ficam para revisão manual — não dá para conferir contra a fonte.)`);
  }

  const provider = createAiProvider();
  const contagem = { validado: 0, rejeitado: 0, pendente: 0, erro: 0 };
  const prog = criarProgresso('validar-produtos-ia', { total: pendentes.length });

  for (let i = 0; i < pendentes.length; i += 1) {
    const p = pendentes[i];
    const tag = `[${i + 1}/${pendentes.length}] #${p.id}`;
    let categoria = 'erro';
    let info = `#${p.id}`;
    try {
      const veredito = await validarProdutoComIA(p, { provider });
      contagem[veredito.status] += 1;
      categoria = veredito.status;
      info = `#${p.id} ${veredito.status}`;
      console.warn(`${tag} ${veredito.status.toUpperCase()} — ${(p.descricao || '').slice(0, 40)} :: ${veredito.motivo.slice(0, 60)}`);
      // Integridade: só AUTO-VALIDA. "rejeitado"/"parcial" ficam pendentes para
      // revisão humana — rejeitar é decisão destrutiva (descartar dado real) e a
      // IA erra em ambiguidades numéricas, então nunca auto-rejeitamos.
      if (opts.apply && veredito.status === 'validado') {
        setProdutoStatusRevisao(p.id, 'validado');
      }
    } catch (err) {
      contagem.erro += 1;
      info = `#${p.id} ERRO: ${err.message.slice(0, 60)}`;
      console.error(`${tag} ERRO: ${err.message}`);
    }
    prog.tick(info, categoria);
    if (i < pendentes.length - 1) {await aguardar(opts.delayMs);}
  }
  prog.finish(`validados: ${contagem.validado} · rejeitados: ${contagem.rejeitado} · pendentes: ${contagem.pendente} · erros: ${contagem.erro}`);

  console.warn(
    `\n${opts.apply ? 'Aplicado' : 'Dry-run'} — auto-validados: ${contagem.validado} · suspeitos p/ revisão humana: ${contagem.rejeitado} · ambíguos (pendente): ${contagem.pendente} · erros: ${contagem.erro}`
  );
  console.warn('Apenas "validado" é gravado; suspeitos/ambíguos seguem pendentes para a tela /admin/qualidade.');
  if (!opts.apply) {console.warn('Rode com --apply para gravar.');}
}

main().catch((e) => {
  console.error(`Falha: ${e.message}`);
  process.exitCode = 1;
});
