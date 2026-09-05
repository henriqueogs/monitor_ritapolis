const OpenAI = require('openai');
const { BaseProvider } = require('./base-provider');

function readMessageContent(content) {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {return item;}
        if (item && typeof item.text === 'string') {return item.text;}
        return '';
      })
      .join('\n');
  }

  return '';
}

class NvidiaProvider extends BaseProvider {
  constructor(config) {
    super({ provider: 'nvidia', model: config.model });
    this.embedModel = config.embedModel || 'baai/bge-m3';
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL || 'https://integrate.api.nvidia.com/v1',
      timeout: config.timeoutMs || 60000,
      // A conta NVIDIA rate-limita (429) ja com 2 chamadas simultaneas --
      // achado ao rodar validar-produtos-ia.js, mas vale pra QUALQUER
      // chamada (resumo de documento, investigacao de descoberta, etc), e
      // sem retry aqui o 429 cru vazava pra tela do admin ("429 status code
      // (no body)"). O SDK da openai so retenta 429/5xx com backoff — erro
      // permanente (410 modelo morto, 404 sem entitlement) nao e retentado.
      maxRetries: 2
    });
  }

  /**
   * Gera embeddings para um lote de textos. Retorna array de vetores na mesma
   * ordem da entrada.
   * @param {string[]} textos
   * @returns {Promise<number[][]>}
   */
  async embed(textos) {
    const response = await this.client.embeddings.create({
      model: this.embedModel,
      input: textos
    });
    return response.data
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);
  }

  async generateJson({ prompt, temperature = 0.1 }) {
    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature,
      messages: [
        {
          role: 'system',
          content: 'Voce retorna somente JSON valido, sem markdown e sem texto adicional.'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    return readMessageContent(response.choices?.[0]?.message?.content);
  }
}

module.exports = {
  NvidiaProvider
};
