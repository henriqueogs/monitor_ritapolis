'use strict';

/**
 * Valida os produtos pendentes (e opcionalmente os já rejeitados) conferindo,
 * via IA, os campos extraídos contra o trecho_fonte. Substitui a revisão
 * manual em /admin/qualidade: confere=sim → validado · nao/parcial/erro →
 * sem gravação (nunca auto-rejeita — rejeitar é destrutivo, fica pra humano).
 *
 * Uso:
 *   node scripts/validar-produtos-ia.js                            # dry-run (amostra de 8)
 *   node scripts/validar-produtos-ia.js --apply
 *   node scripts/validar-produtos-ia.js --apply --limite=50 --concorrencia=5
 *   node scripts/validar-produtos-ia.js --apply --incluir-rejeitados  # da 2a chance com modelo novo
 */

process.loadEnvFile?.() || require('dotenv').config();

const { setupDatabase } = require('../src/db/setup');
const { db } = require('../src/db');
const { setProdutoStatusRevisao } = require('../src/db/produtos-revisao-repo');
const { createAiProvider } = require('../src/ai/providers');
const { validarProdutoComIA } = require('../src/ai/validate-produto');
const { criarProgresso } = require('../src/utils/progress');

function parseArgs(argv) {
  // concorrencia=1 por padrao: testado ao vivo, a conta NVIDIA rate-limita
  // (429) ja em 2 chamadas simultaneas -- nao e limite de req/s, e de
  // requisicao concorrente mesmo. Concorrencia so ajuda se a conta tiver
  // tier mais alto (checar de novo se voltar a dar 429 com concorrencia=1).
  const o = { apply: false, limite: null, delayMs: 600, amostra: 8, concorrencia: 1, incluirRejeitados: false };
  for (const a of argv) {
    if (a === '--apply') {o.apply = true;}
    else if (a === '--incluir-rejeitados') {o.incluirRejeitados = true;}
    else if (a.startsWith('--limite=')) {o.limite = Number(a.split('=')[1]);}
    else if (a.startsWith('--delay-ms=')) {o.delayMs = Number(a.split('=')[1]);}
    else if (a.startsWith('--amostra=')) {o.amostra = Number(a.split('=')[1]);}
    else if (a.startsWith('--concorrencia=')) {o.concorrencia = Math.max(1, Number(a.split('=')[1]));}
  }
  return o;
}

function listarCandidatos(limite, incluirRejeitados) {
  const limitClause = Number.isFinite(limite) && limite > 0 ? `LIMIT ${Math.floor(limite)}` : '';
  const statusIn = incluirRejeitados ? "('pendente', 'rejeitado')" : "('pendente')";
  return db
    .prepare(
      `SELECT id, descricao, unidade, quantidade, valor_unitario_final, valor_total_final,
              fornecedor_nome, trecho_fonte, confianca
         FROM licitacoes_produtos
        WHERE status_revisao IN ${statusIn}
          AND trecho_fonte IS NOT NULL AND LENGTH(trecho_fonte) > 10
        ORDER BY IFNULL(confianca, 0) ASC, id
        ${limitClause}`
    )
    .all();
}

const aguardar = (ms) => new Promise((r) => setTimeout(r, ms));

// Limitador de concorrência sem dependência (p-limit@7 é ESM-only, quebra
// com require() no resto do projeto, que é CommonJS). N workers puxam da
// mesma fila até esvaziar -- suficiente pro caso de uso, sem fila de espera
// FIFO sofisticada.
async function mapComConcorrencia(itens, n, fn) {
  let cursor = 0;
  async function worker() {
    while (cursor < itens.length) {
      const i = cursor;
      cursor += 1;
      await fn(itens[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, worker));
}

// Retry com backoff só pra 429 (rate limit) -- outros erros (410 modelo
// morto, JSON invalido, timeout) nao adianta retentar, e falha rapido.
async function validarComRetry(p, { provider, tentativas = 4 }) {
  for (let tentativa = 1; tentativa <= tentativas; tentativa += 1) {
    try {
      return await validarProdutoComIA(p, { provider });
    } catch (err) {
      const rateLimited = /429/.test(err.message);
      if (!rateLimited || tentativa === tentativas) {throw err;}
      await aguardar(1000 * 2 ** tentativa);
    }
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  setupDatabase();

  const candidatos = listarCandidatos(opts.apply ? opts.limite : opts.amostra, opts.incluirRejeitados);
  const semTrecho = db
    .prepare("SELECT COUNT(*) n FROM licitacoes_produtos WHERE status_revisao='pendente' AND (trecho_fonte IS NULL OR LENGTH(trecho_fonte)<=10)")
    .get().n;

  const rotulo = opts.incluirRejeitados ? 'pendentes + rejeitados' : 'pendentes';
  console.warn(`Produtos ${rotulo} com trecho a validar: ${candidatos.length}${opts.apply ? '' : ' (amostra dry-run)'}`);
  if (semTrecho) {
    console.warn(`(${semTrecho} pendentes SEM trecho_fonte ficam para revisão manual — não dá para conferir contra a fonte.)`);
  }

  const provider = createAiProvider();
  const contagem = { validado: 0, rejeitado: 0, pendente: 0, erro: 0 };
  const prog = criarProgresso('validar-produtos-ia', { total: candidatos.length });
  let concluidos = 0;

  async function processar(p) {
    // Serial (concorrencia=1) mantém o pacing por delay entre chamadas, como
    // antes. Com concorrencia>1, o próprio limite de chamadas simultâneas já
    // regula a taxa contra a API — delay adicional só atrasaria à toa.
    if (opts.concorrencia === 1 && concluidos > 0) {await aguardar(opts.delayMs);}
    concluidos += 1;
    const tag = `[${concluidos}/${candidatos.length}] #${p.id}`;
    let categoria = 'erro';
    let info = `#${p.id}`;
    try {
      const veredito = await validarComRetry(p, { provider });
      contagem[veredito.status] += 1;
      categoria = veredito.status;
      info = `#${p.id} ${veredito.status}`;
      console.warn(`${tag} ${veredito.status.toUpperCase()} — ${(p.descricao || '').slice(0, 40)} :: ${veredito.motivo.slice(0, 60)}`);
      // Integridade: só AUTO-VALIDA. "rejeitado"/"parcial" ficam como estavam —
      // rejeitar é decisão destrutiva (descartar dado real) e a IA erra em
      // ambiguidades numéricas, então nunca auto-rejeitamos (nem revalida um
      // rejeitado pra rejeitado de novo: já está nesse estado, não precisa).
      if (opts.apply && veredito.status === 'validado') {
        setProdutoStatusRevisao(p.id, 'validado');
      }
    } catch (err) {
      contagem.erro += 1;
      info = `#${p.id} ERRO: ${err.message.slice(0, 60)}`;
      console.error(`${tag} ERRO: ${err.message}`);
    }
    prog.tick(info, categoria);
  }

  await mapComConcorrencia(candidatos, opts.concorrencia, processar);
  prog.finish(`validados: ${contagem.validado} · rejeitados: ${contagem.rejeitado} · pendentes: ${contagem.pendente} · erros: ${contagem.erro}`);

  console.warn(
    `\n${opts.apply ? 'Aplicado' : 'Dry-run'} — auto-validados: ${contagem.validado} · suspeitos (ficam como estavam): ${contagem.rejeitado} · ambíguos (ficam como estavam): ${contagem.pendente} · erros: ${contagem.erro}`
  );
  console.warn('Apenas "validado" é gravado; suspeitos/ambíguos seguem como estavam para a tela /admin/qualidade.');
  if (!opts.apply) {console.warn('Rode com --apply para gravar.');}
}

main().catch((e) => {
  console.error(`Falha: ${e.message}`);
  process.exitCode = 1;
});
