const { getResumoAiStatus } = require('../src/db');

function readFlag(name, fallback) {
  const prefix = `--${name}=`;
  const arg = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function printTable(rows) {
  for (const row of rows) {
    console.log(
      [
        `ano=${row.ano || 'sem_ano'}`,
        `tipo=${row.tipo}`,
        `total=${row.total_documentos}`,
        `ok=${row.com_resumo_ok}`,
        `erro=${row.com_resumo_erro}`,
        `pendentes=${row.sem_resumo_ok}`
      ].join(' | ')
    );
  }
}

function main() {
  const status = getResumoAiStatus({
    ano: readFlag('ano', null),
    tipo: readFlag('tipo', null),
    fonte: readFlag('fonte', null)
  });

  console.log('Resumo geral');
  console.log(
    [
      `total=${status.totais.total_documentos}`,
      `ok=${status.totais.com_resumo_ok}`,
      `erro=${status.totais.com_resumo_erro}`,
      `pendentes=${status.totais.sem_resumo_ok}`
    ].join(' | ')
  );

  console.log('');
  console.log('Por ano e tipo');
  printTable(status.por_ano_tipo);
}

main();
