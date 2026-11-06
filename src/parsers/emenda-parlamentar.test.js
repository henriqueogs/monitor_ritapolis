'use strict';

const {
  parseEmendaParlamentar,
  parsearValorMonetario,
  parsearDataBR,
  inferirEsfera,
  extrairParlamentar,
  higienizarGestorResponsavel,
  extrairDadosBancariosEmenda,
  extrairEmpenhosDadosDespesa,
  unificarEmendasPorInstrumento,
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
  'BANCO : Banco do Brasil AGÊNCIA: 0162-7 CONTA BANCÁRIA: 101023-9',
  'DATA DE RECEBIMENTO DO RECURSO: 20/06/2025',
  'DADOS DA DESPESA: EO 03100-000 VALOR: R$ 79.000,00',
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

const TEXTO_FEDERAL_LINHA_UNICA =
  'EMENDAS FEDERAIS 1 – DADOS DA INDICAÇÃO N.º DA EMENDA : 202540290015 ' +
  'NOME DO PARLAMENTAR : Lafayette de Andrada – Deputado Federal ' +
  'PARTIDO DO PARLAMENTAR : Republicanos UNIDADE PARLAMENTAR : Câmara dos Deputados ou Senado Federal ' +
  'TIPO DE TRANSFERÊNCIA : FNAS TIPO DE EMENDA : Individual ' +
  'OBJETO : VALOR DO REPASSE: R$ 100.000,00 ' +
  'ÓRGÃO TRANSFERIDOR: Fundo Nacional de Assistência Social ' +
  'INSTRUMENTO LEGAL: Emenda 202540290015 ' +
  'CATEGORIA ECONÔMICA: Custeio ' +
  'GESTOR RESPONSÁVEL: Secretária Municipal de Assistência Social BANCO : Banco do Brasil AGÊNCIA: 0162-7 CONTA BANCÁRIA: 39.882-9 ' +
  'DATA DE RECEBIMENTO DO RECURSO: 08/08/2025';

describe('parseEmendaParlamentar — federal em linha única (caso real)', () => {
  let r;
  beforeEach(() => { r = parseEmendaParlamentar(TEXTO_FEDERAL_LINHA_UNICA); });

  it('nome e cargo limpos, sem engolir o resto do registro', () => {
    expect(r.nome_parlamentar).toBe('Lafayette de Andrada');
    expect(r.cargo_parlamentar).toBe('Deputado Federal');
  });

  it('partido sem despejo do registro', () => {
    expect(r.partido).toBe('Republicanos');
  });

  it('valor do repasse correto', () => {
    expect(r.valor_repasse).toBe(100000);
  });

  it('instrumento legal curto, não o registro inteiro', () => {
    expect(r.instrumento_legal).toBe('Emenda 202540290015');
    expect(r.instrumento_legal.length).toBeLessThan(40);
  });

  it('objeto vazio na fonte vira null (não captura o valor seguinte)', () => {
    expect(r.objeto).toBeNull();
  });

  it('gestor_responsavel não vaza BANCO / AGÊNCIA / CONTA BANCÁRIA', () => {
    expect(r.gestor_responsavel).toBe('Secretária Municipal de Assistência Social');
    expect(r.banco).toBe('Banco do Brasil');
    expect(r.agencia).toBe('0162-7');
    expect(r.conta_bancaria).toBe('39.882-9');
  });

  it('campos não estouram (nenhum > 80 chars)', () => {
    for (const campo of ['nome_parlamentar', 'cargo_parlamentar', 'partido', 'instrumento_legal', 'orgao_transferidor', 'gestor_responsavel']) {
      if (r[campo]) { expect(r[campo].length).toBeLessThanOrEqual(80); }
    }
  });
});

describe('higienizarGestorResponsavel, extrairDadosBancariosEmenda e extrairEmpenhosDadosDespesa', () => {
  it('separa gestor e dados bancários de strings legadas já salvas', () => {
    const legado = 'Secretária Municipal de Saúde BANCO : Banco do Brasil AGÊNCIA: 0162-7 CONTA BANCÁRIA: 101.015-8';
    expect(higienizarGestorResponsavel(legado)).toBe('Secretária Municipal de Saúde');
    expect(extrairDadosBancariosEmenda(legado)).toEqual({
      banco: 'Banco do Brasil',
      agencia: '0162-7',
      conta_bancaria: '101.015-8',
    });
  });

  it('extrai empenhos discriminados de dados_despesa', () => {
    expect(extrairEmpenhosDadosDespesa('EO 03099-000 VALOR: R$ 140.900,00')).toEqual([
      {
        codigo: 'EO 03099-000',
        tipo: 'EO',
        numero_empenho: '03099-000',
        valor: 140900,
      },
    ]);
  });

  it('unifica emendas da mesma resolução (ex.: Resolução N.10088/2025 #645 + #649) discriminando as parcelas', () => {
    const rows = [
      {
        id: 645,
        titulo: 'Emenda Estadual 2025 - Resolução N.10088/2025',
        ano: 2025,
        esfera: 'estadual',
        numero_emenda: 'Resolução N.10088/2025',
        nome_parlamentar: 'Sargento Rodrigues',
        valor_repasse: 73490,
        objeto_detalhado: 'aquisição de veículo para atender a secretaria municipal de saúde',
        gestor_responsavel: 'Secretária Municipal de Saúde BANCO : Banco do Brasil AGÊNCIA: 0162-7 CONTA BANCÁRIA: 101.015-8',
        dados_despesa: 'EO 03099-000 VALOR: R$ 140.900,00',
        url_pdf: 'https://www.ritapolis.mg.gov.br/obter_arquivo_cadastro_generico.php?INT_ARQ=230751',
      },
      {
        id: 649,
        titulo: 'Emenda Estadual 2025 - Resolução N.10088/2025',
        ano: 2025,
        esfera: 'estadual',
        numero_emenda: 'Resolução N.10088/2025',
        nome_parlamentar: 'Sargento Rodrigues',
        valor_repasse: 76510,
        objeto_detalhado: 'aquisição de 01 veículo citroen c3 aircross minivan de 7 lugares 0 km',
        gestor_responsavel: 'Secretária Municipal de Saúde BANCO : Banco do Brasil AGÊNCIA: 0162-7 CONTA BANCÁRIA: 101.015-8',
        dados_despesa: 'EO 03099-000 VALOR: R$ 140.900,00',
        url_pdf: 'https://www.ritapolis.mg.gov.br/obter_arquivo_cadastro_generico.php?INT_ARQ=230753',
      },
    ];

    const unificadas = unificarEmendasPorInstrumento(rows);
    expect(unificadas).toHaveLength(1);
    expect(unificadas[0].valor_repasse).toBe(150000);
    expect(unificadas[0].gestor_responsavel).toBe('Secretária Municipal de Saúde');
    expect(unificadas[0].emenda_unificada).toBe(true);
    expect(unificadas[0].indicacoes_discriminadas).toHaveLength(2);
    expect(unificadas[0].indicacoes_discriminadas[0]).toMatchObject({
      documento_id: 645,
      valor_repasse: 73490,
    });
    expect(unificadas[0].indicacoes_discriminadas[1]).toMatchObject({
      documento_id: 649,
      valor_repasse: 76510,
    });
  });
});

describe('extrairCampo — rótulo não casa prefixo de rótulo maior', () => {
  const { extrairCampo } = require('./emenda-parlamentar');

  it('OBJETO não captura o conteúdo de OBJETO DETALHADO', () => {
    const txt =
      'OBJETO : Autoriza o repasse de recursos financeiros para aquisicao de veiculos ' +
      'conforme programacao da Lei Orcamentaria Anual aprovada para o exercicio corrente do municipio ' +
      'OBJETO DETALHADO: aquisicao de 01 veiculo';
    expect(extrairCampo(txt, 'OBJETO')).toMatch(/^Autoriza o repasse/);
    expect(extrairCampo(txt, 'OBJETO')).not.toMatch(/DETALHADO/);
    expect(extrairCampo(txt, 'OBJETO DETALHADO')).toBe('aquisicao de 01 veiculo');
  });
});

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

describe('anoReferenciaEmenda', () => {
  const { anoReferenciaEmenda } = require('./emenda-parlamentar');

  it('usa o ano da data de recebimento do recurso', () => {
    expect(
      anoReferenciaEmenda({ data_recebimento: '2024-03-15', numero_emenda: '202539600001', data_inicio: '2025-01-10' })
    ).toBe(2024);
  });

  it('sem recebimento, usa o ano do número federal (AAAA + 8 dígitos)', () => {
    expect(anoReferenciaEmenda({ numero_emenda: '202340290015', data_inicio: '2024-02-01' })).toBe(2023);
  });

  it('sem recebimento, usa o ano do número estadual (Resolução N.x/AAAA)', () => {
    expect(anoReferenciaEmenda({ numero_emenda: 'Resolução N.10063/2022' })).toBe(2022);
  });

  it('sem recebimento nem número com ano, usa o início', () => {
    expect(anoReferenciaEmenda({ numero_emenda: '10063', data_inicio: '2021-06-20' })).toBe(2021);
  });

  it('número sem ano reconhecível não inventa ano', () => {
    expect(anoReferenciaEmenda({ numero_emenda: '40290015' })).toBeNull();
  });

  it('retorna null sem nenhum campo', () => {
    expect(anoReferenciaEmenda({})).toBeNull();
    expect(anoReferenciaEmenda()).toBeNull();
  });
});

describe('parseEmendaParlamentar — ano_referencia', () => {
  it('estadual: ano do recebimento', () => {
    expect(parseEmendaParlamentar(TEXTO_ESTADUAL).ano_referencia).toBe(2025);
  });
});
