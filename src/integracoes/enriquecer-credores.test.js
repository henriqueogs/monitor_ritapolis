'use strict';

jest.mock('../db/credores-repo', () => ({
  listCnpjsParaEnriquecer: jest.fn(),
  upsertCredorEnriquecimento: jest.fn(),
}));

const { listCnpjsParaEnriquecer, upsertCredorEnriquecimento } = require('../db/credores-repo');
const { enriquecerCredores } = require('./enriquecer-credores');

const ALVOS = [
  { cnpj: '11111111000111', chave: '11111111000111', nome: 'A' },
  { cnpj: '22222222000122', chave: '22222222000122', nome: 'B' },
  { cnpj: '33333333000133', chave: '33333333000133', nome: 'C' },
];

beforeEach(() => {
  jest.clearAllMocks();
  listCnpjsParaEnriquecer.mockReturnValue(ALVOS);
});

describe('enriquecerCredores', () => {
  it('roteia cada CNPJ para ok / nao_encontrado / erro e grava status', async () => {
    const buscar = jest.fn()
      .mockResolvedValueOnce({ dados: { situacao_cadastral: 'ATIVA' }, confianca: 0.9 })
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('timeout'));

    const resumo = await enriquecerCredores({ sleepMs: 0, buscar });

    expect(resumo).toEqual({ selecionados: 3, enriquecidos: 1, sem_registro: 1, erros: 1 });

    const statusGravados = upsertCredorEnriquecimento.mock.calls.map((c) => c[0].status);
    expect(statusGravados).toEqual(['ok', 'nao_encontrado', 'erro']);
    expect(upsertCredorEnriquecimento).toHaveBeenCalledTimes(3);
  });

  it('grava sob a fonte receita_cnpj com tipo cnpj', async () => {
    listCnpjsParaEnriquecer.mockReturnValue([ALVOS[0]]);
    const buscar = jest.fn().mockResolvedValue({ dados: {}, confianca: 0.6 });

    await enriquecerCredores({ sleepMs: 0, buscar });

    expect(upsertCredorEnriquecimento).toHaveBeenCalledWith(expect.objectContaining({
      credor_chave: '11111111000111',
      tipo_credor: 'cnpj',
      fonte: 'receita_cnpj',
      identificador: '11111111000111',
    }));
  });
});
