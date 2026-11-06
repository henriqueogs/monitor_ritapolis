'use strict';

const vertente = require('./compras-repetidas');
const { chaveDoObjeto } = vertente;
const { rodarVertentes, validarVertente } = require('./orquestrador');

const CNPJ = '11111111000111';
let seq = 0;
const empenho = (dia, extra = {}) => {
  seq += 1;
  return {
    id: seq,
    empenho: `${String(seq).padStart(5, '0')}-000`,
    exercicio_orcamento: 2025,
    tipo: 'EO',
    data_empenho: `2025-03-${String(dia).padStart(2, '0')}`,
    credor_nome: 'AUTO PECAS LTDA',
    credor_cnpj: CNPJ,
    valor: 20000,
    historico: `Aquisição de pneus para a frota municipal, requisição ${seq}`,
    ...extra,
  };
};
const quatro = () => [1, 8, 15, 22].map(d => empenho(d));
const ctx = (empenhos, extra = {}) => ({
  empenhos,
  credoresComInstrumento: new Set(),
  ...extra,
});

describe('chaveDoObjeto', () => {
  it('ignora números, acentos, caixa e palavras vazias', () => {
    expect(chaveDoObjeto('Aquisição de PNEUS para a frota, requisição 12')).toBe(
      chaveDoObjeto('aquisicao de pneus para frota - requisicao 98')
    );
  });
  it('ignora o verbo "empenha" que abre quase todo histórico', () => {
    expect(chaveDoObjeto('EMPENHA PECAS MANUTENCAO VEICULO')).toBe('pecas manutencao veiculo');
  });
  it('objetos diferentes têm chaves diferentes', () => {
    expect(chaveDoObjeto('Aquisição de pneus')).not.toBe(chaveDoObjeto('Aquisição de combustível'));
  });
});

describe('vertente compras-repetidas', () => {
  beforeEach(() => {
    seq = 0;
  });

  it('cumpre o contrato', () => {
    expect(validarVertente(vertente)).toEqual([]);
  });

  it('sinaliza 4 empenhos abaixo do limite cuja soma o supera, sem instrumento', () => {
    const { candidatos, resumo } = rodarVertentes(ctx(quatro()), [vertente]);
    expect(resumo['compras-repetidas'].erro).toBeNull();
    expect(candidatos).toHaveLength(1);
    const c = candidatos[0];
    expect(c.metrica).toMatchObject({ unidade: 'R$', valor: 80000, empenhos: 4 });
    expect(c.periodo).toEqual({ inicio: '2025-03-01', fim: '2025-03-22' });
    expect(c.evidencias).toHaveLength(4);
    expect(c.evidencias[0].url_origem).toMatch(/^https?:\/\//);
    expect(c.titulo).toMatch(/AUTO PECAS LTDA/);
  });

  it('não sinaliza quando há instrumento (contrato/ata/licitação) do credor', () => {
    const r = vertente.detectar(ctx(quatro(), { credoresComInstrumento: new Set([CNPJ]) }));
    expect(r).toEqual([]);
  });

  it('não sinaliza se a soma não atinge o limite do ano', () => {
    const baixos = [1, 8, 15, 22].map(d => empenho(d, { valor: 5000 }));
    expect(vertente.detectar(ctx(baixos))).toEqual([]);
  });

  it('não sinaliza se algum empenho já está acima do limite (cai em licitação, não em fracionamento)', () => {
    const e = quatro();
    e[0].valor = 90000;
    expect(vertente.detectar(ctx(e))).toEqual([]);
  });

  it('exige ao menos 4 datas de empenho distintas na janela de 90 dias', () => {
    expect(vertente.detectar(ctx(quatro().slice(0, 3)))).toEqual([]);
    const mesmoDia = [1, 1, 1, 1].map(d => empenho(d));
    expect(vertente.detectar(ctx(mesmoDia))).toEqual([]);
  });

  it('empenhos a mais de 90 dias não formam janela', () => {
    const espalhados = [
      empenho(1, { data_empenho: '2025-01-01' }),
      empenho(1, { data_empenho: '2025-03-15' }),
      empenho(1, { data_empenho: '2025-06-01' }),
      empenho(1, { data_empenho: '2025-09-01' }),
    ];
    expect(vertente.detectar(ctx(espalhados))).toEqual([]);
  });

  it('deixa de fora pessoa física, folha, tributos e concessionárias', () => {
    const pf = quatro().map(e => ({ ...e, credor_cnpj: '12345678901' }));
    const folha = quatro().map(e => ({ ...e, historico: 'Folha de pagamento de servidores' }));
    expect(vertente.detectar(ctx(pf))).toEqual([]);
    expect(vertente.detectar(ctx(folha))).toEqual([]);
  });

  it('só considera empenho original (EO)', () => {
    const anulacoes = quatro().map(e => ({ ...e, tipo: 'EE' }));
    expect(vertente.detectar(ctx(anulacoes))).toEqual([]);
  });

  it('linguagem sem acusação: fato, critério e o que falta confirmar', () => {
    const [c] = vertente.detectar(ctx(quatro()));
    expect(c.narrativa).toMatch(/não localizou/i);
    expect(c.narrativa).not.toMatch(/fraude|irregular|ilegal|desvio/i);
    expect(c.alerta.metadados.campos_a_verificar.length).toBeGreaterThan(0);
  });
});
