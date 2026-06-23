const { setupDatabase } = require('../src/db/setup');
const { syncLicitacoesGrupos } = require('../src/db');

function parseArgs(argv) {
  const options = { ano: new Date().getFullYear() };

  argv.forEach((arg) => {
    if (arg === '--all') {
      options.ano = null;
      return;
    }

    if (arg.startsWith('--ano=')) {
      const ano = Number(arg.split('=')[1]);
      if (Number.isFinite(ano)) {options.ano = ano;}
    }
  });

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  setupDatabase();
  const resultado = syncLicitacoesGrupos({ ano: options.ano });
  console.log(JSON.stringify(resultado, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ erro: error.message, stack: error.stack }, null, 2));
  process.exitCode = 1;
});
