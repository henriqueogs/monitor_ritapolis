'use strict';

/**
 * Eval de GERAÇÃO da camada de IA (ADR 0005/0006): fundamentação, citações válidas, alucinação,
 * recusa correta, linguagem acusatória e cobertura de fatos, sobre o dataset ouro.
 *
 * Uso:
 *   node scripts/eval-ia.js                              # simulado: embedder falso + LLM simulado fiel (CI/sanidade)
 *   node scripts/eval-ia.js --comportamento alucina      # simulado com outro comportamento (ver llm-simulado.js)
 *   node --env-file=.env scripts/eval-ia.js --real       # modelo real da NVIDIA (poucas chamadas, texto sintético)
 *   ... --salvar relatorios/antes.json                   # grava o relatório JSON
 *   ... --comparar relatorios/antes.json                 # tabela antes/depois e regressões
 *   ... --sem-gate                                       # não falha por limiares (só relata)
 *
 * Código de saída 1 se o gate reprovar ou houver regressão na comparação. Mudou prompt, chunking ou
 * modelo? Rode antes e depois e anexe a comparação ao PR (ADR 0006).
 */

const fs = require('fs');
const path = require('path');
const config = require('../src/config');
const corpus = require('../tests/evals/corpus-fixture.json');
const dataset = require('../tests/evals/dataset-ouro.json');
const { criarFakeEmbeddingProvider } = require('../src/ai/adapters/fake-embedding-provider');
const { criarMemoryVectorStore } = require('../src/ai/vector/memory-vector-store');
const { indexarCorpus, criarRecuperadorVetorial } = require('../src/ai/eval/recuperador-vetorial');
const { verificarLimiares } = require('../src/ai/eval/eval-recuperacao');
const { criarLLMSimulado } = require('../src/ai/eval/llm-simulado');
const {
  rodarEvalGeracao,
  compararRelatorios,
  formatarRelatorioGeracao,
  formatarComparacao,
  MINIMOS_GERACAO,
  MAXIMOS_GERACAO,
} = require('../src/ai/eval/eval-geracao');

const DIMS_PADRAO_REAL = 2048;

function lerArgs(argv) {
  const valor = flag => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    real: argv.includes('--real'),
    semGate: argv.includes('--sem-gate'),
    salvar: valor('--salvar'),
    comparar: valor('--comparar'),
    comportamento: valor('--comportamento') || 'fiel',
    k: valor('--k') ? Number(valor('--k')) : undefined,
  };
}

async function montarModoSimulado(args) {
  return {
    embedder: criarFakeEmbeddingProvider(),
    llm: criarLLMSimulado({ comportamento: args.comportamento }),
  };
}

async function montarModoReal() {
  const OpenAI = require('openai');
  const { criarNvidiaEmbeddingProvider } = require('../src/ai/adapters/nvidia-embedding-provider');
  const { criarLLMProviderCompat } = require('../src/ai/adapters/llm-provider-compat');
  const { createAiProvider } = require('../src/ai/providers');
  const { verificarModelo } = require('../src/ai/ports/embedding-provider');

  const client = new OpenAI({
    apiKey: config.nvidiaApiKey,
    baseURL: config.nvidiaBaseUrl,
    maxRetries: 1,
  });
  const embedder = criarNvidiaEmbeddingProvider({
    client,
    modelo: config.nvidiaEmbedModel,
    dims: Number(process.env.EMBED_DIMS || DIMS_PADRAO_REAL),
  });
  const saude = await verificarModelo(embedder);
  if (!saude.ok) {
    throw new Error(`modelo de embedding indisponível: ${JSON.stringify(saude)}`);
  }
  return { embedder, llm: criarLLMProviderCompat(createAiProvider()) };
}

async function main() {
  const args = lerArgs(process.argv.slice(2));
  const { embedder, llm } = args.real ? await montarModoReal() : await montarModoSimulado(args);

  const store = criarMemoryVectorStore({ dims: embedder.dims, quantizacao: 'int8' });
  await indexarCorpus({ provider: embedder, store, corpus });
  const recuperar = criarRecuperadorVetorial({ provider: embedder, store });

  const relatorio = await rodarEvalGeracao({ dataset, recuperar, llm, k: args.k });
  relatorio.meta.modo = args.real ? 'real' : 'simulado';
  process.stdout.write(`${formatarRelatorioGeracao(relatorio)}\n`);

  let falhou = false;
  const gate = verificarLimiares(relatorio.resumo, MINIMOS_GERACAO, MAXIMOS_GERACAO);
  process.stdout.write(
    `\nGate: ${gate.passou ? 'APROVADO' : `REPROVADO — ${gate.falhas.join('; ')}`}\n`
  );
  falhou = !gate.passou && !args.semGate;

  if (args.comparar) {
    const antes = JSON.parse(fs.readFileSync(path.resolve(args.comparar), 'utf8'));
    if (antes.meta?.modo !== relatorio.meta.modo) {
      throw new Error(
        `--comparar exige o mesmo modo (antes: ${antes.meta?.modo}, agora: ${relatorio.meta.modo})`
      );
    }
    const comparacao = compararRelatorios(antes, relatorio);
    process.stdout.write(`\n${formatarComparacao(comparacao)}\n`);
    falhou = falhou || comparacao.regressoes.length > 0;
  }
  if (args.salvar) {
    fs.mkdirSync(path.dirname(path.resolve(args.salvar)), { recursive: true });
    fs.writeFileSync(path.resolve(args.salvar), `${JSON.stringify(relatorio, null, 2)}\n`);
    process.stdout.write(`\nRelatório salvo em ${args.salvar}\n`);
  }
  process.exitCode = falhou ? 1 : 0;
}

main().catch(err => {
  process.stderr.write(`eval-ia falhou: ${err.message}\n`);
  process.exitCode = 1;
});
