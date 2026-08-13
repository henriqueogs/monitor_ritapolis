'use strict';

const {
  normalizarTipoModalidade,
  parseModalidadeDespesa,
  parseModalidadeEdital,
  modalidadesCorrespondem,
  vinculoDocumentoExato,
} = require('./modalidade');

describe('licitacoes/modalidade · normalizarTipoModalidade', () => {
  it('agrupa variações de pregão', () => {
    expect(normalizarTipoModalidade('Pregão')).toBe('pregao');
    expect(normalizarTipoModalidade('Pregão Presencial')).toBe('pregao');
    expect(normalizarTipoModalidade('PREGÃO PRESENCIAL RP')).toBe('pregao');
    expect(normalizarTipoModalidade('Pregão Eletrônico')).toBe('pregao');
  });

  it('agrupa variações de dispensa', () => {
    expect(normalizarTipoModalidade('Dispensa')).toBe('dispensa');
    expect(normalizarTipoModalidade('Dispensa de Licitação')).toBe('dispensa');
  });

  it('reconhece adesão (inclui "a Registro de Preços")', () => {
    expect(normalizarTipoModalidade('Adesão a Registro de Preços')).toBe('adesao');
    expect(normalizarTipoModalidade('Adesão')).toBe('adesao');
  });

  it('reconhece inexigibilidade, tomada, concorrência, leilão, chamamento', () => {
    expect(normalizarTipoModalidade('Inexigibilidade')).toBe('inexigibilidade');
    expect(normalizarTipoModalidade('Tomada de Preços')).toBe('tomada');
    expect(normalizarTipoModalidade('Concorrência Pública')).toBe('concorrencia');
    expect(normalizarTipoModalidade('Leilão')).toBe('leilao');
    expect(normalizarTipoModalidade('Chamada Pública')).toBe('chamamento');
    expect(normalizarTipoModalidade('Chamamento')).toBe('chamamento');
  });

  it('retorna null para desconhecido/vazio', () => {
    expect(normalizarTipoModalidade('')).toBeNull();
    expect(normalizarTipoModalidade('Qualquer Coisa')).toBeNull();
  });
});

describe('vinculoDocumentoExato', () => {
  it('aceita somente tipo, numero e ano identicos', () => {
    expect(vinculoDocumentoExato(
      'Adesao a Registro de Precos - 00022022',
      'Processo 0025/2022 - Adesao n 002/2022 - Ata'
    )).toBe(true);
    expect(vinculoDocumentoExato(
      'Adesao a Registro de Precos - 00022022',
      'Processo 0025/2022 - Pregao n 025/2022 - Ata'
    )).toBe(false);
  });

  it('recusa quando um dos lados nao tem modalidade parseavel', () => {
    expect(vinculoDocumentoExato('Pregao', 'Pregao 1/2026')).toBe(false);
  });
});

describe('licitacoes/modalidade · parseModalidadeDespesa', () => {
  it('decodifica sufixo NNNN+AAAA', () => {
    expect(parseModalidadeDespesa('Pregão - 00482023')).toEqual({ tipo: 'pregao', numero: 48, ano: 2023 });
  });

  it('decodifica adesão', () => {
    expect(parseModalidadeDespesa('Adesão a Registro de Preços - 00022022')).toEqual({
      tipo: 'adesao',
      numero: 2,
      ano: 2022,
    });
  });

  it('retorna null sem código numérico', () => {
    expect(parseModalidadeDespesa('Pregão')).toBeNull();
    expect(parseModalidadeDespesa('')).toBeNull();
  });
});

describe('licitacoes/modalidade · parseModalidadeEdital', () => {
  it('extrai a modalidade após o processo, não o número do processo', () => {
    expect(
      parseModalidadeEdital('Processo 0107/2023 - Pregão - 0048/2023 - Registro de Preços')
    ).toEqual({ tipo: 'pregao', numero: 48, ano: 2023 });
  });

  it('ignora "RP" e "nº" antes do número', () => {
    expect(
      parseModalidadeEdital('Processo 0042/2019 - Pregão Presencial RP 020/2019 - Registro')
    ).toEqual({ tipo: 'pregao', numero: 20, ano: 2019 });
    expect(
      parseModalidadeEdital('Processo 0088/2021 - Pregão Presencial RP nº 032/2021 - Contratação')
    ).toEqual({ tipo: 'pregao', numero: 32, ano: 2021 });
  });

  it('lida com dispensa de licitação com nº', () => {
    expect(
      parseModalidadeEdital('Processo 0072/2020 - Dispensa de Licitação nº 030/2020 - Contratação')
    ).toEqual({ tipo: 'dispensa', numero: 30, ano: 2020 });
  });

  it('retorna tipo sem número quando a modalidade não traz número', () => {
    expect(
      parseModalidadeEdital('Processo 0020/2017 - Dispensa - Prestação de Serviços Mecânicos')
    ).toEqual({ tipo: 'dispensa', numero: null, ano: null });
  });

  it('extrai inexigibilidade e adesão', () => {
    expect(parseModalidadeEdital('Processo 0087/2025 - Inexigibilidade nº 012/2025 - Banda')).toEqual({
      tipo: 'inexigibilidade',
      numero: 12,
      ano: 2025,
    });
    expect(parseModalidadeEdital('Processo 0017/2026 - Adesão nº 004/2026 - Adesão a Ata')).toEqual({
      tipo: 'adesao',
      numero: 4,
      ano: 2026,
    });
  });

  it('aceita a grafia oficial "Inexibilidade"', () => {
    expect(parseModalidadeEdital('Processo 0041/2026 - Inexibilidade n° 007/2026 - Passagens')).toEqual({
      tipo: 'inexigibilidade',
      numero: 7,
      ano: 2026,
    });
  });

  it('retorna null quando não há modalidade reconhecível', () => {
    expect(parseModalidadeEdital('Documento avulso sem modalidade')).toBeNull();
    expect(parseModalidadeEdital('')).toBeNull();
  });

  it('ignora número de lei/decreto citado no segmento da modalidade', () => {
    // "Decreto 10.024/2019" virava Pregão 24/2019 e capturava todo empenho
    // "Pregão - 00242019" para o documento errado.
    expect(
      parseModalidadeEdital('Processo 0107/2023 - Pregão Eletrônico nos termos do Decreto 10.024/2019 - Aquisição')
    ).toEqual({ tipo: 'pregao', numero: null, ano: null });

    expect(
      parseModalidadeEdital('Processo 0055/2024 - Dispensa Eletrônica - Lei 14.133/2021 - Aquisição de peças')
    ).toEqual({ tipo: 'dispensa', numero: null, ano: null });

    expect(parseModalidadeEdital('Aviso - Pregão Presencial - Lei 8.666/93 - Contratação')).toEqual({
      tipo: 'pregao',
      numero: null,
      ano: null,
    });
  });

  it('ignora modalidade citada no meio do objeto (título sem campo Modalidade)', () => {
    // Sem o campo "Modalidade nº", o título é "Processo NNNN/AAAA - objeto";
    // a palavra da modalidade no meio do objeto não identifica a licitação.
    expect(
      parseModalidadeEdital('Processo 0031/2022 - Contratação de empresa para leilão de bens - 003/2022')
    ).toBeNull();
  });

  it('aceita a modalidade quando a palavra está no início do segmento', () => {
    expect(parseModalidadeEdital('Aviso de Licitação - Pregão Presencial 048/2023 - Aquisição')).toEqual({
      tipo: 'pregao',
      numero: 48,
      ano: 2023,
    });
    expect(parseModalidadeEdital('Republicação do Pregão Presencial nº 010/2024 - Serviços')).toEqual({
      tipo: 'pregao',
      numero: 10,
      ano: 2024,
    });
  });

  // Títulos reais do acervo, extraídos do relatório de vínculos de 13/08/2026.
  it('aceita rótulo longo entre a modalidade e o número (caso real, documento do CIS Piumhi)', () => {
    expect(
      parseModalidadeEdital(
        'Processo 0011/2025 - Adesão Ata Registro de Preço nº 003/2025 - Adesão a Ata de Registro de Preço do Consorcio Público Intermunicipal de Saúde'
      )
    ).toEqual({ tipo: 'adesao', numero: 3, ano: 2025 });
  });

  it('em aviso longo, pega o número colado na modalidade e não o do contrato (caso real)', () => {
    // O parser antigo lia "Contrato nº 0127/2023" e produzia Tomada 127/2023.
    expect(
      parseModalidadeEdital(
        'Aditamento ao Contrato nº 0127/2023 - Celebração do 1º Termo aditivo ao Contrato nº 127/2023 (serv. pavim. asfáltica), originado do Processo de Licitação nº 57/2023, Tomada de Preços nº 02/2023 objetivando prorrogação. Fund. Legal: Lei Federal nº 8.666/93.'
      )
    ).toEqual({ tipo: 'tomada', numero: 2, ano: 2023 });
  });

  it('não adota número que aparece antes da palavra da modalidade', () => {
    expect(parseModalidadeEdital('Processo 0107/2023 - Ata 015/2023 do Pregão - Registro')).toEqual({
      tipo: 'pregao',
      numero: null,
      ano: null,
    });
  });
});

describe('licitacoes/modalidade · modalidadesCorrespondem', () => {
  const desp = { tipo: 'pregao', numero: 48, ano: 2023 };

  it('casa tipo + número + ano exatos (independe de padding)', () => {
    expect(modalidadesCorrespondem(desp, { tipo: 'pregao', numero: 48, ano: 2023 })).toBe(true);
  });

  it('NÃO casa quando o tipo difere — caso real do bug (adesão vs dispensa)', () => {
    expect(
      modalidadesCorrespondem(
        { tipo: 'adesao', numero: 9, ano: 2026 },
        { tipo: 'dispensa', numero: 9, ano: 2026 }
      )
    ).toBe(false);
  });

  it('NÃO casa quando o número difere (evita match com nº do processo)', () => {
    expect(modalidadesCorrespondem(desp, { tipo: 'pregao', numero: 39, ano: 2023 })).toBe(false);
  });

  it('NÃO casa quando o ano difere', () => {
    expect(modalidadesCorrespondem(desp, { tipo: 'pregao', numero: 48, ano: 2024 })).toBe(false);
  });

  it('exige número em ambos os lados', () => {
    expect(modalidadesCorrespondem(desp, { tipo: 'pregao', numero: null, ano: 2023 })).toBe(false);
  });
});
