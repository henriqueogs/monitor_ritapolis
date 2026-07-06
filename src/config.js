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
  apiPort: Number(process.env.PORT || process.env.API_PORT || 3001),
  apiHost: process.env.API_HOST || '0.0.0.0',
  frontendApiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  collectorDelayMs: Number(process.env.COLETOR_DELAY_MS || 1000),
  collectorTimeoutMs: Number(process.env.COLETOR_TIMEOUT_MS || 15000),
  collectorRetryMax: Number(process.env.COLETOR_RETRY_MAX || 3),
  prefeituraSyncCheckIntervalMs: Number(process.env.PREFEITURA_SYNC_CHECK_INTERVAL_MS || 10 * 60 * 1000),
  collectorUserAgent:
    process.env.COLETOR_USER_AGENT ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  ibgeCode: process.env.IBGE_CODE || '3156106',
  cnpjPrefeitura: process.env.CNPJ_PREFEITURA || '18557553000105',
  cnpjCamara: process.env.CNPJ_CAMARA || '26148056000181',
  pncpBaseUrl: process.env.PNCP_BASE_URL || 'https://pncp.gov.br/api/consulta',
  pncpOrgaosUrl: process.env.PNCP_ORGAOS_URL || 'https://pncp.gov.br/pncp-api/v1',
  aiSummaryEnabled: String(process.env.AI_SUMMARY_ENABLED || 'true').toLowerCase() !== 'false',
  aiProvider: process.env.AI_PROVIDER || 'nvidia',
  aiContractVersion: process.env.AI_CONTRACT_VERSION || '1.1',
  aiMaxCharsDirect: Number(process.env.AI_MAX_CHARS_DIRECT || 80000),
  aiChunkSizeChars: Number(process.env.AI_CHUNK_SIZE_CHARS || 6000),
  aiMinChunkSizeChars: Number(process.env.AI_MIN_CHUNK_SIZE_CHARS || 3000),
  aiChunkOverlapChars: Number(process.env.AI_CHUNK_OVERLAP_CHARS || 600),
  aiMaxChunksPerDocument: Number(process.env.AI_MAX_CHUNKS_PER_DOCUMENT || 40),
  aiRequestTimeoutMs: Number(process.env.AI_REQUEST_TIMEOUT_MS || 120000),
  aiRetryMax: Number(process.env.AI_RETRY_MAX || 2),
  aiSaveRawResponse: String(process.env.AI_SAVE_RAW_RESPONSE || 'false').toLowerCase() === 'true',
  nvidiaApiKey: process.env.NVIDIA_API_KEY || '',
  nvidiaBaseUrl: process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1',
  nvidiaModel: process.env.NVIDIA_MODEL || 'meta/llama-3.1-70b-instruct',
  // Override opcional: modelo mais forte só para a investigação de
  // descobertas (menor volume, mais exige julgamento) — sem mexer no modelo
  // padrão usado por resumo/leitura simples/anexo. Vazio = usa nvidiaModel.
  nvidiaModelInvestigacao: process.env.NVIDIA_MODEL_INVESTIGACAO || null,
  nvidiaEmbedModel: process.env.NVIDIA_EMBED_MODEL || 'baai/bge-m3',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'llama-3.1-70b-versatile',

  // Scheduler de coletas
  collectionSchedulerEnabled: String(process.env.COLLECTION_SCHEDULER_ENABLED || 'true').toLowerCase() !== 'false',
  // Intervalo mínimo entre coletas automáticas (horas)
  collectionSchedulerIntervalHours: Number(process.env.COLLECTION_SCHEDULER_INTERVAL_HOURS || 12),
  // Com que frequência o scheduler verifica se é hora de coletar (ms)
  collectionSchedulerCheckMs: Number(process.env.COLLECTION_SCHEDULER_CHECK_MS || 60 * 60 * 1000),

  // Scheduler diário — transparência (despesas + receitas), PNCP, fornecedores
  dailySchedulerEnabled: String(process.env.DAILY_SCHEDULER_ENABLED || 'true').toLowerCase() !== 'false',
  dailySchedulerCheckMs: Number(process.env.DAILY_SCHEDULER_CHECK_MS || 30 * 60 * 1000),
  dailySchedulerTransparenciaIntervalHoras: Number(process.env.DAILY_SCHEDULER_TRANSPARENCIA_INTERVAL_H || 24),
  dailySchedulerPncpIntervalHoras: Number(process.env.DAILY_SCHEDULER_PNCP_INTERVAL_H || 168),

  // Scheduler de IA — processa resumos pendentes em ciclos controlados
  aiSchedulerEnabled: String(process.env.AI_SCHEDULER_ENABLED || 'true').toLowerCase() !== 'false',
  // Docs processados por ciclo (concorrencia=1, sequencial)
  aiSchedulerDocsPerCycle: Number(process.env.AI_SCHEDULER_DOCS_PER_CYCLE || 30),
  // Delay entre documentos no mesmo ciclo (ms) — evita rate limit
  aiSchedulerDelayBetweenDocsMs: Number(process.env.AI_SCHEDULER_DELAY_BETWEEN_DOCS_MS || 10_000),
  // Intervalo entre ciclos (ms) — padrão 4h → 6 ciclos/dia × 30 docs = 180 docs/dia
  aiSchedulerIntervalMs: Number(process.env.AI_SCHEDULER_INTERVAL_MS || 4 * 60 * 60 * 1000),

  // Gerador de alertas de inteligência
  alertasEnabled: String(process.env.ALERTAS_ENABLED || 'true').toLowerCase() !== 'false',
  alertasSchedulerEnabled: String(process.env.ALERTAS_SCHEDULER_ENABLED || 'true').toLowerCase() !== 'false',
  alertasMinRepeticao: Number(process.env.ALERTAS_MIN_REPETICAO || 2),
  alertasValorThreshold: Number(process.env.ALERTAS_VALOR_THRESHOLD || 500000),
  alertasLimitePorCiclo: Number(process.env.ALERTAS_LIMITE_POR_CICLO || 200),
  descobertasSchedulerEnabled: String(process.env.DESCOBERTAS_SCHEDULER_ENABLED || 'true').toLowerCase() !== 'false',
  descobertasSchedulerHour: Number(process.env.DESCOBERTAS_SCHEDULER_HOUR || 6),
  descobertasSchedulerCheckMs: Number(process.env.DESCOBERTAS_SCHEDULER_CHECK_MS || 30 * 60 * 1000),
  descobertasFatosLimitePorCiclo: Number(process.env.DESCOBERTAS_FATOS_LIMITE_POR_CICLO || 5000),
  descobertasInvestigacaoSchedulerEnabled: String(process.env.DESCOBERTAS_INVESTIGACAO_SCHEDULER_ENABLED || 'true').toLowerCase() !== 'false',
  descobertasInvestigacaoIntervalMs: Number(process.env.DESCOBERTAS_INVESTIGACAO_INTERVAL_MS || 60 * 60 * 1000),
  descobertasInvestigacaoPorCiclo: Number(process.env.DESCOBERTAS_INVESTIGACAO_POR_CICLO || 4),
  descobertasInvestigacaoDelayMs: Number(process.env.DESCOBERTAS_INVESTIGACAO_DELAY_MS || 15_000),
  // Portal da Transparência (SH3): primeiro exercício coletado. API tem dados
  // desde 2019 (probe 16/16 janelas ok — scripts/testar-sh3-anos-anteriores.js).
  transparenciaAnoInicio: Number(process.env.TRANSPARENCIA_ANO_INICIO || 2019)
};
