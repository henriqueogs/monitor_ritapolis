'use strict';

jest.mock('../db/anexo-resumo-jobs-repo', () => ({
  createAnexoResumoJob: jest.fn(),
  markAnexoResumoJobProcessing: jest.fn(),
  finishAnexoResumoJobOk: jest.fn(),
  finishAnexoResumoJobError: jest.fn(),
}));
jest.mock('../db/inteligencia-fatos-repo', () => ({
  salvarResumoAnexo: jest.fn((args) => ({ id: 99, ...args })),
}));

const config = require('../config');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const { createProgress } = require('../pipeline/progress');
const { buildAnexoResumoPrompt } = require('./prompts/anexo-resumo-prompt');
const { salvarResumoAnexo } = require('../db/inteligencia-fatos-repo');
const { summarizeAnexo, CONTRACT_VERSION_IA, CONTRACT_VERSION_HEURISTICO } = require('./summarize-anexo');

function anexoBase(overrides = {}) {
  return {
    id: 1,
    nome: 'ata-julgamento.pdf',
    tipo: 'ata',
    status_extracao: 'ok',
    texto_completo:
      'Aos vinte dias do mes de marco de 2026, reuniu-se a comissao de licitacao para julgar o processo numero '
      + '001/2026. Apos analise das propostas, foi declarada vencedora a empresa Fornecedora Alfa Ltda, com valor '
      + 'total homologado de R$ 12.400,00 para o fornecimento de material de limpeza. A ata foi assinada pelos '
      + 'membros da comissao presentes na sessao publica realizada na sede da prefeitura municipal.',
    texto_hash: 'hash-bom',
    documento_titulo: 'Pregao 001/2026',
    documento_tipo: 'edital',
    documento_ano: 2026,
    ...overrides,
  };
}

test('deadline-clipped attachment timeout does not save a heuristic result as successful', async () => {
  config.aiSummaryEnabled = true;
  jest.useFakeTimers();
  const db = new DatabaseSync(':memory:');
  try {
    salvarResumoAnexo.mockClear();
    const provider = {provider:'test',model:'x',generateJson:async({timeoutMs})=>{
      jest.advanceTimersByTime(timeoutMs);
      throw new Error('Request timed out.');
    }};
    await expect(summarizeAnexo(anexoBase(),{provider,progress:createProgress(db,'deadline',{deadline:Date.now()+60000})})).rejects.toMatchObject({code:'PIPELINE_YIELD'});
    expect(salvarResumoAnexo).not.toHaveBeenCalled();
  } finally {db.close();jest.useRealTimers();}
});

describe('summarizeAnexo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    config.aiSummaryEnabled = true;
  });

  it('usa IA quando o texto tem qualidade suficiente', async () => {
    const provider = {
      provider: 'nvidia',
      model: 'x',
      generateJson: jest.fn().mockResolvedValue(
        JSON.stringify({
          resumo_curto: 'A ata registra a vitoria da Fornecedora Alfa com valor homologado de R$ 12.400,00.',
          pontos_relevantes: [{ tipo: 'valor', descricao: 'Valor homologado', quantidade: 12400, unidade: 'R$' }],
          lacunas: [],
          confianca: 0.85,
        })
      ),
    };

    const resultado = await summarizeAnexo(anexoBase(), { provider });

    expect(provider.generateJson).toHaveBeenCalled();
    expect(resultado.contrato_versao).toBe(CONTRACT_VERSION_IA);
    expect(salvarResumoAnexo).toHaveBeenCalledWith(
      expect.objectContaining({
        anexo_id: 1,
        provider: 'nvidia',
        contrato_versao: CONTRACT_VERSION_IA,
        status: 'ok',
      })
    );
  });

  it('cai para o heuristico quando o texto parece ruido de OCR', async () => {
    const provider = { provider: 'nvidia', model: 'x', generateJson: jest.fn() };
    const anexo = anexoBase({ texto_completo: 'a a a a a a a k k k k 3 3 3 x2y9 !#@$', texto_hash: 'hash-ruim' });

    const resultado = await summarizeAnexo(anexo, { provider });

    expect(provider.generateJson).not.toHaveBeenCalled();
    expect(resultado.contrato_versao).toBe(CONTRACT_VERSION_HEURISTICO);
    expect(salvarResumoAnexo).toHaveBeenCalledWith(
      expect.objectContaining({ contrato_versao: CONTRACT_VERSION_HEURISTICO, provider: 'local' })
    );
  });

  it('cai para o heuristico quando a IA falha, sem lançar erro', async () => {
    const provider = { provider: 'nvidia', model: 'x', generateJson: jest.fn().mockRejectedValue(new Error('timeout')) };

    const resultado = await summarizeAnexo(anexoBase(), { provider });

    expect(resultado.contrato_versao).toBe(CONTRACT_VERSION_HEURISTICO);
    expect(resultado.erro).toMatch(/timeout/);
  });

  it('cai para o heuristico quando a IA responde fora do contrato', async () => {
    const provider = {
      provider: 'nvidia',
      model: 'x',
      generateJson: jest.fn().mockResolvedValue(JSON.stringify({ resumo_curto: '', confianca: 2 })),
    };

    const resultado = await summarizeAnexo(anexoBase(), { provider });

    expect(resultado.contrato_versao).toBe(CONTRACT_VERSION_HEURISTICO);
  });

  it('nao chama IA quando AI_SUMMARY_ENABLED=false (config.aiSummaryEnabled=false)', async () => {
    config.aiSummaryEnabled = false;
    const provider = { provider: 'nvidia', model: 'x', generateJson: jest.fn() };

    const resultado = await summarizeAnexo(anexoBase(), { provider });

    expect(provider.generateJson).not.toHaveBeenCalled();
    expect(resultado.contrato_versao).toBe(CONTRACT_VERSION_HEURISTICO);
  });
});

describe('anexo completo com retomada', () => {
  let db;
  let original;
  const summary = (label = 'Conforme o anexo, consta o registro oficial.') => ({
    resumo_curto: label, pontos_relevantes: [], lacunas: [], confianca: 0.8,
  });
  const longAnexo = () => anexoBase({
    texto_completo: anexoBase().texto_completo.repeat(24) + '\nMARCADOR_FINAL_DO_ANEXO',
    texto_hash: 'hash-antigo-nao-utilizar',
  });
  beforeEach(() => {
    jest.clearAllMocks();
    db = new DatabaseSync(':memory:');
    original = { enabled: config.aiSummaryEnabled, size: config.aiChunkSizeChars,
      overlap: config.aiChunkOverlapChars, max: config.aiMaxChunksPerDocument };
    config.aiSummaryEnabled = true;
    config.aiChunkSizeChars = 6000;
    config.aiChunkOverlapChars = 600;
    config.aiMaxChunksPerDocument = 40;
  });
  afterEach(() => {
    db.close();
    config.aiSummaryEnabled = original.enabled;
    config.aiChunkSizeChars = original.size;
    config.aiChunkOverlapChars = original.overlap;
    config.aiMaxChunksPerDocument = original.max;
  });
  test('nao aceita truncamento silencioso no construtor de prompt', () => {
    expect(() => buildAnexoResumoPrompt({ anexo: {}, texto: 'x'.repeat(8001) })).toThrow(/truncamento/);
  });
  test('retoma primeiro trecho validado e cobre o fim antes de publicar', async () => {
    const anexo = longAnexo();
    const provider = { provider: 'nvidia', model: 'mesmo-modelo', generateJson: jest.fn()
      .mockResolvedValueOnce(JSON.stringify(summary('Conforme o primeiro trecho, consta a ata.')))
      .mockRejectedValueOnce(new Error('Request timed out.')) };
    await expect(summarizeAnexo(anexo, { provider, progress: createProgress(db, 'job') }))
      .rejects.toThrow('Request timed out');
    expect(salvarResumoAnexo).not.toHaveBeenCalled();
    const resumed = { ...provider, generateJson: jest.fn(async ({ prompt, timeoutMs, maxRetries }) => {
      expect(timeoutMs).toBeGreaterThan(0);
      expect(maxRetries).toBe(0);
      return JSON.stringify(summary(prompt.includes('MARCADOR_FINAL_DO_ANEXO')
        ? 'Conforme o trecho final, consta MARCADOR_FINAL_DO_ANEXO.' : 'Conforme o anexo, consta o registro.'));
    }) };
    const result = await summarizeAnexo(anexo, { provider: resumed, progress: createProgress(db, 'job') });
    const prompts = resumed.generateJson.mock.calls.map(([request]) => request.prompt);
    expect(prompts).toHaveLength(2); // remaining leaf + consolidation; first leaf is reused
    expect(prompts[0]).toContain('MARCADOR_FINAL_DO_ANEXO');
    expect(prompts[1]).toContain('Conforme o primeiro trecho');
    expect(prompts[1]).toContain('MARCADOR_FINAL_DO_ANEXO');
    expect(result.contrato_versao).toBe('anexo-2.1-full');
    expect(result.texto_hash).toBe(crypto.createHash('sha256').update(anexo.texto_completo).digest('hex'));
    expect(result.resumo_json.cobertura).toMatchObject({ completa: true, trechos: 2,
      caracteres: anexo.texto_completo.length });
    expect(salvarResumoAnexo).toHaveBeenCalledTimes(1);
  });
  test.each(['texto', 'modelo'])('invalida checkpoints se mudar %s', async change => {
    const anexo = longAnexo();
    const provider = { provider: 'nvidia', model: 'modelo-1', generateJson: jest.fn()
      .mockResolvedValueOnce(JSON.stringify(summary()))
      .mockRejectedValueOnce(new Error('timeout')) };
    await expect(summarizeAnexo(anexo, { provider, progress: createProgress(db, 'job') }))
      .rejects.toThrow('timeout');
    if (change === 'texto') {
      anexo.texto_completo += '\nNova versao oficial.';
    }
    const resumed = { ...provider, model: change === 'modelo' ? 'modelo-2' : 'modelo-1',
      generateJson: jest.fn(async () => JSON.stringify(summary())) };
    await summarizeAnexo(anexo, { provider: resumed, progress: createProgress(db, 'job') });
    expect(resumed.generateJson).toHaveBeenCalledTimes(3);
  });
  test('falha na consolidacao nao publica e reutiliza todos os trechos na retomada', async () => {
    const provider = { provider: 'nvidia', model: 'modelo', generateJson: jest.fn()
      .mockResolvedValueOnce(JSON.stringify(summary()))
      .mockResolvedValueOnce(JSON.stringify(summary()))
      .mockRejectedValueOnce(new Error('timeout')) };
    await expect(summarizeAnexo(longAnexo(), { provider, progress: createProgress(db, 'job') }))
      .rejects.toThrow('timeout');
    expect(salvarResumoAnexo).not.toHaveBeenCalled();
    provider.generateJson = jest.fn(async () => JSON.stringify(summary()));
    await summarizeAnexo(longAnexo(), { provider, progress: createProgress(db, 'job') });
    expect(provider.generateJson).toHaveBeenCalledTimes(1);
  });
  test('limite de cobertura e baixo OCR falham sem salvar resumo parcial na fila', async () => {
    const provider = { provider: 'nvidia', model: 'modelo', generateJson: jest.fn() };
    config.aiMaxChunksPerDocument = 1;
    await expect(summarizeAnexo(longAnexo(), { provider, progress: createProgress(db, 'job') }))
      .rejects.toThrow(/limite/);
    await expect(summarizeAnexo(anexoBase({ texto_completo: 'a 3 !@#' }),
      { provider, progress: createProgress(db, 'job2') })).rejects.toThrow('texto_baixa_qualidade_ocr');
    expect(provider.generateJson).not.toHaveBeenCalled();
    expect(salvarResumoAnexo).not.toHaveBeenCalled();
  });
  test('versao curta valida e reaproveitada sem gravar; force continua sendo explicito', async () => {
    const anexo = anexoBase();
    const hash = crypto.createHash('sha256').update(anexo.texto_completo).digest('hex');
    anexo.resumo_ai = { id: 5, texto_hash: hash, contrato_versao: 'anexo-2.0',
      status: 'ok', dados: summary(), provider: 'nvidia', modelo: 'modelo', confianca: 0.8 };
    const provider = { provider: 'nvidia', model: 'modelo', generateJson: jest.fn(async () => JSON.stringify(summary())) };
    expect(await summarizeAnexo(anexo, { provider })).toMatchObject({ id: 5, cached: true });
    expect(provider.generateJson).not.toHaveBeenCalled();
    expect(salvarResumoAnexo).not.toHaveBeenCalled();
    await summarizeAnexo(anexo, { provider, force: true });
    expect(provider.generateJson).toHaveBeenCalledTimes(1);
    expect(salvarResumoAnexo).toHaveBeenCalledTimes(1);
  });
});
