'use strict';

jest.mock('../db', () => ({ getDocumentoById: jest.fn() }));
jest.mock('../db/itens-estruturacao-jobs-repo', () => ({
  listDocumentosPendentesItens: jest.fn(),
  getUltimoItensEstruturadosPorDocumento: jest.fn(),
  createItensEstruturacaoJob: jest.fn((args) => ({ id: 1, ...args, status: 'pendente' })),
}));
jest.mock('./estruturar-itens-processo', () => ({
  listarAtasDoDocumento: jest.fn().mockReturnValue([]),
  computeTextoHash: jest.fn(() => 'hash-atual'),
  CONTRACT_VERSION: 'itens-processo-v1.0',
}));
jest.mock('./providers', () => ({
  createAiProvider: jest.fn(() => ({ provider: 'nvidia', model: 'nvidia/nemotron-3-nano-30b-a3b' })),
}));

const { getDocumentoById } = require('../db');
const repo = require('../db/itens-estruturacao-jobs-repo');
const { computeTextoHash } = require('./estruturar-itens-processo');
const { enfileirarItensPendentes } = require('./enfileirar-itens-pendentes');

const documentoBase = { id: 5, tipo: 'edital', texto_completo: 'edital texto' };

describe('enfileirarItensPendentes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('seleciona candidatos via listDocumentosPendentesItens quando documentoId não é informado', async () => {
    repo.listDocumentosPendentesItens.mockReturnValue([documentoBase]);
    repo.getUltimoItensEstruturadosPorDocumento.mockReturnValue(null);

    const r = await enfileirarItensPendentes({ limite: 10 });

    expect(repo.listDocumentosPendentesItens).toHaveBeenCalledWith({ limite: 10, ano: undefined, fonte: undefined });
    expect(r.selecionados).toHaveLength(1);
    expect(r.enfileirados).toHaveLength(1);
  });

  it('usa getDocumentoById quando documentoId é informado (ignora limite/ano/fonte)', async () => {
    getDocumentoById.mockReturnValue(documentoBase);
    repo.getUltimoItensEstruturadosPorDocumento.mockReturnValue(null);

    const r = await enfileirarItensPendentes({ documentoId: 5 });

    expect(getDocumentoById).toHaveBeenCalledWith(5);
    expect(repo.listDocumentosPendentesItens).not.toHaveBeenCalled();
    expect(r.selecionados).toHaveLength(1);
  });

  it('pula documento já processado com o mesmo hash (sem --force)', async () => {
    repo.listDocumentosPendentesItens.mockReturnValue([documentoBase]);
    repo.getUltimoItensEstruturadosPorDocumento.mockReturnValue({ texto_hash: 'hash-atual', status: 'ok' });

    const r = await enfileirarItensPendentes({});

    expect(r.enfileirados).toHaveLength(0);
    expect(r.ja_processados).toHaveLength(1);
    expect(repo.createItensEstruturacaoJob).not.toHaveBeenCalled();
  });

  it('--force reprocessa mesmo com hash igual', async () => {
    repo.listDocumentosPendentesItens.mockReturnValue([documentoBase]);
    repo.getUltimoItensEstruturadosPorDocumento.mockReturnValue({ texto_hash: 'hash-atual', status: 'ok' });

    const r = await enfileirarItensPendentes({ force: true });

    expect(r.enfileirados).toHaveLength(1);
    expect(repo.createItensEstruturacaoJob).toHaveBeenCalledWith(
      expect.objectContaining({ documento_id: 5, force: true, texto_hash: 'hash-atual' })
    );
  });

  it('reprocessa quando o hash mudou (texto do edital foi atualizado)', async () => {
    computeTextoHash.mockReturnValue('hash-novo');
    repo.listDocumentosPendentesItens.mockReturnValue([documentoBase]);
    repo.getUltimoItensEstruturadosPorDocumento.mockReturnValue({ texto_hash: 'hash-velho', status: 'ok' });

    const r = await enfileirarItensPendentes({});

    expect(r.enfileirados).toHaveLength(1);
  });

  it('dry-run não cria job, só reporta o que seria feito', async () => {
    repo.listDocumentosPendentesItens.mockReturnValue([documentoBase]);
    repo.getUltimoItensEstruturadosPorDocumento.mockReturnValue(null);

    const r = await enfileirarItensPendentes({ dryRun: true });

    expect(repo.createItensEstruturacaoJob).not.toHaveBeenCalled();
    expect(r.enfileirados).toHaveLength(1);
    expect(r.dry_run).toBe(true);
  });

  it('documento inexistente com documentoId retorna selecionados vazio', async () => {
    getDocumentoById.mockReturnValue(null);
    const r = await enfileirarItensPendentes({ documentoId: 999 });
    expect(r.selecionados).toHaveLength(0);
  });
});
