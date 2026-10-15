'use strict';

/**
 * Composição do serviço de perguntas a partir da config: índice sqlite-vec + embeddings NVIDIA +
 * recuperador híbrido + LLM. Devolve null (e avisa) quando o recurso está desligado ou o índice
 * ainda não existe — a API sobe do mesmo jeito e a rota responde 503. As fábricas são injetáveis
 * para teste.
 */

const fs = require('node:fs');
const OpenAI = require('openai');
const { criarNvidiaEmbeddingProvider } = require('../adapters/nvidia-embedding-provider');
const { criarLLMProviderCompat } = require('../adapters/llm-provider-compat');
const { createAiProvider } = require('../providers');
const { criarRecuperadorHibrido } = require('./recuperador-hibrido');
const { criarServicoPerguntar } = require('./perguntar');

// sqlite-vec é extensão nativa: carregada só quando o recurso está ligado, para que a ausência
// dela nunca derrube o boot da API (lição do crash-loop de setupDatabase).
function abrirBancoPadrao(caminho) {
  // eslint-disable-next-line global-require
  return require('../vector/sqlite-vec-store').abrirBancoVetorial(caminho);
}

function criarStorePadrao({ db, dims, quantizacao }) {
  // eslint-disable-next-line global-require
  return require('../vector/sqlite-vec-store').criarSqliteVecStore({ db, dims, quantizacao });
}

const criarEmbeddingPadrao = config =>
  criarNvidiaEmbeddingProvider({
    client: new OpenAI({
      apiKey: config.nvidiaApiKey,
      baseURL: config.nvidiaBaseUrl,
      maxRetries: 1,
    }),
    modelo: config.nvidiaEmbedModel,
    dims: config.aiAskEmbedDims,
  });

const criarLlmPadrao = () => criarLLMProviderCompat(createAiProvider());

function montar({ config, logger, fabricas }) {
  const abrirBanco = fabricas.abrirBanco ?? abrirBancoPadrao;
  const embedder = (fabricas.criarEmbedding ?? criarEmbeddingPadrao)(config);
  const db = abrirBanco(config.aiVectorDbPath);
  const store = criarStorePadrao({
    db,
    dims: embedder.dims,
    quantizacao: config.aiAskQuantizacao,
  });
  const servico = criarServicoPerguntar({
    recuperar: criarRecuperadorHibrido({ provider: embedder, store }),
    llm: (fabricas.criarLlm ?? criarLlmPadrao)(config),
    registrarTrace: trace => logger.info('ia.perguntar', trace),
    limiarEvidencia: config.aiAskLimiar,
    limiteDiario: config.aiAskDailyLimit,
  });
  return { ...servico, fechar: () => db.close() };
}

function criarServicoPadrao({ config, logger, fabricas = {} }) {
  if (!config.aiAskEnabled) {
    return null;
  }
  if (!fs.existsSync(config.aiVectorDbPath)) {
    logger.warn('ia.perguntar: índice vetorial ausente; rota fica indisponível', {
      caminho: config.aiVectorDbPath,
    });
    return null;
  }
  try {
    return montar({ config, logger, fabricas });
  } catch (err) {
    logger.error('ia.perguntar: falha ao montar o serviço; rota fica indisponível', {
      erro: err.message,
    });
    return null;
  }
}

module.exports = { criarServicoPadrao };
