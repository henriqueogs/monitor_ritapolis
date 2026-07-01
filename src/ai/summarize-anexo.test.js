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
