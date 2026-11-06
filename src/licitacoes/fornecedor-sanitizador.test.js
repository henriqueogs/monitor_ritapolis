'use strict';

const { ente, formatarCnpj } = require('../ente');
const {
  ehNomeFornecedorInvalido,
  sanitizarNomeFornecedor,
  sanitizarCnpjFornecedor,
  sanitizarFornecedor,
} = require('./fornecedor-sanitizador');

describe('fornecedor-sanitizador', () => {
  const cnpjPrefeitura = ente.cnpjPrefeitura;
  const cnpjPrefeituraFormatado = formatarCnpj(cnpjPrefeitura);
  const sufixoCnpjPrefeitura = cnpjPrefeituraFormatado.slice(7);

  describe('sanitizarCnpjFornecedor', () => {
    it('rejeita null, undefined, strings literais undefined/null e vazios', () => {
      expect(sanitizarCnpjFornecedor(null)).toBeNull();
      expect(sanitizarCnpjFornecedor(undefined)).toBeNull();
      expect(sanitizarCnpjFornecedor('undefined')).toBeNull();
      expect(sanitizarCnpjFornecedor('null')).toBeNull();
      expect(sanitizarCnpjFornecedor('')).toBeNull();
    });

    it('rejeita o CNPJ da Prefeitura e da Câmara do ente (com ou sem máscara)', () => {
      expect(sanitizarCnpjFornecedor(cnpjPrefeitura)).toBeNull();
      expect(sanitizarCnpjFornecedor(cnpjPrefeituraFormatado)).toBeNull();
      expect(sanitizarCnpjFornecedor(ente.cnpjCamara)).toBeNull();
    });

    it('rejeita CNPJ corrompido com menos de 14 dígitos (ex.: 27./84./70/0001-29)', () => {
      expect(sanitizarCnpjFornecedor('27./84./70/0001-29')).toBeNull();
      expect(sanitizarCnpjFornecedor('123456')).toBeNull();
    });

    it('retorna CNPJ válido formatado (ou apenas dígitos quando solicitado)', () => {
      expect(sanitizarCnpjFornecedor('53421609000109')).toBe('53.421.609/0001-09');
      expect(sanitizarCnpjFornecedor('53.421.609/0001-09')).toBe('53.421.609/0001-09');
      expect(sanitizarCnpjFornecedor('53.421.609/0001-09', { formatado: false })).toBe('53421609000109');
    });
  });

  describe('ehNomeFornecedorInvalido', () => {
    it.each([
      [null],
      [undefined],
      [''],
      ['undefined'],
      ['null'],
      ['CONTRATADA'],
      ['Contratado'],
      ['CONTRATANTE'],
      ['LICITANTE'],
      ['Licitantes'],
      ['Proponente'],
      ['PERMISSIONÁRIA'],
      ['Vencedor(a) da licitação'],
      ['Empresa _________'],
      ['Empresa _____'],
      ['CNPJ'],
      ['CNPJ n°'],
      ['CNPJ sob o nº'],
      [`${sufixoCnpjPrefeitura} CNPJ`],
      ['CEP. 36.3 35 - 000'],
      ['35 - 000'],
      ['BAIRRO CENTRO Cidade: ARENOPOLIS/GO - CEP: 76235-000 CNPJ'],
      [`Prefeitura Municipal de ${ente.nome}`],
      ['Departamento Municipal de Educação'],
      [`Município de ${ente.nome}`],
    ])('considera inválido: %p', (nome) => {
      expect(ehNomeFornecedorInvalido(nome)).toBe(true);
    });

    it('considera válidos nomes reais de empresas e pessoas jurídicas', () => {
      expect(ehNomeFornecedorInvalido('GONVI ENGENHARIA LTDA')).toBe(false);
      expect(ehNomeFornecedorInvalido('MULTIMEDIC COMERCIAL LTDA')).toBe(false);
      expect(ehNomeFornecedorInvalido('REAL MINAS CONSTRUTORA LTDA')).toBe(false);
    });
  });

  describe('sanitizarNomeFornecedor', () => {
    it('remove cabeçalhos de tabela de ata (DOCUMENTO DA EMPRESA REPRESENTANTE...)', () => {
      expect(
        sanitizarNomeFornecedor(
          'DOCUMENTO DA EMPRESA REPRESENTANTE DOCUMENTO DO REPRESENTANTE REAL MINAS CONSTRUTORA LTDA'
        )
      ).toBe('REAL MINAS CONSTRUTORA LTDA');
    });

    it('remove sufixo do CNPJ da Prefeitura + nome do signatário antes do nome da empresa', () => {
      expect(
        sanitizarNomeFornecedor(
          `${sufixoCnpjPrefeitura} Higino Zacarias de Souza MULTIMEDIC COMERCIAL LTDA CNPJ`
        )
      ).toBe('MULTIMEDIC COMERCIAL LTDA');
    });

    it('remove prefixo "representando a" e ruído de portal ("mg gov br Produto Vencedor LOTE 00001")', () => {
      expect(
        sanitizarNomeFornecedor('representando a Construtora Inácio Neto Ltda')
      ).toBe('Construtora Inácio Neto Ltda');

      expect(
        sanitizarNomeFornecedor('mg gov br Produto Vencedor LOTE 00001 HYAGO E SANTOS PROMOÇÕES-ME')
      ).toBe('HYAGO E SANTOS PROMOÇÕES-ME');
    });

    it('retorna null quando após limpeza resta apenas placeholder ou fragmento inválido', () => {
      expect(sanitizarNomeFornecedor('CONTRATADA')).toBeNull();
      expect(sanitizarNomeFornecedor('Empresa _________')).toBeNull();
      expect(sanitizarNomeFornecedor('CNPJ sob o nº')).toBeNull();
      expect(sanitizarNomeFornecedor(`${sufixoCnpjPrefeitura} CNPJ`)).toBeNull();
      expect(sanitizarNomeFornecedor('BAIRRO CENTRO Cidade: ARENOPOLIS/GO - CEP: 76235-000 CNPJ')).toBeNull();
      expect(sanitizarNomeFornecedor('CEP. 36.3 35 - 000')).toBeNull();
    });
  });

  describe('sanitizarFornecedor', () => {
    it('zera ambos quando CNPJ é do ente e nome é placeholder de minuta', () => {
      expect(
        sanitizarFornecedor({ nome: 'CONTRATADA', cnpj: cnpjPrefeitura })
      ).toEqual({ nome: null, cnpj: null });
    });

    it('preserva CNPJ válido mesmo quando o nome extraído era lixo ("CNPJ sob o nº")', () => {
      expect(
        sanitizarFornecedor({ nome: 'CNPJ sob o nº', cnpj: '53.421.609/0001-09' })
      ).toEqual({ nome: null, cnpj: '53.421.609/0001-09' });
    });
  });
});
