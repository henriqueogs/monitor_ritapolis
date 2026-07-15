'use strict';

const { mapearReceitaCnpj, buscarCnpj, apenasDigitos } = require('./receita-cnpj');

const respostaBrasilApi = {
  razao_social: 'EMPRESA EXEMPLO LTDA',
  natureza_juridica: 'Sociedade Empresária Limitada',
  situacao_cadastral: 2,
  descricao_situacao_cadastral: 'ATIVA',
  cnae_fiscal_descricao: 'Comércio varejista',
  municipio: 'RITAPOLIS',
  uf: 'MG',
  qsa: [
    { nome_socio: 'FULANO DE TAL', qualificacao_socio: 'Sócio-Administrador' },
    { nome_socio: '', qualificacao_socio: 'Sócio' },
  ],
};

describe('receita-cnpj', () => {
  describe('mapearReceitaCnpj', () => {
    it('normaliza campos e usa a descricao textual da situacao', () => {
      const dados = mapearReceitaCnpj(respostaBrasilApi);
      expect(dados.natureza_juridica).toBe('Sociedade Empresária Limitada');
      expect(dados.situacao_cadastral).toBe('ATIVA');
      expect(dados.razao_social).toBe('EMPRESA EXEMPLO LTDA');
    });

    it('mapeia qsa descartando socios sem nome', () => {
      const dados = mapearReceitaCnpj(respostaBrasilApi);
      expect(dados.qsa).toEqual([{ nome: 'FULANO DE TAL', qualificacao: 'Sócio-Administrador' }]);
    });

    it('nao quebra com resposta vazia', () => {
      const dados = mapearReceitaCnpj();
      expect(dados.natureza_juridica).toBeNull();
      expect(dados.qsa).toEqual([]);
    });
  });

  describe('buscarCnpj', () => {
    it('rejeita CNPJ com numero de digitos invalido', async () => {
      await expect(buscarCnpj('123')).rejects.toThrow('CNPJ invalido');
    });

    it('limpa mascara antes de consultar e retorna dados + confianca', async () => {
      const httpGet = jest.fn().mockResolvedValue(respostaBrasilApi);
      const r = await buscarCnpj('18.557.553/0001-05', { httpGet });

      expect(httpGet).toHaveBeenCalledWith('18557553000105');
      expect(r.dados.situacao_cadastral).toBe('ATIVA');
      expect(r.confianca).toBe(0.9);
    });

    it('retorna null em 404 (CNPJ inexistente)', async () => {
      const httpGet = jest.fn().mockRejectedValue({ response: { status: 404 } });
      const r = await buscarCnpj('18557553000105', { httpGet });
      expect(r).toBeNull();
    });

    it('propaga erro de infra com contexto', async () => {
      const httpGet = jest.fn().mockRejectedValue({ message: 'timeout' });
      await expect(buscarCnpj('18557553000105', { httpGet })).rejects.toThrow('BrasilAPI CNPJ 18557553000105 falhou: timeout');
    });
  });

  describe('apenasDigitos', () => {
    it('remove tudo que nao e numero', () => {
      expect(apenasDigitos('18.557.553/0001-05')).toBe('18557553000105');
    });
  });
});
