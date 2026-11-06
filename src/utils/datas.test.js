'use strict';

const {
  extrairAno,
  extrairAnoInstrumento,
  validarDataIso,
  normalizarDataIso,
  parseDataBrasileira,
  naoFutura,
} = require('./datas');

describe('extrairAno', () => {
  it('prioriza data_publicacao/data_abertura', () => {
    expect(extrairAno({ dataPublicacao: '2024-03-15' })).toBe(2024);
    expect(extrairAno({ dataAbertura: '2022-11-01', titulo: 'Edital 2019' })).toBe(2022);
  });

  it('extrai ano de 4 dígitos do título (data por extenso)', () => {
    expect(extrairAno({ titulo: 'Resolução nº 8, de 18 de agosto de 2015' })).toBe(2015);
    expect(extrairAno({ titulo: 'Portaria Legislativa nº 20, de 25 de agosto de 2015' })).toBe(2015);
    expect(extrairAno({ titulo: 'Emenda Estadual 2025 Sargento Rodrigues' })).toBe(2025);
  });

  it('extrai ano de número de processo/identificador', () => {
    expect(extrairAno({ titulo: 'Processo 0060/20 - Concorrência Pública nº 02/2020 - Alienação' })).toBe(2020);
    expect(extrairAno({ titulo: 'Processo 0064/24 - Dispensa nº 034/2024 - Aquisição de Tonner' })).toBe(2024);
  });

  it('usa padrão NNNN/AA quando não há ano completo', () => {
    expect(extrairAno({ titulo: 'Processo 0064/24 - Aquisição' })).toBe(2024);
    expect(extrairAno({ numero: '0060/20' })).toBe(2020);
  });

  it('retorna null quando não há ano derivável', () => {
    expect(extrairAno({ titulo: 'TERMO DE POSSE DE MEMBRO DO CONSELHO TUTELAR nº 05' })).toBeNull();
    expect(extrairAno({})).toBeNull();
    expect(extrairAno({ titulo: 'Resolução nº 8' })).toBeNull();
  });

  it('ignora anos implausíveis (fora de 2000..ano+1)', () => {
    expect(extrairAno({ titulo: 'Documento de 1850' })).toBeNull();
    expect(extrairAno({ titulo: 'Projeto para 2099' })).toBeNull();
  });
});

describe('extrairAnoInstrumento', () => {
  it('identifica o ano do instrumento quando publicado no ano seguinte (Processo 2023 publicado em jan/2024 e Emenda 2025 publicada em fev/2026)', () => {
    expect(
      extrairAnoInstrumento({
        numero: '0117/2023',
        titulo: 'Processo 0117/2023 - Tomada de Preços nº 006/2023',
        dataPublicacao: '2024-01-03',
      })
    ).toBe(2023);

    expect(
      extrairAnoInstrumento({
        titulo: 'Emenda Estadual 2025 Sargento Rodrigues',
        dataPublicacao: '2026-02-19',
      })
    ).toBe(2025);

    expect(
      extrairAnoInstrumento({
        numero: '001/2020',
        titulo: 'Concursos Públicos 2020',
        dataPublicacao: '2025-07-08',
      })
    ).toBe(2020);
  });
});

describe('validarDataIso e normalizarDataIso', () => {
  it('rejeita datas impossíveis encontradas no banco (2025-10-54, 0202-04-10, 0023-12-29)', () => {
    expect(validarDataIso('2025-10-54')).toBeNull();
    expect(validarDataIso('0202-04-10')).toBeNull();
    expect(validarDataIso('0023-12-29')).toBeNull();
    expect(validarDataIso('2025-02-29')).toBeNull();
  });

  it('normaliza datas DD/MM/YYYY e preserva YYYY-MM-DD válidas', () => {
    expect(normalizarDataIso('26/12/2023')).toBe('2023-12-26');
    expect(normalizarDataIso('2024-02-29')).toBe('2024-02-29');
    expect(normalizarDataIso('2025-10-54')).toBeNull();
  });
});

describe('parseDataBrasileira', () => {
  it('extrai data ISO de datahora com parênteses e hora', () => {
    expect(parseDataBrasileira('(10/06/2026 07:46:39)')).toBe('2026-06-10');
    expect(parseDataBrasileira('Publicado em 25/12/2024')).toBe('2024-12-25');
  });

  it('retorna null para texto sem data ou data inválida', () => {
    expect(parseDataBrasileira('sem data')).toBeNull();
    expect(parseDataBrasileira('32/13/2024')).toBeNull();
    expect(parseDataBrasileira(null)).toBeNull();
  });
});

describe('naoFutura', () => {
  const hoje = new Date('2026-06-17T12:00:00Z');

  it('mantém datas passadas ou de hoje', () => {
    expect(naoFutura('2026-06-10', hoje)).toBe('2026-06-10');
    expect(naoFutura('2026-06-17', hoje)).toBe('2026-06-17');
  });

  it('rejeita data futura (provável data de sessão, não publicação)', () => {
    expect(naoFutura('2026-06-19', hoje)).toBeNull();
  });

  it('null entra, null sai', () => {
    expect(naoFutura(null, hoje)).toBeNull();
  });
});
