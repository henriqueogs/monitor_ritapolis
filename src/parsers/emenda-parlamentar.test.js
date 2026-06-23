'use strict';

const {
  parseEmendaParlamentar,
  parsearValorMonetario,
  parsearDataBR,
  inferirEsfera,
  extrairParlamentar,
  ESFERA,
} = require('./emenda-parlamentar');

const TEXTO_ESTADUAL = [
  'EMENDAS ESTADUAIS  1 – DADOS DA INDICAÇÃO',
  'N.º DA EMENDA : Resolução N.10063/2025',
  'NOME DO PARLAMENTAR : Doorgal Andrada – Deputado Estadual',
  'PARTIDO DO PARLAMENTAR : PRD',
  'UNIDADE PARLAMENTAR : Assembleia Legislativa de Minas Gerais',
  'TIPO DE TRANSFERÊNCIA : Transferência Especial SEGOV',
  'TIPO DE EMENDA : Individual',
  'OBJETO : Autoriza o repasse de recursos para aquisição de veículos.',
  'VALOR DO REPASSE: R$ 83.953,00',
  'ÓRGÃO TRANSFERIDOR: Secretaria de Governo de Minas Gerais',
  'INSTRUMENTO LEGAL: Resolução N.10063/2025',
  'CATEGORIA ECONÔMICA: Investimento',
  'OBJETO DETALHADO: aquisição de 01 veículo renault kwid',
  'VALOR DA CONTRAPARTIDA: R$ 0,00',
  'INÍCIO : 20/06/2025',
  'TÉRMINO :',
  'UNIDADE EXECUTORA: Secretaria de Saúde',
  'GESTOR RESPONSÁVEL: Secretária Municipal de Saúde',
  'DATA DE RECEBIMENTO DO RECURSO: 20/06/2025',
  'DADOS DA DESPESA: aquisição de material permanente',
].join('\n');

const TEXTO_FEDERAL = [
  'EMENDAS FEDERAIS  1 – DADOS DA INDICAÇÃO',
  'N.º DA EMENDA : 202539600001',
  'NOME DO PARLAMENTAR : Dr. Frederico – Deputado Federal',
  'PARTIDO DO PARLAMENTAR : PT',
  'TIPO DE TRANSFERÊNCIA : Fundo a Fundo',
  'TIPO DE EMENDA : Individual',
  'OBJETO : Apoio ao setor de saúde municipal',
  'VALOR DO REPASSE: R$ 1.234.567,89',
  'ÓRGÃO TRANSFERIDOR: Ministério da Saúde',
  'INSTRUMENTO LEGAL: Lei nº 14.789/2023',
  'CATEGORIA ECONÔMICA: Custeio',
  'VALOR DA CONTRAPARTIDA: R$ 5.000,00',
  'INÍCIO : 10/03/2025',
  'TÉRMINO : 09/03/2026',
  'UNIDADE EXECUTORA: Fundo Municipal de Saúde',
  'GESTOR RESPONSÁVEL: Secretário de Saúde',
  'DATA DE RECEBIMENTO DO RECURSO: 15/03/2025',
].join('\n');

describe('parseEmendaParlamentar', () => {
  describe('emenda estadual completa', () => {
    let resultado;
    beforeEach(() => { resultado = parseEmendaParlamentar(TEXTO_ESTADUAL); });

    it('retorna objeto para texto valido', () => {
      expect(resultado).not.toBeNull();
    });

    it('extrai numero da emenda', () => {
      expect(resultado.numero_emenda).toBe('Resolução N.10063/2025');
    });

    it('extrai nome do parlamentar separando do cargo', () => {
      expect(resultado.nome_parlamentar).toBe('Doorgal Andrada');
      expect(resultado.cargo_parlamentar).toBe('Deputado Estadual');
    });

    it('extrai partido', () => {
      expect(resultado.partido).toBe('PRD');
    });

    it('infere esfera estadual', () => {
      expect(resultado.esfera).toBe(ESFERA.ESTADUAL);
    });

    it('extrai tipo de emenda', () => {
      expect(resultado.tipo_emenda).toBe('Individual');
    });

    it('parseia valor do repasse como numero', () => {
      expect(resultado.valor_repasse).toBe(83953.00);
    });

    it('parseia valor da contrapartida zero', () => {
      expect(resultado.valor_contrapartida).toBe(0);
    });

    it('parseia data de inicio em formato ISO', () => {
      expect(resultado.data_inicio).toBe('2025-06-20');
    });

    it('retorna null para data de termino em branco', () => {
      expect(resultado.data_termino).toBeNull();
    });

    it('parseia data de recebimento', () => {
      expect(resultado.data_recebimento).toBe('2025-06-20');
    });

    it('extrai unidade executora', () => {
      expect(resultado.unidade_executora).toBe('Secretaria de Saúde');
    });

    it('extrai instrumento legal (espacos colapsados)', () => {
      expect(resultado.instrumento_legal).toBe('Resolução N.10063/2025');
    });
  });

  describe('emenda federal', () => {
    let resultado;
    beforeEach(() => { resultado = parseEmendaParlamentar(TEXTO_FEDERAL); });

    it('retorna objeto para texto federal valido', () => {
      expect(resultado).not.toBeNull();
    });

    it('infere esfera federal', () => {
      expect(resultado.esfera).toBe(ESFERA.FEDERAL);
    });

    it('parseia valor com milhoes', () => {
      expect(resultado.valor_repasse).toBe(1234567.89);
    });

    it('parseia data de termino', () => {
      expect(resultado.data_termino).toBe('2026-03-09');
    });
  });

  describe('textos invalidos', () => {
    it('retorna null para texto vazio', () => {
      expect(parseEmendaParlamentar('')).toBeNull();
    });

    it('retorna null para texto que nao e emenda', () => {
      expect(parseEmendaParlamentar('Este e um edital de pregao eletronico nr 001/2025.')).toBeNull();
    });

    it('retorna null para null', () => {
      expect(parseEmendaParlamentar(null)).toBeNull();
    });
  });
});

describe('parsearValorMonetario', () => {
  it('parseia valor simples', () => {
    expect(parsearValorMonetario('R$ 83.953,00')).toBe(83953.00);
  });

  it('parseia valor com milhoes', () => {
    expect(parsearValorMonetario('R$ 1.234.567,89')).toBe(1234567.89);
  });

  it('parseia zero', () => {
    expect(parsearValorMonetario('R$ 0,00')).toBe(0);
  });

  it('retorna null para string sem valor', () => {
    expect(parsearValorMonetario('sem valor')).toBeNull();
  });

  it('retorna null para null', () => {
    expect(parsearValorMonetario(null)).toBeNull();
  });
});

describe('parsearDataBR', () => {
  it('converte data BR para ISO', () => {
    expect(parsearDataBR('20/06/2025')).toBe('2025-06-20');
  });

  it('retorna null para string vazia', () => {
    expect(parsearDataBR('')).toBeNull();
  });

  it('retorna null para null', () => {
    expect(parsearDataBR(null)).toBeNull();
  });

  it('ignora texto sem data', () => {
    expect(parsearDataBR('sem data')).toBeNull();
  });
});

describe('extrairParlamentar', () => {
  it('separa nome e cargo com traco', () => {
    const r = extrairParlamentar('NOME DO PARLAMENTAR : Doorgal Andrada – Deputado Estadual');
    expect(r.nome).toBe('Doorgal Andrada');
    expect(r.cargo).toBe('Deputado Estadual');
  });

  it('retorna so nome quando nao ha cargo', () => {
    const r = extrairParlamentar('NOME DO PARLAMENTAR : Fulano da Silva');
    expect(r.nome).toBe('Fulano da Silva');
    expect(r.cargo).toBeNull();
  });

  it('retorna null para texto sem campo', () => {
    const r = extrairParlamentar('texto sem parlamentar');
    expect(r.nome).toBeNull();
    expect(r.cargo).toBeNull();
  });
});

describe('inferirEsfera', () => {
  it('detecta estadual por EMENDAS ESTADUAIS', () => {
    expect(inferirEsfera('EMENDAS ESTADUAIS', null)).toBe(ESFERA.ESTADUAL);
  });

  it('detecta federal por EMENDAS FEDERAIS', () => {
    expect(inferirEsfera('EMENDAS FEDERAIS', null)).toBe(ESFERA.FEDERAL);
  });

  it('detecta estadual pela assembleia', () => {
    expect(inferirEsfera('Assembleia Legislativa de Minas Gerais', null)).toBe(ESFERA.ESTADUAL);
  });

  it('retorna null quando nao consegue inferir', () => {
    expect(inferirEsfera('texto generico', null)).toBeNull();
  });
});
