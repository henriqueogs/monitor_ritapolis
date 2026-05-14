const config = require('../src/config');
const {
  getDocumentoById,
  getResumoAiByDocumentoHash
} = require('../src/db');
const { getAiOperationPlan } = require('../src/ai/operation-policy');
const { summarizeDocument, buildTextoHash } = require('../src/ai/summarize-document');

function readFlag(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

function hasFlag(name) {
  return process.argv.slice(2).includes(`--${name}`);
}

async function main() {
  const documentoId = Number(readFlag('documento-id'));
  if (!documentoId) {
    throw new Error('Uso: npm run ai:resumir -- --documento-id=ID [--dry-run] [--force]');
  }

  if (hasFlag('dry-run')) {
    const documento = getDocumentoById(documentoId);
    if (!documento) {
      throw new Error(`Documento ${documentoId} nao encontrado`);
    }
    if (!documento.texto_completo) {
      throw new Error(`Documento ${documentoId} nao possui texto_completo para resumir`);
    }

    const textoHash = buildTextoHash(documento.texto_completo);
    const cached = getResumoAiByDocumentoHash(documento.id, textoHash, config.aiContractVersion);
    const operacao = getAiOperationPlan({ texto: documento.texto_completo });

    console.log(`Documento: ${documento.titulo}`);
    console.log(`ID: ${documento.id}`);
    console.log(`Ano: ${documento.ano || 'sem_ano'}`);
    console.log(`Tipo: ${documento.tipo}`);
    console.log(`Caracteres: ${documento.texto_completo.length}`);
    console.log(`Texto hash: ${textoHash}`);
    console.log(`Contrato: ${config.aiContractVersion}`);
    console.log(`Modo previsto: ${operacao.modo}`);
    console.log(`Chunks previstos: ${operacao.chunks_previstos || 0}`);
    console.log(`Cache existente: ${cached ? `${cached.status} (${cached.provider}/${cached.modelo})` : 'nao'}`);
    return;
  }

  const result = await summarizeDocument(documentoId, {
    force: hasFlag('force')
  });

  console.log(`Documento: ${result.titulo}`);
  console.log(`Provider: ${result.provider}`);
  console.log(`Modelo: ${result.modelo}`);
  console.log(`Contrato: ${result.contrato_versao}`);
  console.log(`Reutilizado: ${result.reutilizado ? 'sim' : 'nao'}`);
  console.log(`Confianca: ${result.confianca}`);
  console.log('');
  console.log('Resumo para o cidadao:');
  console.log(result.resumo.resumo_cidadao);
}

main().catch((error) => {
  console.error(`Falha ao resumir documento: ${error.message}`);
  process.exitCode = 1;
});
