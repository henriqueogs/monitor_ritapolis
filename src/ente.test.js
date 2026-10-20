'use strict';

const ENV_PADRAO = {
  CNPJ_PREFEITURA: undefined,
  CNPJ_CAMARA: undefined,
  IBGE_CODE: undefined,
  UF_MUNICIPIO: undefined,
  MUNICIPIO_NOME: undefined,
};

function carregarEnte(env = {}) {
  const guardado = {};
  const final = { ...ENV_PADRAO, ...env };
  for (const [chave, valor] of Object.entries(final)) {
    guardado[chave] = process.env[chave];
    if (valor === undefined) {
      delete process.env[chave];
    } else {
      process.env[chave] = valor;
    }
  }
  try {
    let modulo;
    jest.isolateModules(() => {
      modulo = require('./ente');
    });
    return modulo;
  } finally {
    for (const [chave, valor] of Object.entries(guardado)) {
      if (valor === undefined) {
        delete process.env[chave];
      } else {
        process.env[chave] = valor;
      }
    }
  }
}

describe('ente (identidade do município como configuração)', () => {
  it('sem variáveis de ambiente, é Ritápolis/MG (padrão atual do projeto)', () => {
    const { ente } = carregarEnte();

    expect(ente).toMatchObject({
      nome: 'Ritápolis',
      uf: 'MG',
      ibge: '3156106',
      cnpjPrefeitura: '18557553000105',
      cnpjCamara: '26148056000181',
    });
  });

  it('as variáveis de ambiente trocam o ente inteiro', () => {
    const { ente } = carregarEnte({
      CNPJ_PREFEITURA: '11.222.333/0001-81',
      CNPJ_CAMARA: '44555666000199',
      IBGE_CODE: '3100104',
      UF_MUNICIPIO: 'sp',
      MUNICIPIO_NOME: 'Cidade Exemplo',
    });

    expect(ente).toMatchObject({
      nome: 'Cidade Exemplo',
      uf: 'SP',
      ibge: '3100104',
      cnpjPrefeitura: '11222333000181',
      cnpjCamara: '44555666000199',
    });
  });

  it('órgãos do ente levam o nome do município (usado pelo coletor do PNCP)', () => {
    const { ente } = carregarEnte({ MUNICIPIO_NOME: 'Cidade Exemplo' });

    expect(ente.orgaos).toEqual([
      { cnpj: ente.cnpjPrefeitura, nome: 'Prefeitura Municipal de Cidade Exemplo' },
      { cnpj: ente.cnpjCamara, nome: 'Câmara Municipal de Cidade Exemplo' },
    ]);
  });

  it.each([
    ['CNPJ_PREFEITURA', '123'],
    ['CNPJ_PREFEITURA', 'abc'],
    ['CNPJ_CAMARA', '1234567890123'],
    ['UF_MUNICIPIO', 'MGX'],
    ['UF_MUNICIPIO', '1'],
    ['IBGE_CODE', '31561'],
    ['IBGE_CODE', 'abcdefg'],
  ])('%s inválido (%p) falha no carregamento, com a variável no erro', (variavel, valor) => {
    expect(() => carregarEnte({ [variavel]: valor })).toThrow(new RegExp(variavel));
  });

  it('o ente é imutável', () => {
    const { ente } = carregarEnte();

    expect(Object.isFrozen(ente)).toBe(true);
    expect(Object.isFrozen(ente.orgaos)).toBe(true);
  });
});

describe('formatarCnpj', () => {
  const { formatarCnpj } = carregarEnte();

  it('formata 14 dígitos, com ou sem máscara', () => {
    expect(formatarCnpj('18557553000105')).toBe('18.557.553/0001-05');
    expect(formatarCnpj('18.557.553/0001-05')).toBe('18.557.553/0001-05');
  });

  it('valor que não é CNPJ vira null', () => {
    expect(formatarCnpj('123')).toBeNull();
    expect(formatarCnpj(null)).toBeNull();
    expect(formatarCnpj(undefined)).toBeNull();
  });
});

describe('isCnpjDoEnte', () => {
  const { isCnpjDoEnte, cnpjsDoEnte } = carregarEnte();

  it('reconhece Prefeitura e Câmara em qualquer formatação', () => {
    expect(isCnpjDoEnte('18557553000105')).toBe(true);
    expect(isCnpjDoEnte('18.557.553/0001-05')).toBe(true);
    expect(isCnpjDoEnte('26.148.056/0001-81')).toBe(true);
  });

  it('outro CNPJ, vazio ou nulo não é do ente', () => {
    expect(isCnpjDoEnte('00000000000191')).toBe(false);
    expect(isCnpjDoEnte('')).toBe(false);
    expect(isCnpjDoEnte(null)).toBe(false);
  });

  it('cnpjsDoEnte lista só dígitos, sem repetição', () => {
    expect(cnpjsDoEnte()).toEqual(['18557553000105', '26148056000181']);
  });
});

describe('nomeChave (comparação de nome sem acento e caixa)', () => {
  it('é o nome normalizado', () => {
    expect(carregarEnte().ente.nomeChave).toBe('ritapolis');
    expect(carregarEnte({ MUNICIPIO_NOME: 'São João Del-Rei' }).ente.nomeChave).toBe(
      'sao joao del-rei'
    );
  });
});
