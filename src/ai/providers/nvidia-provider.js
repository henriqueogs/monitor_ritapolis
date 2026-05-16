const OpenAI = require('openai');
const { BaseProvider } = require('./base-provider');

function readMessageContent(content) {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item.text === 'string') return item.text;
        return '';
      })
      .join('\n');
  }

  return '';
}

class NvidiaProvider extends BaseProvider {
  constructor(config) {
    super({ provider: 'nvidia', model: config.model });
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL || 'https://integrate.api.nvidia.com/v1',
      timeout: config.timeoutMs || 60000,
      maxRetries: 0
    });
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
