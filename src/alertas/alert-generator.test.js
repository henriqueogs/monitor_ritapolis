'use strict';

// Teste do orquestrador. Mocka DB e IA para validar a lógica de pipeline:
// documentos novos → detectores → consolidação → narrativa → persistência.

jest.mock('../db/connection', () => ({ db: {} }));
jest.mock('../db/ai-jobs-repo', () => ({
  getLatestResumoAiByDocumentoId: jest.fn(),
}));
jest.mock('../db', () => ({
  getCategoriasDocumentoId: jest.fn(),
  getLicitacaoGrupoByDocumentoId: jest.fn(),
}));
jest.mock('../licitacoes/categoria', () => ({
  classificarCategoria: jest.fn(),
}));
jest.mock('../ai/alert-narrative', () => ({
  gerarNarrativaAlerta: jest.fn(),
}));
jest.mock('../db/alertas-repo', () => ({
  getConfig: jest.fn(),
  getWatermark: jest.fn(() => null),
  setWatermark: jest.fn(),
  upsertAlerta: jest.fn(),
  removerAtivosNaoListados: jest.fn(() => 0),
}));
jest.mock('../db/inteligencia-fatos-repo', () => ({
  listarFatosParaAlertas: jest.fn(() => []),
}));

const { db } = require('../db/connection');
const aiJobsRepo = require('../db/ai-jobs-repo');
const dbIndex = require('../db');
const { classificarCategoria } = require('../licitacoes/categoria');
const { gerarNarrativaAlerta } = require('../ai/alert-narrative');
const repo = require('../db/alertas-repo');
const { generateAlerts } = require('./alert-generator');

function mockDocumentoRow(id, opts = {}) {
  return {
    id,
    titulo: opts.titulo || `Doc ${id}`,
    tipo: opts.tipo || 'edital',
    ano: opts.ano ?? 2026,
    fonte: 'site_prefeitura',
    data_publicacao: opts.data_publicacao || '2026-03-01',
    url_origem: `https://exemplo/${id}`,
    valor_estimado: opts.valor_estimado ?? 0,
    texto_completo: 'texto',
  };
}

function mockResumo(alertas = [], lacunas = [], confianca = 0.9) {
  return {
    resumo_json: JSON.stringify({ alertas, lacunas, consistencia: [], confianca }),
  };
}

function mockDbPrepare(docsReturn = [], valorReturn = null) {
  db.prepare = jest.fn((sql) => {
    if (/FROM documentos d/.test(sql)) {
      return { all: jest.fn(() => docsReturn), get: jest.fn(), run: jest.fn() };
    }
    if (/FROM licitacoes_detalhes/.test(sql)) {
      return { all: jest.fn(() => []), get: jest.fn(() => valorReturn), run: jest.fn() };
    }
    return { all: jest.fn(() => []), get: jest.fn(() => null), run: jest.fn() };
  });
}

describe('generateAlerts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDbPrepare();
    const gatilhos = {
      repeticao_tematica: true,
      risco_alto: true,
      valor_relevante: true,
      anomalia_temporal: true,
      questionamentos: true,
    };
    repo.getConfig.mockImplementation((chave, fallback) => {
      if (chave === 'alertas:gatilhos_ativos') { return gatilhos; }
      return fallback;
    });
    dbIndex.getCategoriasDocumentoId.mockReturnValue({ categoria: 'Meio Ambiente' });
    dbIndex.getLicitacaoGrupoByDocumentoId.mockReturnValue(null);
    classificarCategoria.mockReturnValue({ categoria: 'Meio Ambiente' });
    gerarNarrativaAlerta.mockResolvedValue({
      titulo: 'Narrativa IA',
      narrativa: 'Texto gerado',
      questionamentos: [],
    });
    repo.upsertAlerta.mockReturnValue({ id: 1, action: 'inserted' });
  });

  it('retorna vazio quando nao ha documentos novos', async () => {
    mockDbPrepare([]);
    const result = await generateAlerts({});
    expect(result.total).toBe(0);
    expect(result.gerados).toBe(0);
  });

  it('gera alerta tematico para repeticao de categoria', async () => {
    const docs = [
      mockDocumentoRow(1, { titulo: 'Corte de arvores 1' }),
      mockDocumentoRow(2, { titulo: 'Corte de arvores 2' }),
    ];
    mockDbPrepare(docs);
    aiJobsRepo.getLatestResumoAiByDocumentoId.mockReturnValue(mockResumo());

    const result = await generateAlerts({});
    expect(result.total).toBe(2);
    expect(result.gerados).toBeGreaterThanOrEqual(1);
    expect(gerarNarrativaAlerta).toHaveBeenCalled();
    expect(repo.upsertAlerta).toHaveBeenCalled();
    expect(repo.setWatermark).toHaveBeenCalled();
  });

  it('gera alerta de processo para risco alto', async () => {
    const docs = [mockDocumentoRow(1)];
    mockDbPrepare(docs);
    aiJobsRepo.getLatestResumoAiByDocumentoId.mockReturnValue(
      mockResumo([{ nivel: 'alto', descricao: 'Sobrepreco', fonte: 'ia' }])
    );

    const result = await generateAlerts({});
    expect(result.gerados).toBe(1);
    const alerta = repo.upsertAlerta.mock.calls[0][0];
    expect(alerta.tipo).toBe('processo');
    expect(alerta.severidade).toBe('critico');
  });

  it('dry-run nao persiste nem atualiza watermark', async () => {
    const docs = [mockDocumentoRow(1), mockDocumentoRow(2)];
    mockDbPrepare(docs);
    aiJobsRepo.getLatestResumoAiByDocumentoId.mockReturnValue(mockResumo());

    const result = await generateAlerts({ dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(repo.upsertAlerta).not.toHaveBeenCalled();
    expect(repo.setWatermark).not.toHaveBeenCalled();
  });

  it('usa narrativa template quando IA falha', async () => {
    const docs = [mockDocumentoRow(1), mockDocumentoRow(2)];
    mockDbPrepare(docs);
    aiJobsRepo.getLatestResumoAiByDocumentoId.mockReturnValue(mockResumo());
    gerarNarrativaAlerta.mockRejectedValue(new Error('IA indisponivel'));

    const result = await generateAlerts({});
    expect(result.gerados).toBeGreaterThanOrEqual(1);
    const alerta = repo.upsertAlerta.mock.calls[0][0];
    expect(alerta.narrativa).toBeTruthy();
    expect(alerta.narrativa).not.toBe('Texto gerado');
  });

  it('ignora documentos sem resumo IA', async () => {
    const docs = [mockDocumentoRow(1), mockDocumentoRow(2)];
    mockDbPrepare(docs);
    aiJobsRepo.getLatestResumoAiByDocumentoId.mockReturnValue(null);

    const result = await generateAlerts({});
    expect(result.total).toBe(0);
    expect(result.gerados).toBe(0);
  });

  it('rebuild completo (full) reconcilia ativos fora da lista regerada', async () => {
    const docs = [
      mockDocumentoRow(1, { titulo: 'Corte de arvores 1' }),
      mockDocumentoRow(2, { titulo: 'Corte de arvores 2' }),
    ];
    mockDbPrepare(docs);
    aiJobsRepo.getLatestResumoAiByDocumentoId.mockReturnValue(mockResumo());
    repo.removerAtivosNaoListados.mockReturnValue(3);

    const result = await generateAlerts({ full: true });

    // Reconciliação recebe as chaves geradas e o retorno expõe removidos.
    expect(repo.removerAtivosNaoListados).toHaveBeenCalledTimes(1);
    const chaves = repo.removerAtivosNaoListados.mock.calls[0][0];
    expect(Array.isArray(chaves)).toBe(true);
    expect(result.removidos).toBe(3);
  });

  it('ciclo incremental (sem full) nao reconcilia', async () => {
    const docs = [mockDocumentoRow(1), mockDocumentoRow(2)];
    mockDbPrepare(docs);
    aiJobsRepo.getLatestResumoAiByDocumentoId.mockReturnValue(mockResumo());

    await generateAlerts({});
    expect(repo.removerAtivosNaoListados).not.toHaveBeenCalled();
  });

  it('respeita gatilhos desativados', async () => {
    const gatilhosOff = {
      repeticao_tematica: false,
      risco_alto: false,
      valor_relevante: false,
      anomalia_temporal: false,
      questionamentos: false,
    };
    repo.getConfig.mockImplementation((chave, fallback) => {
      if (chave === 'alertas:gatilhos_ativos') { return gatilhosOff; }
      return fallback;
    });
    const docs = [mockDocumentoRow(1), mockDocumentoRow(2)];
    mockDbPrepare(docs);
    aiJobsRepo.getLatestResumoAiByDocumentoId.mockReturnValue(mockResumo());

    const result = await generateAlerts({});
    expect(result.gerados).toBe(0);
  });
});
