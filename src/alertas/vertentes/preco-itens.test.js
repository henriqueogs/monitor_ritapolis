'use strict';

const vertente = require('./preco-itens');
const { rodarVertentes, validarVertente } = require('./orquestrador');

let seq = 0;
const item = (valorUnitario, extra = {}) => {
  seq += 1;
  return {
    item_id: seq,
    despesa_id: seq,
    empenho: `${String(seq).padStart(5, '0')}-000`,
    exercicio_orcamento: 2026,
    tipo: 'EO',
    data_empenho: `2026-03-${String((seq % 28) + 1).padStart(2, '0')}`,
    credor_cnpj: '11111111000111',
    credor_nome: 'AUTO PECAS LTDA',
    historico: 'Aquisição de peças',
    produto_codigo: '00000022294',
    produto: 'FILTRO DE OLEO',
    complemento: null,
    unidade: 'PÇ',
    quantidade: 1,
    valor_unitario: valorUnitario,
    valor_total: valorUnitario,
    ...extra,
  };
};
// 5 preços estáveis em torno de 70 e um muito acima.
const grupo = (alto = 650) => [70, 70.3, 70.3, 69.9, 71, alto].map(v => item(v));

describe('vertente preco-itens', () => {
  beforeEach(() => {
    seq = 0;
  });

  it('cumpre o contrato', () => {
    expect(validarVertente(vertente)).toEqual([]);
  });

  it('sinaliza o item muito acima da mediana, com empenhos de referência e do outlier', () => {
    const { candidatos, resumo } = rodarVertentes({ itens: grupo() }, [vertente]);
    expect(resumo['preco-itens'].erro).toBeNull();
    expect(candidatos).toHaveLength(1);
    const c = candidatos[0];
    expect(c.titulo).toMatch(/FILTRO DE OLEO/);
    expect(c.metrica).toMatchObject({ nome: 'razao_preco', mediana: 70.3, maior_preco: 650 });
    expect(c.metrica.valor).toBeCloseTo(9.25, 1);
    expect(c.severidade).toBe('info');
    expect(c.evidencias.length).toBeGreaterThanOrEqual(2);
    expect(c.evidencias[0].url_origem).toMatch(/^https?:\/\//);
  });

  it('o texto avisa que o código de catálogo pode agrupar itens diferentes', () => {
    const [c] = vertente.detectar({ itens: grupo() });
    expect(c.narrativa).toMatch(/mesmo código de catálogo/);
    expect(c.narrativa).toMatch(/confira/i);
    expect(c.narrativa).not.toMatch(/fraude|superfatur|irregular|ilegal/i);
  });

  it('preço dentro do normal (menos de 3x a mediana) não sinaliza', () => {
    expect(vertente.detectar({ itens: grupo(150) })).toEqual([]);
  });

  it('exige ao menos 4 itens em 3 empenhos distintos', () => {
    const poucos = [70, 70, 650].map(v => item(v));
    expect(vertente.detectar({ itens: poucos })).toEqual([]);
  });

  it('produto sem preço de referência estável (preços espalhados) não sinaliza', () => {
    const espalhado = [10, 100, 1000, 10000, 100000].map(v => item(v));
    expect(vertente.detectar({ itens: espalhado })).toEqual([]);
  });

  it('só compara a mesma unidade e ignora itens sem código, unidade ou preço', () => {
    const mistos = [
      ...grupo(),
      item(5000, { unidade: 'CX' }),
      item(5000, { produto_codigo: null }),
      item(5000, { unidade: null }),
      item(0),
    ];
    const r = vertente.detectar({ itens: mistos });
    expect(r).toHaveLength(1);
    expect(r[0].metrica.maior_preco).toBe(650);
  });

  it('peça de manutenção de veículo/máquina não é comparável (a especificação depende do equipamento)', () => {
    const manutencao = grupo().map(i => ({
      ...i,
      historico: 'AQUISIÇÃO DE PEÇAS PARA A MANUTENÇÃO DO CAMINHÃO PLACA HMG7088 DA FROTA',
    }));
    expect(vertente.detectar({ itens: manutencao })).toEqual([]);
    const porPlaca = grupo().map(i => ({ ...i, historico: 'peças do veículo placa ABC1D23' }));
    expect(vertente.detectar({ itens: porPlaca })).toEqual([]);
  });

  it('exclui pessoa física e empenhos que não são originais', () => {
    const pf = grupo().map(i => ({ ...i, credor_cnpj: '12345678901' }));
    const ee = grupo().map(i => ({ ...i, tipo: 'EE' }));
    expect(vertente.detectar({ itens: pf })).toEqual([]);
    expect(vertente.detectar({ itens: ee })).toEqual([]);
  });

  it('exige excesso absoluto relevante (evita ruído de centavos)', () => {
    const baratos = [0.1, 0.1, 0.11, 0.1, 0.1, 0.5].map(v => item(v));
    expect(vertente.detectar({ itens: baratos })).toEqual([]);
  });
});
