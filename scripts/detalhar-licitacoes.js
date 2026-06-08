const { estruturarDetalhesLicitacoes } = require('../src/db');

const args = process.argv.slice(2);
const getArgValue = (name) => {
  const prefix = `--${name}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
};

const ano = getArgValue('ano') || new Date().getFullYear();
const limite = getArgValue('limite');

const resultado = estruturarDetalhesLicitacoes({
  ano: ano ? Number(ano) : null,
  limite: limite ? Number(limite) : null
});

console.log(JSON.stringify(resultado, null, 2));
