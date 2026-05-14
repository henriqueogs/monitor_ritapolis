const config = require('../../config');
const { NvidiaProvider } = require('./nvidia-provider');

function createAiProvider(env = process.env) {
  const provider = env.AI_PROVIDER || config.aiProvider || 'nvidia';

  if (provider === 'nvidia') {
    const apiKey = env.NVIDIA_API_KEY || config.nvidiaApiKey;
    if (!apiKey) {
      throw new Error('NVIDIA_API_KEY nao configurada no .env');
    }

    return new NvidiaProvider({
      apiKey,
      baseURL: env.NVIDIA_BASE_URL || config.nvidiaBaseUrl,
      model: env.NVIDIA_MODEL || config.nvidiaModel,
      timeoutMs: Number(env.AI_REQUEST_TIMEOUT_MS || config.aiRequestTimeoutMs)
    });
  }

  throw new Error(`AI_PROVIDER nao suportado para uso operacional: ${provider}. Use AI_PROVIDER=nvidia.`);
}

module.exports = {
  createAiProvider
};
