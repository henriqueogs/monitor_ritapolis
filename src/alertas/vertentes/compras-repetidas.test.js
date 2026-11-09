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
  it('a 4ª palavra do histórico não fragmenta o mesmo objeto', () => {
    expect(chaveDoObjeto('EMPENHA PECAS MANUTENCAO VEICULO PLACA ABC')).toBe(
      chaveDoObjeto('EMPENHA PECAS MANUTENCAO VEICULO MARCA FIAT')
    );
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

  it('junta janelas sobrepostas do mesmo credor (objetos diferentes) em um só candidato', () => {
    const pneus = [1, 8, 15, 22].map(d => empenho(d));
    const filtros = [3, 10, 17, 24].map(d =>
      empenho(d, { historico: 'Aquisição de filtros para a frota municipal' })
    );
    const r = vertente.detectar(ctx([...pneus, ...filtros]));
    expect(r).toHaveLength(1);
    expect(r[0].metrica).toMatchObject({ empenhos: 8, valor: 160000 });
    expect(r[0].alerta.metadados.objetos_chave.sort()).toEqual(['filtros frota', 'pneus frota']);
    expect(r[0].evidencias).toHaveLength(8);
  });

  it('janelas do mesmo credor sem sobreposição continuam separadas', () => {
    const marco = [1, 8, 15, 22].map(d => empenho(d));
    const setembro = [1, 8, 15, 22].map(d =>
      empenho(d, { data_empenho: `2025-09-${String(d).padStart(2, '0')}` })
    );
    expect(vertente.detectar(ctx([...marco, ...setembro]))).toHaveLength(2);
  });

  it('limita as evidências às de maior valor', () => {
    const muitos = Array.from({ length: 14 }, (_, i) =>
      empenho((i % 28) + 1, { valor: 20000 + i })
    );
    const [c] = vertente.detectar(ctx(muitos));
    expect(c.metrica.empenhos).toBe(14);
    expect(c.evidencias).toHaveLength(10);
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

  it('escreve datas em pt-BR e objetos com acento, sem palavras internas', () => {
    const e = [1, 8, 15, 22].map(d =>
      empenho(d, { historico: 'Aquisição de peças para manutenção do caminhão' })
    );
    const [c] = vertente.detectar(ctx(e));
    expect(c.titulo).toContain('01/03/2025 e 22/03/2025');
    expect(c.titulo).toContain('peças manutenção caminhão');
    expect(c.titulo).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(c.alerta.valor_periodo_label).toBe('Empenhado entre 01/03/2025 e 22/03/2025');
  });

  it('declara quando o limite é estimado (ano sem decreto na tabela)', () => {
    const e = [1, 8, 15, 22].map(d => empenho(d, { exercicio_orcamento: 2099 }));
    const [c] = vertente.detectar(ctx(e));
    expect(c.metrica.limite_estimado).toBe(true);
    expect(c.narrativa).toMatch(/limite de dispensa de 2026.*o de 2099 ainda não consta/s);
  });

  it('não diz "estimado" quando o limite do ano é o do decreto', () => {
    const [c] = vertente.detectar(ctx(quatro()));
    expect(c.narrativa).toContain('limite de dispensa de 2025');
    expect(c.narrativa).not.toMatch(/estimad|ainda não/i);
  });

  it('avisa que as evidências são só as maiores quando há mais empenhos', () => {
    const muitos = Array.from({ length: 14 }, (_, i) =>
      empenho((i % 28) + 1, { valor: 20000 + i })
    );
    const [c] = vertente.detectar(ctx(muitos));
    expect(c.narrativa).toMatch(/10 maiores empenhos entre os 14/);
  });

  describe('processo e adesão citados nos históricos', () => {
    const citando = (dia, historico) =>
      empenho(dia, { historico: `Aquisição de pneus CONFORME ${historico}` });
    const quatroCitando = historico => [1, 8, 15, 22].map(d => citando(d, historico));

    it('ignora empenhos cujo processo citado está no acervo (há instrumento localizado)', () => {
      const e = quatroCitando('PROCESSO LICITATÓRIO N°52/25');
      const r = vertente.detectar(ctx(e, { processosNoAcervo: new Set(['52/2025']) }));
      expect(r).toEqual([]);
    });

    it('processo citado e ausente do acervo: aponta onde conferir, severidade info', () => {
      const e = quatroCitando('PROCESSO LICITATÓRIO N°52/25 ADESÃO N°12/2025');
      const [c] = vertente.detectar(ctx(e, { processosNoAcervo: new Set() }));
      expect(c.severidade).toBe('info');
      expect(c.narrativa).toContain('Processo 52/2025 (4 de 4 empenhos)');
      expect(c.narrativa).toContain('Adesão 12/2025 (4 de 4 empenhos)');
      expect(c.alerta.metadados.processos_citados).toEqual([{ chave: '52/2025', n: 4 }]);
      expect(c.alerta.metadados.adesoes_citadas).toEqual([{ chave: '12/2025', n: 4 }]);
    });

    it('sem citação: severidade atenção e texto diz que os históricos não citam processo', () => {
      const [c] = vertente.detectar(ctx(quatro()));
      expect(c.severidade).toBe('atencao');
      expect(c.narrativa).toMatch(/não citam processo nem adesão/);
    });

    it('sem o conjunto processosNoAcervo no contexto, nada é considerado localizado', () => {
      const e = quatroCitando('PROCESSO LICITATÓRIO N°52/25');
      expect(vertente.detectar({ empenhos: e, credoresComInstrumento: new Set() })).toHaveLength(1);
    });
  });

  describe('modalidade registrada no portal', () => {
    const comModalidade = modalidade =>
      [1, 8, 15, 22].map(d => empenho(d, { modalidade, licitacao_ref: '00005225 / 0' }));

    it.each([
      'Adesão a Registro de Preços - 00122025',
      'Pregão Eletrônico - 00012025',
      'Concorrência - 00032025',
    ])('empenhos com procedimento (%s) estão cobertos e saem', modalidade => {
      expect(vertente.detectar(ctx(comModalidade(modalidade)))).toEqual([]);
    });

    it('dispensa continua candidata, com a modalidade no texto e nos metadados', () => {
      const [c] = vertente.detectar(ctx(comModalidade('Dispensa de Licitação - 00042025')));
      expect(c).toBeDefined();
      expect(c.narrativa).toContain('Dispensa de Licitação - 00042025 (4 de 4 empenhos)');
      expect(c.alerta.metadados.modalidades).toEqual([
        { modalidade: 'Dispensa de Licitação - 00042025', n: 4 },
      ]);
    });

    it('sem modalidade (ainda não coletada) o comportamento não muda', () => {
      const [c] = vertente.detectar(ctx(quatro()));
      expect(c.alerta.metadados.modalidades).toEqual([]);
      expect(c.narrativa).not.toMatch(/modalidade|constam no portal/i);
    });
  });

  it('linguagem sem acusação: fato, critério e o que falta confirmar', () => {
    const [c] = vertente.detectar(ctx(quatro()));
    expect(c.narrativa).toMatch(/não localizou/i);
    expect(c.narrativa).not.toMatch(/fraude|irregular|ilegal|desvio/i);
    expect(c.alerta.metadados.campos_a_verificar.length).toBeGreaterThan(0);
  });
});
