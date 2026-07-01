const config = require('../../config');
const { NvidiaProvider } = require('./nvidia-provider');

// `overrides.model` permite rotear uma chamada específica para um modelo
// diferente do padrão global (NVIDIA_MODEL) — ex.: um modelo mais forte só
// para a investigação de descobertas, mantendo o modelo rápido/barato para
// tarefas de alto volume (resumo simples de documento/anexo).
function createAiProvider(env = process.env, overrides = {}) {
  const provider = env.AI_PROVIDER || config.aiProvider || 'nvidia';

  if (provider === 'nvidia') {
    const apiKey = env.NVIDIA_API_KEY || config.nvidiaApiKey;
    if (!apiKey) {
      throw new Error('NVIDIA_API_KEY nao configurada no .env');
    }

    return new NvidiaProvider({
      apiKey,
      baseURL: env.NVIDIA_BASE_URL || config.nvidiaBaseUrl,
      model: overrides.model || env.NVIDIA_MODEL || config.nvidiaModel,
      embedModel: env.NVIDIA_EMBED_MODEL || config.nvidiaEmbedModel,
      timeoutMs: Number(env.AI_REQUEST_TIMEOUT_MS || config.aiRequestTimeoutMs)
    });
  }

  throw new Error(`AI_PROVIDER nao suportado para uso operacional: ${provider}. Use AI_PROVIDER=nvidia.`);
}

module.exports = {
  createAiProvider
};
