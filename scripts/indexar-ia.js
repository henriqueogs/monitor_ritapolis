'use strict';

/**
 * Popula (ou atualiza) o índice vetorial da IA com documentos e anexos reais.
 *
 *   node scripts/indexar-ia.js --simular                  # dry-run: o que seria indexado e quantos tokens (sem rede, sem gravar)
 *   node scripts/indexar-ia.js --max-docs 200 --max-min 30 # execução com orçamento (padrão: 200 docs, 30 min)
 *   ... --max-tokens 2000000                              # teto de tokens estimados de embedding
 *   ... --pausa-ms 500 --pagina 10                        # respeita a chave NVIDIA compartilhada com a campanha de resumos
 *   ... --remover-ausentes                                # só tem efeito numa passada COMPLETA
 *
 * Retomável: rodar de novo continua de onde parou (só reembeda o que mudou). Usa AI_VECTOR_DB_PATH,
 * AI_ASK_QUANTIZACAO, NVIDIA_EMBED_MODEL e AI_ASK_EMBED_DIMS. A rota /api/ia/perguntar só deve ser
 * ligada (AI_ASK_ENABLED=true) depois de uma passada completa.
 */

const fs = require('node:fs');
const path = require('node:path');

const MINUTO_MS = 60 * 1000;
const DEFAULTS = Object.freeze({ maxDocs: 200, maxMin: 30, pagina: 10, pausaMs: 500 });

function lerArgs(argv) {
  const valor = flag => {
    const i = argv.indexOf(flag);
    return i >= 0 ? Number(argv[i + 1]) : undefined;
  };
  return {
    simular: argv.includes('--simular'),
    removerAusentes: argv.includes('--remover-ausentes'),
    maxDocs: valor('--max-docs') ?? DEFAULTS.maxDocs,
    maxMin: valor('--max-min') ?? DEFAULTS.maxMin,
    maxTokens: valor('--max-tokens'),
    pagina: valor('--pagina') ?? DEFAULTS.pagina,
    pausaMs: valor('--pausa-ms') ?? DEFAULTS.pausaMs,
  };
}

async function main() {
  const args = lerArgs(process.argv.slice(2));
  // setupDatabase() ANTES de qualquer require que toque em repositórios (ver scripts/api.js).
  const { setupDatabase } = require('../src/db/setup');
  setupDatabase();

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

  // Simulação não chama a rede (nem exige chave): só o modelo/dimensão entram no hash.
  const provider = args.simular
    ? {
        model: config.nvidiaEmbedModel,
        dims: config.aiAskEmbedDims,
        embed: async () => {
          throw new Error('simulação não embeda');
        },
      }
    : criarEmbeddingPadrao(config);
  const caminho = path.resolve(config.aiVectorDbPath);
  // Simulação não cria o arquivo: sem índice, tudo conta como pendente (estado em memória).
  const usarArquivo = !args.simular || fs.existsSync(caminho);
  if (usarArquivo) {
    fs.mkdirSync(path.dirname(caminho), { recursive: true });
  }
  const db = usarArquivo ? abrirBancoVetorial(caminho) : null;
  try {
    if (!args.simular) {
      const saude = await verificarModelo(provider);
      if (!saude.ok) {
        throw new Error(`modelo de embedding indisponível: ${JSON.stringify(saude)}`);
      }
    }
    const store = db
      ? criarSqliteVecStore({ db, dims: provider.dims, quantizacao: config.aiAskQuantizacao })
      : null;
    const resumo = await rodarJobIndexacao({
      leitor,
      provider,
      store,
      estado: db ? criarEstadoIndexacaoSqlite(db) : criarEstadoIndexacaoMemoria(),
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
    process.exitCode = resumo.completo ? 0 : 2; // 2 = parou no orçamento; rode de novo para continuar
  } finally {
    db?.close();
  }
}

main().catch(err => {
  process.stderr.write(`indexar-ia falhou: ${err.message}\n`);
  process.exitCode = 1;
});
