'use strict';

const { promoverDoResumo } = require('./promover-resumo');

const TEXTO =
  'PREGÃO 03/2020. Abertura das propostas em 05/02/2020 às 09:00. VALOR ESTIMADO: R$ 176.000,00. ' +
  'Homologado em 20/02/2020.';
const doc = (extra = {}) => ({
  ano: 2020,
  texto_completo: TEXTO,
  data_abertura: null,
  valor_estimado: null,
  ...extra,
});
const resumo = (datas = [], valores = []) => ({ datas_relevantes: datas, valores });
const abertura = (data, trecho = 'Abertura das propostas em 05/02/2020') => ({
  tipo: 'abertura',
  data,
  descricao: 'Abertura das propostas',
  trecho_fonte: trecho,
});
const estimado = (valor, extra = {}) => ({
  tipo: 'estimado',
  valor,
  descricao: 'Valor estimado total',
  trecho_fonte: 'VALOR ESTIMADO: R$ 176.000,00',
  ...extra,
});

describe('promoverDoResumo', () => {
  it('promove abertura e valor estimado quando o trecho existe no texto do documento', () => {
    const r = promoverDoResumo({
      resumo: resumo([abertura('2020-02-05')], [estimado(176000)]),
      documento: doc(),
    });
    expect(r.data_abertura).toBe('2020-02-05');
    expect(r.valor_estimado).toBe(176000);
  });

  it('ignora acento, caixa e espaços ao procurar o trecho', () => {
    const r = promoverDoResumo({
      resumo: resumo([abertura('2020-02-05', 'ABERTURA  das propostas   em 05/02/2020')]),
      documento: doc(),
    });
    expect(r.data_abertura).toBe('2020-02-05');
  });

  it('descarta quando o trecho não está no texto (resumo inventou)', () => {
    const r = promoverDoResumo({
      resumo: resumo(
        [abertura('2020-02-05', 'sessão pública em 05/02/2020 às 14h')],
        [estimado(176000, { trecho_fonte: 'valor de R$ 999,00' })]
      ),
      documento: doc(),
    });
    expect(r.data_abertura).toBeUndefined();
    expect(r.valor_estimado).toBeUndefined();
    expect(r.recusas.join(' ')).toMatch(/trecho/);
  });

  it('recusa abertura mais de 30 dias antes da publicação (typo no edital, ex.: 12/011/2025)', () => {
    const r = promoverDoResumo({
      resumo: resumo([abertura('2020-02-05')]),
      documento: doc({ data_publicacao: '2020-04-10' }),
    });
    expect(r.data_abertura).toBeUndefined();
    expect(r.recusas.join(' ')).toMatch(/antes da publicação/);
    const ok = promoverDoResumo({
      resumo: resumo([abertura('2020-02-05')]),
      documento: doc({ data_publicacao: '2020-02-01' }),
    });
    expect(ok.data_abertura).toBe('2020-02-05');
  });

  it('recusa "abertura" que na verdade é data de pedido/orçamento/cotação anexada', () => {
    const r = promoverDoResumo({
      resumo: resumo([
        {
          tipo: 'abertura',
          data: '2020-02-05',
          descricao: 'Data do pedido',
          trecho_fonte: 'Abertura das propostas em 05/02/2020',
        },
      ]),
      documento: doc(),
    });
    expect(r.data_abertura).toBeUndefined();
    expect(r.recusas.join(' ')).toMatch(/pedido|orçamento|cotação/);
    const legitima = promoverDoResumo({
      resumo: resumo([
        {
          tipo: 'abertura',
          data: '2020-02-05',
          descricao: 'Abertura da sessão e recebimento de propostas comerciais',
          trecho_fonte: 'Abertura das propostas em 05/02/2020',
        },
      ]),
      documento: doc(),
    });
    expect(legitima.data_abertura).toBe('2020-02-05');
  });

  it('recusa abertura cuja descrição não fala de abertura/sessão/propostas (ex.: inauguração)', () => {
    const r = promoverDoResumo({
      resumo: resumo([
        {
          tipo: 'abertura',
          data: '2020-02-05',
          descricao: 'Data da inauguração do Deck',
          trecho_fonte: 'Abertura das propostas em 05/02/2020',
        },
      ]),
      documento: doc(),
    });
    expect(r.data_abertura).toBeUndefined();
    expect(r.recusas.join(' ')).toMatch(/não indica abertura/);
    const inscricao = promoverDoResumo({
      resumo: resumo([
        {
          tipo: 'abertura',
          data: '2020-02-05',
          descricao: 'Período de inscrição',
          trecho_fonte: 'Abertura das propostas em 05/02/2020',
        },
      ]),
      documento: doc(),
    });
    expect(inscricao.data_abertura).toBe('2020-02-05');
  });

  it('não sobrescreve coluna já preenchida', () => {
    const r = promoverDoResumo({
      resumo: resumo([abertura('2020-02-05')], [estimado(176000)]),
      documento: doc({ data_abertura: '2020-02-06', valor_estimado: 100 }),
    });
    expect(r.data_abertura).toBeUndefined();
    expect(r.valor_estimado).toBeUndefined();
  });

  it('recusa data implausível para o ano do documento e data malformada', () => {
    const longe = promoverDoResumo({ resumo: resumo([abertura('2012-02-05')]), documento: doc() });
    const ruim = promoverDoResumo({ resumo: resumo([abertura('05/02/2020')]), documento: doc() });
    expect(longe.data_abertura).toBeUndefined();
    expect(ruim.data_abertura).toBeUndefined();
  });

  it('com vários valores estimados só promove o total; ambíguo é recusado', () => {
    const itens = {
      descricao: 'Valor unitário do item 1',
      trecho_fonte: 'VALOR ESTIMADO: R$ 176.000,00',
    };
    const ok = promoverDoResumo({
      resumo: resumo([], [estimado(10, itens), estimado(176000)]),
      documento: doc(),
    });
    expect(ok.valor_estimado).toBe(176000);
    const ambiguo = promoverDoResumo({
      resumo: resumo(
        [],
        [estimado(176000, { descricao: 'total A' }), estimado(180000, { descricao: 'total B' })]
      ),
      documento: doc(),
    });
    expect(ambiguo.valor_estimado).toBeUndefined();
    expect(ambiguo.recusas.join(' ')).toMatch(/ambíguo/);
  });

  it('promove homologação só com data coerente (não antes da abertura)', () => {
    const hom = (data, trecho = 'Homologado em 20/02/2020') => ({
      tipo: 'homologacao',
      data,
      trecho_fonte: trecho,
    });
    const ok = promoverDoResumo({
      resumo: resumo([abertura('2020-02-05'), hom('2020-02-20')]),
      documento: doc(),
    });
    expect(ok.data_homologacao).toBe('2020-02-20');
    const antes = promoverDoResumo({
      resumo: resumo([abertura('2020-02-05'), hom('2020-01-10', 'Homologado em 20/02/2020')]),
      documento: doc(),
    });
    expect(antes.data_homologacao).toBeUndefined();
  });

  it('resumo sem os campos não promove nada e não quebra', () => {
    expect(promoverDoResumo({ resumo: {}, documento: doc() })).toEqual({ recusas: [] });
    expect(promoverDoResumo({ resumo: null, documento: doc() })).toEqual({ recusas: [] });
  });
});
