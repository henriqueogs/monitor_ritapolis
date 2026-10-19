'use strict';

/**
 * Popula (ou atualiza) o índice vetorial da IA com documentos e anexos reais.
 *
 *   node scripts/indexar-ia.js --simular                  # dry-run: o que seria indexado e quantos tokens
 *                                                         #   (sem rede; não migra schema, não grava índice nem estado)
 *   node scripts/indexar-ia.js --max-docs 200 --max-min 30 # execução com orçamento (padrão: 200 docs, 30 min)
 *   ... --max-tokens 2000000                              # teto de tokens estimados de embedding
 *   ... --pausa-ms 500 --pagina 10                        # respeita a chave NVIDIA compartilhada com a campanha de resumos
 *   ... --remover-ausentes                                # só tem efeito numa passada COMPLETA e com leitura não vazia
 *
 * Retomável: rodar de novo continua de onde parou (só reembeda o que mudou). Usa AI_VECTOR_DB_PATH,
 * AI_ASK_QUANTIZACAO, NVIDIA_EMBED_MODEL e AI_ASK_EMBED_DIMS. A rota /api/ia/perguntar só deve ser
 * ligada (AI_ASK_ENABLED=true) depois de uma passada completa. Saída: 0 completo, 2 parou no
 * orçamento (rode de novo), 1 erro.
 */

const fs = require('node:fs');
const path = require('node:path');

const MINUTO_MS = 60 * 1000;
const DEFAULTS = Object.freeze({ maxDocs: 200, maxMin: 30, pagina: 10, pausaMs: 500 });

function numeroDaFlag(argv, flag, { minimo = 1 } = {}) {
  const i = argv.indexOf(flag);
  if (i < 0) {
    return undefined;
  }
  const bruto = argv[i + 1];
  const valor = Number(bruto);
  if (bruto === undefined || bruto.startsWith('--') || !Number.isInteger(valor) || valor < minimo) {
    throw new RangeError(`${flag} exige um inteiro >= ${minimo} (recebido: ${bruto})`);
  }
  return valor;
}

function lerArgs(argv) {
  return {
    simular: argv.includes('--simular'),
    removerAusentes: argv.includes('--remover-ausentes'),
    maxDocs: numeroDaFlag(argv, '--max-docs') ?? DEFAULTS.maxDocs,
    maxMin: numeroDaFlag(argv, '--max-min') ?? DEFAULTS.maxMin,
    maxTokens: numeroDaFlag(argv, '--max-tokens'),
    pagina: numeroDaFlag(argv, '--pagina') ?? DEFAULTS.pagina,
    pausaMs: numeroDaFlag(argv, '--pausa-ms', { minimo: 0 }) ?? DEFAULTS.pausaMs,
  };
}

const provedorDeSimulacao = config => ({
  model: config.nvidiaEmbedModel,
  dims: config.aiAskEmbedDims,
  embed: async () => {
    throw new Error('simulação não embeda');
  },
});

async function main() {
  const args = lerArgs(process.argv.slice(2));
  // setupDatabase() ANTES de qualquer require que toque em repositórios (ver scripts/api.js).
  // Na simulação não roda: não migra schema nem escreve no banco de documentos.
  if (!args.simular) {
    require('../src/db/setup').setupDatabase();
  }

  const config = require('../src/config');
  const logger = require('../src/logger');
  const leitor = require('../src/db/ia-fontes-repo');
  const { criarEmbeddingPadrao } = require('../src/ai/rag/servico-padrao');
  const { rodarJobIndexacao } = require('../src/ai/rag/job-indexacao');
  const {
    criarEstadoIndexacaoMemoria,
    criarEstadoIndexacaoSqlite,
  } = require('../src/ai/rag/estado-indexacao');
  const { verificarModelo } = require('../src/ai/ports/embedding-provider');
  const { abrirBancoVetorial, criarSqliteVecStore } = require('../src/ai/vector/sqlite-vec-store');

  const provider = args.simular ? provedorDeSimulacao(config) : criarEmbeddingPadrao(config);
  const caminho = path.resolve(config.aiVectorDbPath);
  // Simulação abre o índice só para LER o estado (read-only); sem arquivo, tudo conta como pendente.
  const db = args.simular
    ? fs.existsSync(caminho)
      ? abrirBancoVetorial(caminho, { somenteLeitura: true })
      : null
    : (fs.mkdirSync(path.dirname(caminho), { recursive: true }), abrirBancoVetorial(caminho));
  try {
    if (!args.simular) {
      const saude = await verificarModelo(provider);
      if (!saude.ok) {
        throw new Error(`modelo de embedding indisponível: ${JSON.stringify(saude)}`);
      }
    }
    const store = args.simular
      ? null
      : criarSqliteVecStore({ db, dims: provider.dims, quantizacao: config.aiAskQuantizacao });
    const estado = db
      ? criarEstadoIndexacaoSqlite(db, { somenteLeitura: args.simular })
      : criarEstadoIndexacaoMemoria();
    const resumo = await rodarJobIndexacao({
      leitor,
      provider,
      store,
      estado,
      logger,
      orcamento: {
        maxDocumentos: args.maxDocs,
        maxTokens: args.maxTokens,
        maxMs: args.maxMin * MINUTO_MS,
      },
      tamanhoPagina: args.pagina,
      pausaEntreLotesMs: args.pausaMs,
      simular: args.simular,
      removerAusentes: args.removerAusentes,
    });
    process.stdout.write(`${JSON.stringify(resumo, null, 2)}\n`);
    process.exitCode = resumo.completo ? 0 : 2;
  } finally {
    db?.close();
  }
}

main().catch(err => {
  process.stderr.write(`indexar-ia falhou: ${err.message}\n`);
  process.exitCode = 1;
});
