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

test.each([1, 2, 3, 4, 5])('consulta ata real %i resolves the purchase year from its full official control, not ata/publication year', seq => {
  const record = {
    numeroControlePNCPAta: `18557553000105-1-000001/2025-${String(seq).padStart(6, '0')}`,
    numeroControlePNCPCompra: '18557553000105-1-000001/2025',
    anoAta: 2026, dataPublicacaoPncp: '2026-01-01', cnpjOrgao: orgao.cnpj,
  };
  expect(buildSourceUrl(record, orgao, 'ata')).toBe(
    `https://pncp.gov.br/api/pncp/v1/orgaos/18557553000105/compras/2025/1/atas/${seq}`);
});
test('integration API aliases resolve the same ata identity as consulta API', () => {
  expect(buildSourceUrl({ numeroControlePNCP: '18557553000105-1-000001/2025-000005',
    numeroControlePncpCompra: '18557553000105-1-000001/2025', sequencialAta: 5,
    orgaoEntidade: { cnpj: orgao.cnpj }, anoAta: 2026 }, orgao, 'ata')).toBe(
    'https://pncp.gov.br/api/pncp/v1/orgaos/18557553000105/compras/2025/1/atas/5');
});
test.each([
  { sequencialAta: 2 },
  { anoCompra: 2026 },
  { sequencialCompra: 2 },
  { numeroControlePNCPCompra: '18557553000105-1-000002/2025' },
  { numeroControlePNCP: '18557553000105-1-000001/2025-000002' },
])('redundant identifiers cannot contradict ata control: %j', contradiction => {
  expect(() => buildSourceUrl({ numeroControlePNCPAta: '18557553000105-1-000001/2025-000001',
    ...contradiction }, orgao, 'ata')).toThrow(/divergentes/);
});
test.each([
  { cnpjOrgao: '26148056000181' },
  { numeroControlePNCPAta: '26148056000181-1-000001/2025-000001' },
  { numeroControlePNCPCompra: '26148056000181-1-000001/2025' },
])('atas reject another entity in any authoritative field: %j', contradiction => {
  expect(() => buildSourceUrl({ numeroControlePNCPAta: '18557553000105-1-000001/2025-000001',
    ...contradiction }, orgao, 'ata')).toThrow(/outro orgao/);
});
test.each(['18557553000105-1-000001/2025', 'invalid', '18557553000105-1-000001/2025-000000'])('incomplete/malformed ata identity is rejected: %s', control => {
  expect(() => buildSourceUrl({ numeroControlePNCPAta: control, anoAta: 2026,
    dataPublicacaoPncp: '2026-01-01' }, orgao, 'ata')).toThrow(/invalido|incompleto/);
});
test('purchase and contract cannot override contradictory authoritative control fields', () => {
  expect(() => buildSourceUrl({ numeroControlePNCP: '18557553000105-1-000001/2025',
    anoCompra: 2026 }, orgao, 'compra')).toThrow(/divergentes/);
  expect(() => buildSourceUrl({ numeroControlePNCP: '18557553000105-2-000001/2025',
    sequencialContrato: 2 }, orgao, 'contrato')).toThrow(/divergentes/);
  expect(() => buildSourceUrl({ anoCompra: 2025, sequencialCompra: true }, orgao, 'compra')).toThrow(/invalido/);
});
test('ata persistence uses official consulta object/identity and does not invent supplier or value', () => {
  const c = new Pncp(); c.salvarDocumento = jest.fn();
  c.salvarAta({ numeroControlePNCPAta: '18557553000105-1-000001/2025-000001',
    numeroControlePNCPCompra: '18557553000105-1-000001/2025', numeroAtaRegistroPreco: '01/2026',
    anoAta: 2026, cnpjOrgao: orgao.cnpj, objetoContratacao: 'Objeto oficial do teste',
    dataPublicacaoPncp: '2026-01-02T00:00:00' }, orgao, {});
  const stored = c.salvarDocumento.mock.calls[0][0];
  expect(stored).toMatchObject({ ano: 2026, numero: '01/2026', valor_estimado: null,
    url_origem: 'https://pncp.gov.br/api/pncp/v1/orgaos/18557553000105/compras/2025/1/atas/1' });
  expect(stored.texto_completo).toContain('Objeto oficial do teste');
  expect(stored.texto_completo).toContain('18557553000105-1-000001/2025-000001');
  const originalHash = stored.hash_conteudo;
  c.salvarAta({ numeroControlePNCP: '18557553000105-1-000001/2025-000001',
    numeroControlePncpCompra: '18557553000105-1-000001/2025', sequencialAta: 1,
    objetoCompra: 'Objeto oficial do teste', anoAta: 2026 }, orgao, {});
  expect(c.salvarDocumento.mock.calls[1][0].hash_conteudo).toBe(originalHash);
});
