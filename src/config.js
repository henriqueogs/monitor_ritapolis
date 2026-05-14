const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const rootDir = process.cwd();

function resolveFromRoot(value, fallback) {
  return path.resolve(rootDir, value || fallback);
}

module.exports = {
  rootDir,
  dbPath: resolveFromRoot(process.env.DB_PATH, './data/ritapolis.db'),
  logDir: resolveFromRoot(process.env.LOG_DIR, './logs'),
  apiPort: Number(process.env.API_PORT || 3001),
  apiHost: process.env.API_HOST || '0.0.0.0',
  frontendApiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  collectorDelayMs: Number(process.env.COLETOR_DELAY_MS || 1000),
  collectorTimeoutMs: Number(process.env.COLETOR_TIMEOUT_MS || 15000),
  collectorRetryMax: Number(process.env.COLETOR_RETRY_MAX || 3),
  collectorUserAgent:
    process.env.COLETOR_USER_AGENT ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  ibgeCode: process.env.IBGE_CODE || '3156106',
  cnpjPrefeitura: process.env.CNPJ_PREFEITURA || '18557553000105',
  cnpjCamara: process.env.CNPJ_CAMARA || '26148056000181',
  aiSummaryEnabled: String(process.env.AI_SUMMARY_ENABLED || 'true').toLowerCase() !== 'false',
  aiProvider: process.env.AI_PROVIDER || 'nvidia',
  aiContractVersion: process.env.AI_CONTRACT_VERSION || '1.0',
  aiMaxCharsDirect: Number(process.env.AI_MAX_CHARS_DIRECT || 80000),
  aiChunkSizeChars: Number(process.env.AI_CHUNK_SIZE_CHARS || 30000),
  aiChunkOverlapChars: Number(process.env.AI_CHUNK_OVERLAP_CHARS || 2000),
  aiMaxChunksPerDocument: Number(process.env.AI_MAX_CHUNKS_PER_DOCUMENT || 30),
  aiRequestTimeoutMs: Number(process.env.AI_REQUEST_TIMEOUT_MS || 60000),
  aiRetryMax: Number(process.env.AI_RETRY_MAX || 2),
  aiSaveRawResponse: String(process.env.AI_SAVE_RAW_RESPONSE || 'false').toLowerCase() === 'true',
  nvidiaApiKey: process.env.NVIDIA_API_KEY || '',
  nvidiaBaseUrl: process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1',
  nvidiaModel: process.env.NVIDIA_MODEL || 'meta/llama-3.1-70b-instruct',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'llama-3.1-70b-versatile'
};
