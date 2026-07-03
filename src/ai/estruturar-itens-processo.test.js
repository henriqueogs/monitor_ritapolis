'use strict';

jest.mock('../db/inteligencia-fatos-repo', () => ({
  listarAnexosDocumento: jest.fn(),
}));
jest.mock('../db/itens-estruturacao-jobs-repo', () => ({
  salvarItensEstruturados: jest.fn((args) => ({ id: 99, ...args })),
}));

const { listarAnexosDocumento } = require('../db/inteligencia-fatos-repo');
const { salvarItensEstruturados } = require('../db/itens-estruturacao-jobs-repo');
const { estruturarItensProcesso, CONTRACT_VERSION } = require('./estruturar-itens-processo');

const documentoEdital = {
  id: 5,
  tipo: 'edital',
  titulo: 'Pregão 006/2026',
  ano: 2026,
  texto_completo: 'EDITAL: Item 1 - Cobertura fotográfica - 10 diárias',
};

function providerMock(resposta) {
  return {
    provider: 'nvidia',
    model: 'nvidia/nemotron-3-nano-30b-a3b',
    generateJson: jest.fn().mockResolvedValue(JSON.stringify(resposta)),
  };
}

describe('estruturarItensProcesso', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listarAnexosDocumento.mockReturnValue([]);
  });

  it('reextrai itens com sucesso e persiste', async () => {
    const provider = providerMock({
      tem_tabela_itens: true,
      itens_solicitados: [{ descricao: 'Cobertura fotográfica', trecho_fonte: 'Item 1 - Cobertura fotográfica' }],
      resultado_lotes: [],
      resultado_global: null,
      lacunas: [],
      confianca: 0.85,
    });

    const r = await estruturarItensProcesso(documentoEdital, { provider });

    expect(provider.generateJson).toHaveBeenCalledTimes(1);
    expect(salvarItensEstruturados).toHaveBeenCalledWith(
      expect.objectContaining({
        documento_id: 5,
        provider: 'nvidia',
        modelo: 'nvidia/nemotron-3-nano-30b-a3b',
        contrato_versao: CONTRACT_VERSION,
        confianca: 0.85,
        status: 'ok',
      })
    );
    expect(r.itens_json.itens_solicitados).toHaveLength(1);
  });

  it('CASO doc/605: aceita tem_tabela_itens=false sem tentar forçar itens', async () => {
    const provider = providerMock({
      tem_tabela_itens: false,
      itens_solicitados: [],
      resultado_lotes: [],
      resultado_global: null,
      lacunas: ['O texto é um cronograma físico-financeiro de medição de obra, não uma lista de itens.'],
      confianca: 0.9,
    });

    const r = await estruturarItensProcesso({ ...documentoEdital, id: 605 }, { provider });

    expect(r.itens_json.tem_tabela_itens).toBe(false);
    expect(r.itens_json.lacunas[0]).toMatch(/cronograma/);
  });

  it('inclui texto das atas vinculadas no prompt', async () => {
    listarAnexosDocumento.mockReturnValue([
      { tipo: 'ata', nome: 'Ata.pdf', texto_completo: 'ATA: Item 1 LOTE 1 R$195.000,00' },
      { tipo: 'edital_anexo', nome: 'Outro.pdf', texto_completo: 'irrelevante' },
    ]);
    const provider = providerMock({ tem_tabela_itens: true, itens_solicitados: [], resultado_lotes: [], resultado_global: null, lacunas: [], confianca: 0.5 });

    await estruturarItensProcesso(documentoEdital, { provider });

    const promptEnviado = provider.generateJson.mock.calls[0][0].prompt;
    expect(promptEnviado).toContain('ATA: Item 1 LOTE 1');
    expect(promptEnviado).not.toContain('irrelevante');
  });

  it('resposta fora do contrato lança erro (não persiste)', async () => {
    const provider = providerMock({ tem_tabela_itens: 'sim', confianca: 2 }); // inválido

    await expect(estruturarItensProcesso(documentoEdital, { provider })).rejects.toThrow(/contrato/);
    expect(salvarItensEstruturados).not.toHaveBeenCalled();
  });

  it('documento sem texto_completo lança erro claro', async () => {
    await expect(
      estruturarItensProcesso({ ...documentoEdital, texto_completo: '' }, { provider: providerMock({}) })
    ).rejects.toThrow(/texto/);
  });
});
