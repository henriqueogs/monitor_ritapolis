const { setupDatabase } = require('../src/db/setup');
const { correlateLicitation, CONTRACT_VERSION } = require('../src/ai/correlate-licitation');

function parseArgs(argv) {
  const options = {
    documentoId: null,
    force: false,
    printPayload: false
  };

  argv.forEach((arg) => {
    if (arg === '--force') {
      options.force = true;
      return;
    }

    if (arg === '--print-payload') {
      options.printPayload = true;
      return;
    }

    if (arg.startsWith('--documento-id=')) {
      options.documentoId = Number(arg.split('=')[1]);
    }
  });

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!Number.isFinite(options.documentoId)) {
    throw new Error('Informe --documento-id=N');
  }

  setupDatabase();
  const result = await correlateLicitation(options.documentoId, {
    force: options.force
  });

  console.log(JSON.stringify({
    documento_id: result.documento_id,
    contrato_versao: CONTRACT_VERSION,
    provider: result.provider,
    modelo: result.modelo,
    texto_hash: result.texto_hash,
    reutilizado: result.reutilizado,
    status: result.status,
    confianca: result.confianca,
    leitura_integrada: result.leitura_integrada,
    payload_entrada: options.printPayload ? result.payload_entrada : undefined
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    erro: error.message,
    stack: error.stack
  }, null, 2));
  process.exitCode = 1;
});
