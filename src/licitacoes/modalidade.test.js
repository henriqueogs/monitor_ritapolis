'use strict';

const {
  normalizarTipoModalidade,
  parseModalidadeDespesa,
  parseModalidadeEdital,
  modalidadesCorrespondem,
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

  it('retorna null quando não há modalidade reconhecível', () => {
    expect(parseModalidadeEdital('Documento avulso sem modalidade')).toBeNull();
    expect(parseModalidadeEdital('')).toBeNull();
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
