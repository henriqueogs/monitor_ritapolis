'use strict';

const {
  limiteDispensa,
  CATEGORIAS_LIMITE,
  motivoExclusao,
  MOTIVOS_EXCLUSAO,
} = require('./limites-dispensa');

describe('limiteDispensa', () => {
  it('devolve limites do ano configurado', () => {
    const r = limiteDispensa(2025, CATEGORIAS_LIMITE.OUTROS);
    expect(r.ano).toBe(2025);
    expect(r.valor).toBeGreaterThan(50000);
    expect(r.estimado).toBe(false);
  });

  it.each([
    [2022, 108040.82, 54020.41],
    [2023, 114416.65, 57208.33],
    [2024, 119812.02, 59906.02],
    [2025, 125451.15, 62725.59],
    [2026, 130984.2, 65492.11],
  ])('valores de %i batem com o Anexo do decreto (conferido no Planalto)', (ano, obras, outros) => {
    expect(limiteDispensa(ano, CATEGORIAS_LIMITE.OBRAS)).toMatchObject({
      valor: obras,
      estimado: false,
    });
    expect(limiteDispensa(ano, CATEGORIAS_LIMITE.OUTROS)).toMatchObject({
      valor: outros,
      estimado: false,
    });
  });

  it('obras e engenharia têm limite maior que compras e serviços', () => {
    const obras = limiteDispensa(2024, CATEGORIAS_LIMITE.OBRAS).valor;
    const outros = limiteDispensa(2024, CATEGORIAS_LIMITE.OUTROS).valor;
    expect(obras).toBeGreaterThan(outros);
  });

  it('ano sem configuração usa o último ano anterior e marca como estimado', () => {
    const r = limiteDispensa(2099, CATEGORIAS_LIMITE.OUTROS);
    expect(r.estimado).toBe(true);
    expect(r.ano).toBeLessThan(2099);
  });

  it('ano anterior ao primeiro configurado devolve null', () => {
    expect(limiteDispensa(1990, CATEGORIAS_LIMITE.OUTROS)).toBeNull();
  });

  it('categoria desconhecida devolve null', () => {
    expect(limiteDispensa(2025, 'xyz')).toBeNull();
  });
});

describe('motivoExclusao', () => {
  const pj = '12345678000190';

  it.each([
    ['INSS retido', 'Recolhimento de INSS patronal', MOTIVOS_EXCLUSAO.PREVIDENCIA],
    ['regime próprio', 'Contribuição ao RPPS', MOTIVOS_EXCLUSAO.PREVIDENCIA],
    ['folha', 'Folha de pagamento outubro', MOTIVOS_EXCLUSAO.FOLHA],
    ['folha sem "de"', 'FOLHA PAGAMENTO', MOTIVOS_EXCLUSAO.FOLHA],
    ['tributo', 'Pagamento de ISS e IPTU', MOTIVOS_EXCLUSAO.TRIBUTOS],
    ['repasse', 'EMPENHA REPASSE APAE PROGRAMA', MOTIVOS_EXCLUSAO.REPASSE],
    ['subvenção', 'Subvenção social à entidade', MOTIVOS_EXCLUSAO.REPASSE],
    ['energia', 'Fornecimento de energia elétrica', MOTIVOS_EXCLUSAO.CONCESSIONARIA],
    ['água', 'Tarifa de água e esgoto', MOTIVOS_EXCLUSAO.CONCESSIONARIA],
  ])('exclui %s', (_n, historico, esperado) => {
    expect(motivoExclusao({ credor_documento: pj, historico })).toBe(esperado);
  });

  it('exclui pessoa física por construção (LGPD)', () => {
    expect(motivoExclusao({ credor_documento: '12345678901', historico: 'Compra de peças' })).toBe(
      MOTIVOS_EXCLUSAO.PESSOA_FISICA
    );
  });

  it('exclui credor sem documento (não dá para afirmar PJ)', () => {
    expect(motivoExclusao({ credor_documento: null, historico: 'Compra de peças' })).toBe(
      MOTIVOS_EXCLUSAO.PESSOA_FISICA
    );
  });

  it('não exclui compra comum de PJ', () => {
    expect(motivoExclusao({ credor_documento: pj, historico: 'Aquisição de pneus' })).toBeNull();
  });

  it('ignora acentos e caixa', () => {
    expect(
      motivoExclusao({ credor_documento: pj, historico: 'FORNECIMENTO DE ENERGIA ELÉTRICA' })
    ).toBe(MOTIVOS_EXCLUSAO.CONCESSIONARIA);
  });
});
