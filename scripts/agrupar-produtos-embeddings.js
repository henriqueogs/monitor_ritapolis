'use strict';

/**
 * Agrupa produtos equivalentes por similaridade de embeddings, para comparar o
 * preço unitário do mesmo item ao longo dos anos. Fluxo:
 *   1. Coleta as descrições normalizadas distintas (com peso = nº de itens).
 *   2. Gera embeddings em lote (provider NVIDIA · baai/bge-m3).
 *   3. Agrupa por similaridade de cosseno (limiar configurável).
 *   4. Grava produtos_grupos + grupo_id em licitacoes_produtos.
 *
 * Uso:
 *   node scripts/agrupar-produtos-embeddings.js                 # dry-run (amostra)
 *   node scripts/agrupar-produtos-embeddings.js --limiar=0.88
 *   node scripts/agrupar-produtos-embeddings.js --apply
 */

process.loadEnvFile?.() || require('dotenv').config();

const { setupDatabase } = require('../src/db/setup');
const { db } = require('../src/db');
const { createAiProvider } = require('../src/ai/providers');
const { agruparPorSimilaridade } = require('../src/licitacoes/agrupamento-produtos');

const LOTE_EMBED = 64;

function parseArgs(argv) {
  const opcoes = { limiar: 0.9, apply: false, amostra: 12 };
  for (const arg of argv) {
    if (arg === '--apply') {opcoes.apply = true;}
    else if (arg.startsWith('--limiar=')) {opcoes.limiar = Number(arg.split('=')[1]);}
    else if (arg.startsWith('--amostra=')) {opcoes.amostra = Number(arg.split('=')[1]);}
  }
  return opcoes;
}

function listarDescricoes() {
  return db
    .prepare(
      `SELECT descricao_normalizada AS chave, COUNT(*) AS peso
         FROM licitacoes_produtos
        WHERE descricao_normalizada IS NOT NULL AND descricao_normalizada <> ''
        GROUP BY descricao_normalizada`
    )
    .all();
}

async function gerarEmbeddings(provider, chaves) {
  const vetores = [];
  for (let i = 0; i < chaves.length; i += LOTE_EMBED) {
    const lote = chaves.slice(i, i + LOTE_EMBED);
    const resp = await provider.embed(lote);
    vetores.push(...resp);
    process.stderr.write(`\r  embeddings: ${Math.min(i + LOTE_EMBED, chaves.length)}/${chaves.length}`);
  }
  process.stderr.write('\n');
  return vetores;
}

function gravarGrupos(grupos) {
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE licitacoes_produtos SET grupo_id = NULL').run();
    db.prepare('DELETE FROM produtos_grupos').run();

    const insGrupo = db.prepare(
      `INSERT INTO produtos_grupos (rotulo_canonico, n_itens, n_variacoes, metodo)
       VALUES (@rotulo, @n_itens, @n_variacoes, 'embeddings')`
    );
    const setGrupo = db.prepare(
      'UPDATE licitacoes_produtos SET grupo_id = @grupoId WHERE descricao_normalizada = @chave'
    );

    for (const grupo of grupos) {
      const nItens = db
        .prepare(
          `SELECT COUNT(*) n FROM licitacoes_produtos
            WHERE descricao_normalizada IN (${grupo.membros.map(() => '?').join(',')})`
        )
        .get(...grupo.membros).n;

      const info = insGrupo.run({
        rotulo: grupo.representante,
        n_itens: nItens,
        n_variacoes: grupo.membros.length,
      });
      const grupoId = info.lastInsertRowid;
      for (const chave of grupo.membros) {
        setGrupo.run({ grupoId, chave });
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

async function main() {
  const opcoes = parseArgs(process.argv.slice(2));
  setupDatabase();

  const descricoes = listarDescricoes();
  console.warn(`Descrições normalizadas distintas: ${descricoes.length} | limiar=${opcoes.limiar}`);

  const provider = createAiProvider();
  const vetores = await gerarEmbeddings(provider, descricoes.map((d) => d.chave));

  const itens = descricoes.map((d, i) => ({ chave: d.chave, peso: d.peso, vetor: vetores[i] }));
  const grupos = agruparPorSimilaridade(itens, { limiar: opcoes.limiar, guardaNumerica: true });

  const comVariacao = grupos.filter((g) => g.membros.length > 1);
  console.warn(
    `Grupos: ${grupos.length} (${comVariacao.length} com 2+ variações; ${descricoes.length - grupos.length} variações absorvidas)`
  );

  console.warn('\n── Amostra de grupos com mais variações ──');
  [...comVariacao]
    .sort((a, b) => b.membros.length - a.membros.length)
    .slice(0, opcoes.amostra)
    .forEach((g) => {
      console.warn(`\n▸ ${g.representante} (${g.membros.length} variações)`);
      g.membros.slice(0, 6).forEach((m) => console.warn(`    · ${m.slice(0, 70)}`));
      if (g.membros.length > 6) {console.warn(`    … +${g.membros.length - 6}`);}
    });

  if (!opcoes.apply) {
    console.warn('\nDry-run. Nada gravado. Rode com --apply para efetivar.');
    return;
  }

  gravarGrupos(grupos);
  console.warn(`\n${grupos.length} grupos gravados em produtos_grupos.`);
}

main().catch((error) => {
  console.error(`\nFalha: ${error.message}`);
  process.exitCode = 1;
});
