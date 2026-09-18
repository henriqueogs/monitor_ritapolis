'use strict';

/**
 * Valida uma amostra de deep-links do Portal da Transparência contra o portal
 * real: monta a URL com o builder canônico, faz o request com User-Agent de
 * navegador (o portal responde 403 sem ele) e confere se o número do empenho
 * aparece no HTML retornado.
 *
 * Uso: node scripts/validar-links-portal.js [--por-grupo=N]
 * Amostra estratificada: N empenhos por (exercício × OP/não-OP).
 */

const { DatabaseSync } = require('node:sqlite');
const config = require('../src/config');
const { buildPortalDespesaLink } = require('../src/transparencia/portal-links');

const POR_GRUPO_DEFAULT = 2;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const TIMEOUT_MS = 20000;
const PAUSA_ENTRE_REQUESTS_MS = 800;

function readFlag(name, fallback) {
  const prefix = `--${name}=`;
  const arg = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return arg ? Number(arg.slice(prefix.length)) : fallback;
}

function coletarAmostra(porGrupo) {
  const db = new DatabaseSync(config.dbPath, { readOnly: true });
  db.exec('PRAGMA query_only = ON;');
  const amostra = db
    .prepare(
      `SELECT empenho, exercicio_orcamento, tipo FROM (
         SELECT empenho, exercicio_orcamento, tipo,
                ROW_NUMBER() OVER (
                  PARTITION BY exercicio_orcamento, (tipo LIKE 'OP%')
                  ORDER BY RANDOM()
                ) AS rn
         FROM transparencia_despesas
       ) WHERE rn <= ?
       ORDER BY exercicio_orcamento DESC`
    )
    .all(porGrupo);
  db.close();
  return amostra;
}

function pausar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function validarLink(despesa) {
  const { url, especifico } = buildPortalDespesaLink({
    empenho: despesa.empenho,
    exercicio: despesa.exercicio_orcamento,
    tipo: despesa.tipo,
  });
  if (!especifico) {
    return { ...despesa, url, status: 'fallback', ok: false };
  }

  try {
    const resposta = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!resposta.ok) {
      return { ...despesa, url, status: `http_${resposta.status}`, ok: false };
    }
    const html = await resposta.text();
    const contemEmpenho = html.includes(despesa.empenho);
    return { ...despesa, url, status: contemEmpenho ? 'ok' : 'sem_empenho_no_html', ok: contemEmpenho };
  } catch (err) {
    return { ...despesa, url, status: `erro: ${err.message}`, ok: false };
  }
}

/**
 * Núcleo reutilizável (sem console.log) -- usado pelo CLI abaixo e pelo
 * daily-scheduler (amostra menor, periódica, ver src/coletas/daily-scheduler.js).
 * @returns {{ porGrupo: number, resultados: Array, falhas: number }}
 */
async function validarAmostra(porGrupo = POR_GRUPO_DEFAULT) {
  const amostra = coletarAmostra(porGrupo);
  const resultados = [];
  let falhas = 0;

  for (const despesa of amostra) {
    // eslint-disable-next-line no-await-in-loop
    const resultado = await validarLink(despesa);
    resultados.push(resultado);
    if (!resultado.ok) {falhas += 1;}
    // eslint-disable-next-line no-await-in-loop
    await pausar(PAUSA_ENTRE_REQUESTS_MS);
  }

  return { porGrupo, resultados, falhas };
}

async function main() {
  const porGrupo = readFlag('por-grupo', POR_GRUPO_DEFAULT);
  console.log(`Validando deep-links (${porGrupo} por exercício × tipo)…\n`);

  const { resultados, falhas } = await validarAmostra(porGrupo);
  for (const resultado of resultados) {
    console.log(
      `${resultado.ok ? '✓' : '✗'} ${resultado.exercicio_orcamento} ${resultado.empenho} ` +
        `(${(resultado.tipo || '').slice(0, 2)}) → ${resultado.status}`
    );
    if (!resultado.ok) {console.log(`   ${resultado.url}`);}
  }

  console.log(`\n${resultados.length - falhas}/${resultados.length} links válidos.`);
  if (falhas > 0) {
    console.error('Falhas encontradas — o portal pode ter mudado o contrato de URL.');
    process.exitCode = 1;
  }
}

module.exports = { validarAmostra };

if (require.main === module) {
  main();
}
