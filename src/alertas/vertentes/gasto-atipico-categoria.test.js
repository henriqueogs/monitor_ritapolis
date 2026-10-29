'use strict';

const vertente = require('./gasto-atipico-categoria');
const { rodarVertentes, validarVertente } = require('./orquestrador');

const agregado = (extra = {}) => ({
  slug: 'combustivel',
  rotulo: 'Combustível',
  ano: 2025,
  credor_cnpj: '11111111000111',
  credor_nome: 'Posto A',
  n: 3,
  valor_total: 600000,
  empenho_ids: [1, 2],
  ...extra,
});
const outros = [2, 3, 4].map(i =>
  agregado({
    credor_cnpj: `2222222200022${i}`,
    credor_nome: `Posto ${i}`,
    valor_total: 100000,
    empenho_ids: [],
  })
);
const despesa = id => ({
  id,
  empenho: '00012-001',
  exercicio_orcamento: 2025,
  tipo: 'EO',
  valor: 1000,
  credor_nome: 'Posto A',
  historico: 'Combustível',
});
const contexto = (extra = {}) => ({
  agregados: [agregado(), ...outros],
  empenhosPorId: new Map([1, 2].map(id => [id, despesa(id)])),
  ...extra,
});

describe('vertente gasto-atipico-categoria', () => {
  it('cumpre o contrato', () => {
    expect(validarVertente(vertente)).toEqual([]);
  });

  it('converte sinal de concentração em candidato com evidência do portal', () => {
    const { candidatos, resumo } = rodarVertentes(contexto(), [vertente]);
    expect(resumo['gasto-atipico-categoria'].erro).toBeNull();
    expect(candidatos).toHaveLength(1);
    const c = candidatos[0];
    expect(c.periodo).toEqual({ ano: 2025 });
    expect(c.metrica).toMatchObject({ unidade: 'R$', valor: 600000 });
    expect(c.evidencias).toHaveLength(2);
    expect(c.evidencias[0].url_origem).toMatch(/^https?:\/\//);
    expect(c.titulo).toMatch(/Posto A/);
  });

  it('sem empenho carregado não há evidência e o candidato é descartado', () => {
    const { candidatos, resumo } = rodarVertentes(contexto({ empenhosPorId: new Map() }), [
      vertente,
    ]);
    expect(candidatos).toHaveLength(0);
    expect(resumo['gasto-atipico-categoria'].descartados).toBe(1);
  });

  it('sem agregados devolve vazio', () => {
    expect(vertente.detectar({ agregados: [], empenhosPorId: new Map() })).toEqual([]);
  });
});
