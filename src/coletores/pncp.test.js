'use strict';
jest.mock('../db', () => ({
  saveDocumento: jest.fn(),
  createColetaLog: jest.fn(),
  finishColetaLog: jest.fn(),
}));
const Pncp = require('./pncp');
const { buildSourceUrl } = Pncp;
const orgao = { cnpj: '18557553000105', nome: 'Prefeitura Municipal de Ritapolis' };
test('official purchase fields provide source even when control number is absent', () => {
  expect(buildSourceUrl({ anoCompra: 2025, sequencialCompra: 1 }, orgao, 'compra')).toBe(
    'https://pncp.gov.br/app/editais/18557553000105/2025/1'
  );
});
test('contract uses its own identifier/year, never the originating purchase or publication year', () => {
  expect(
    buildSourceUrl(
      {
        numeroControlePNCP: '18557553000105-2-000004/2025',
        numeroControlePNCPCompra: '18557553000105-1-000001/2024',
        dataPublicacao: '2026-01-01',
      },
      orgao,
      'contrato'
    )
  ).toBe('https://pncp.gov.br/api/pncp/v1/orgaos/18557553000105/contratos/2025/4');
});
test('ata requires exact purchase and ata sequence; missing identifiers cannot fabricate a link', () => {
  expect(
    buildSourceUrl(
      { numeroControlePNCPCompra: '18557553000105-1-000008/2025', sequencialAta: 2 },
      orgao,
      'ata'
    )
  ).toBe('https://pncp.gov.br/api/pncp/v1/orgaos/18557553000105/compras/2025/8/atas/2');
  expect(() => buildSourceUrl({ dataPublicacao: '2025-01-01' }, orgao, 'contrato')).toThrow(
    'incompleto'
  );
  expect(() =>
    buildSourceUrl({ numeroControlePNCP: '26148056000181-2-000004/2025' }, orgao, 'contrato')
  ).toThrow('outro orgao');
});
test('contract persistence maps real PNCP field names and has a non-null authoritative source', () => {
  const collector = new Pncp();
  collector.salvarDocumento = jest.fn();
  collector.salvarContrato(
    {
      numeroControlePNCP: '18557553000105-2-000004/2025',
      numeroContratoEmpenho: 'Contrato 4',
      anoContrato: 2025,
      sequencialContrato: 4,
      objetoContrato: 'Objeto oficial do contrato',
      dataPublicacaoPncp: '2025-06-01T10:00:00',
      valorInicial: 0,
    },
    orgao,
    {}
  );
  expect(collector.salvarDocumento).toHaveBeenCalledWith(
    expect.objectContaining({
      numero: 'Contrato 4',
      data_publicacao: '2025-06-01',
      url_origem: 'https://pncp.gov.br/api/pncp/v1/orgaos/18557553000105/contratos/2025/4',
      texto_completo: expect.stringContaining('Objeto oficial do contrato'),
    }),
    {}
  );
});
