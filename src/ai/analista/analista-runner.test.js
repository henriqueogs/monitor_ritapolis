'use strict';

const { analisarCredor } = require('./analista-runner');

const CNPJ = '11111111000111';
const empenho = (id, valor) => ({
  id,
  empenho: `${String(id).padStart(5, '0')}-000`,
  exercicio_orcamento: 2025,
  tipo: 'EO',
  data_empenho: '2025-03-10',
  valor,
  credor_nome: 'AUTO PECAS LTDA',
  credor_cnpj: CNPJ,
  historico: 'Aquisição de peças para a retroescavadeira',
});

const repo = {
  buscarCredor: jest.fn(() => ({ nome: 'AUTO PECAS LTDA', cnpj: CNPJ })),
  listarEmpenhosDoCredor: jest.fn(() => [empenho(1, 30000), empenho(2, 26000)]),
  listarLicitacoesDoCredor: jest.fn(() => []),
};

const respostaBoa = {
  achados: [
    {
      achado: 'Dois empenhos no mesmo dia para o mesmo objeto',
      tipo: 'repeticao',
      evidencias: [{ fonte_id: 'E1', trecho: 'peças para a retroescavadeira' }],
      por_que_suspeito: 'Dois empenhos de R$ 30.000,00 e R$ 26.000,00 na mesma data.',
      o_que_falta_para_confirmar: 'Ver se há ata de registro de preços.',
      confianca: 0.5,
    },
  ],
};

describe('analisarCredor', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sem chamar o modelo, só mede o dossiê e o prompt (nenhuma chamada ao provider)', async () => {
    const provider = { generateJson: jest.fn() };
    const r = await analisarCredor({ cnpj: CNPJ, provider, repo });
    expect(provider.generateJson).not.toHaveBeenCalled();
    expect(r.chamou).toBe(false);
    expect(r.tokens_prompt_estimados).toBeGreaterThan(0);
    expect(r.fontes).toBe(3);
  });

  it('chamando o modelo, verifica e separa aceitos e descartados', async () => {
    const ruim = {
      ...respostaBoa.achados[0],
      evidencias: [{ fonte_id: 'E1', trecho: 'combustível inventado' }],
    };
    const provider = {
      generateJson: jest.fn(async () =>
        JSON.stringify({ achados: [respostaBoa.achados[0], ruim] })
      ),
    };
    const r = await analisarCredor({ cnpj: CNPJ, provider, repo, chamarModelo: true });
    expect(provider.generateJson).toHaveBeenCalledTimes(1);
    expect(r.aceitos).toHaveLength(1);
    expect(r.descartados).toHaveLength(1);
    expect(r.aceitos[0].evidencias[0].url_origem).toMatch(/^https?:\/\//);
    expect(r.duracao_ms).toBeGreaterThanOrEqual(0);
  });

  it('resposta que não é JSON vira erro registrado, sem lançar', async () => {
    const provider = { generateJson: jest.fn(async () => 'não consegui') };
    const r = await analisarCredor({ cnpj: CNPJ, provider, repo, chamarModelo: true });
    expect(r.aceitos).toEqual([]);
    expect(r.erro).toMatch(/JSON/);
  });

  it('credor desconhecido falha com mensagem clara', async () => {
    const vazio = { ...repo, buscarCredor: jest.fn(() => null) };
    await expect(analisarCredor({ cnpj: '00000000000000', repo: vazio })).rejects.toThrow(
      /não encontrado/
    );
  });
});
