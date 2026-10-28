'use strict';

const { parseLicitacaoDetalhes } = require('./licitacao-detalhes');

describe('parseLicitacaoDetalhes', () => {
  describe('numero_pncp', () => {
    it('extrai o número de controle no formato do PNCP', () => {
      const detalhes = parseLicitacaoDetalhes('Número de controle PNCP: 00000000000191-1-000010/2025');

      expect(detalhes.numero_pncp).toBe('00000000000191-1-000010/2025');
    });

    it('normaliza o sequencial para 6 dígitos (chave do canônico na sincronização)', () => {
      // fiscal-valores 28/10, achado 4b: '-00010/' não casava com '-000010/' e somava em paralelo.
      const detalhes = parseLicitacaoDetalhes('Número de controle PNCP: 00000000000191-1-00010/2025');

      expect(detalhes.numero_pncp).toBe('00000000000191-1-000010/2025');
    });

    it('remove zeros à esquerda excedentes do sequencial', () => {
      const detalhes = parseLicitacaoDetalhes('PNCP: 00000000000191-1-00000010/2025');

      expect(detalhes.numero_pncp).toBe('00000000000191-1-000010/2025');
    });
  });
});
