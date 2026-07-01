const { setupDatabase } = require('../src/db/setup');
const { estruturarProdutosLicitacoes } = require('../src/db');

function parseArgs(argv) {
  const options = {
    ano: new Date().getFullYear(),
    limite: null,
    semProdutos: false,
    sintetico: false
  };

  argv.forEach((arg) => {
    if (arg === '--all') {
      options.ano = null;
      return;
    }

    if (arg === '--sem-produtos') {
      options.semProdutos = true;
      return;
    }

    if (arg === '--sintetico') {
      options.sintetico = true;
      return;
    }

    if (arg.startsWith('--ano=')) {
      const ano = Number(arg.split('=')[1]);
      if (Number.isFinite(ano)) {options.ano = ano;}
      return;
    }

    if (arg.startsWith('--limite=')) {
      const limite = Number(arg.split('=')[1]);
      if (Number.isFinite(limite) && limite > 0) {options.limite = limite;}
    }
  });

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  setupDatabase();

  const result = estruturarProdutosLicitacoes(options);
  console.log(JSON.stringify(result, null, 2));
}

main();
