const { setupDatabase } = require('../src/db/setup');
const { validarProdutosLicitacoesValores } = require('../src/db');

function parseArgs(argv) {
  const options = {
    ano: new Date().getFullYear(),
    documentoId: null,
    incluirUnitarios: false,
    toleranciaAbs: 1,
    toleranciaPct: 0.01
  };

  argv.forEach((arg) => {
    if (arg === '--all') {
      options.ano = null;
      return;
    }

    if (arg === '--todos') {
      options.incluirUnitarios = true;
      return;
    }

    if (arg.startsWith('--ano=')) {
      const ano = Number(arg.split('=')[1]);
      if (Number.isFinite(ano)) {options.ano = ano;}
      return;
    }

    if (arg.startsWith('--documento=')) {
      const documentoId = Number(arg.split('=')[1]);
      if (Number.isFinite(documentoId)) {options.documentoId = documentoId;}
      return;
    }

    if (arg.startsWith('--tolerancia-abs=')) {
      const toleranciaAbs = Number(arg.split('=')[1]);
      if (Number.isFinite(toleranciaAbs) && toleranciaAbs >= 0) {options.toleranciaAbs = toleranciaAbs;}
      return;
    }

    if (arg.startsWith('--tolerancia-pct=')) {
      const toleranciaPct = Number(arg.split('=')[1]);
      if (Number.isFinite(toleranciaPct) && toleranciaPct >= 0) {options.toleranciaPct = toleranciaPct;}
    }
  });

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  setupDatabase();

  const resultado = validarProdutosLicitacoesValores(options);
  console.log(JSON.stringify(resultado, null, 2));
}

main();
