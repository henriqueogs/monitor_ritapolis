'use strict';

/**
 * Probe (somente leitura, nada é gravado): verifica se a API SH3 do Portal da
 * Transparência responde para exercícios anteriores a 2023 (hoje ANO_INICIO=2023
 * em src/coletores/portal-transparencia.js). Amostra uma janela semanal por
 * trimestre de cada ano e conta empenhos retornados.
 *
 * Uso: node scripts/testar-sh3-anos-anteriores.js [--anos=2019,2020,2021,2022]
 * Se houver dados, o backfill vira tarefa própria (mover ANO_INICIO pra config).
 */

const BASE_URL = 'https://pt.ritapolis.mg.gov.br';
const UNIDADE_GESTORA_PREFEITURA = 1;
const ANOS_DEFAULT = [2019, 2020, 2021, 2022];
// Uma semana por trimestre é suficiente pra provar existência de dados
const JANELAS_AMOSTRA = [
  ['-02-01', '-02-07'],
  ['-05-01', '-05-07'],
  ['-08-01', '-08-07'],
  ['-11-01', '-11-07'],
];
const TIMEOUT_MS = 90000;
const PAUSA_MS = 1000;

function readAnos() {
  const arg = process.argv.slice(2).find((item) => item.startsWith('--anos='));
  if (!arg) {return ANOS_DEFAULT;}
  return arg
    .slice('--anos='.length)
    .split(',')
    .map(Number)
    .filter(Number.isInteger);
}

async function consultarJanela(exercicio, ini, fim) {
  const params = new URLSearchParams({
    exercicio: String(exercicio),
    unidade_gestora: String(UNIDADE_GESTORA_PREFEITURA),
    data_do_empenho_inicial: ini,
    data_do_empenho_final: fim,
  });
  const resposta = await fetch(`${BASE_URL}/api/relatorios/despesa?${params}`, {
    headers: {
      accept: 'application/json',
      referer: `${BASE_URL}/Tempo_Real_Despesa`,
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!resposta.ok) {return { erro: `http_${resposta.status}` };}
  const json = await resposta.json();
  if (json.erros?.length) {return { erro: json.erros.map((e) => e.titulo).join('; ') };}
  return { registros: json.resultado?.despesas?.length ?? 0 };
}

function pausar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const anos = readAnos();
  console.log(`Probe SH3 — exercícios ${anos.join(', ')} (1 semana por trimestre)\n`);

  const resumo = [];
  for (const ano of anos) {
    let total = 0;
    const erros = [];
    for (const [ini, fim] of JANELAS_AMOSTRA) {
      // eslint-disable-next-line no-await-in-loop
      const r = await consultarJanela(ano, `${ano}${ini}`, `${ano}${fim}`);
      if (r.erro) {erros.push(`${ano}${ini}: ${r.erro}`);}
      else {total += r.registros;}
      console.log(`  ${ano}${ini} → ${r.erro ? `ERRO ${r.erro}` : `${r.registros} empenhos`}`);
      // eslint-disable-next-line no-await-in-loop
      await pausar(PAUSA_MS);
    }
    resumo.push({ ano, amostra_empenhos: total, erros: erros.length });
  }

  console.log('\nResumo:');
  for (const r of resumo) {
    const veredito =
      r.amostra_empenhos > 0 ? 'TEM DADOS — backfill viável' : r.erros > 0 ? 'erros — reavaliar' : 'sem dados na amostra';
    console.log(`  ${r.ano}: ${r.amostra_empenhos} empenhos na amostra, ${r.erros} erros → ${veredito}`);
  }
}

main();
