'use strict';

jest.mock('../db/folha-repo', () => ({
  getFolhaServidores: jest.fn(),
  getFolhaServidorDossie: jest.fn(),
  getFolhaResumoSecretarias: jest.fn(),
}));

const repo = require('../db/folha-repo');
const { listarServidores, getServidorDossie, getResumoSecretarias } = require('./folha-service');

describe('folha-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listarServidores', () => {
    it('decora cada linha com o link de origem (generico, sem deep-link por registro)', () => {
      repo.getFolhaServidores.mockReturnValue({
        total: 1, pagina: 1, limite: 50,
        dados: [{ id: 1, nome_servidor: 'MARIA DA SILVA SANTOS' }],
      });

      const resultado = listarServidores({ q: 'maria' });

      expect(repo.getFolhaServidores).toHaveBeenCalledWith({ q: 'maria' });
      expect(resultado.total).toBe(1);
      expect(resultado.dados[0].portal).toEqual({
        url: 'https://pt.ritapolis.mg.gov.br/Folha',
        especifico: false,
      });
    });
  });

  describe('getServidorDossie', () => {
    it('retorna null quando o vinculo nao tem historico', () => {
      repo.getFolhaServidorDossie.mockReturnValue([]);
      expect(getServidorDossie({ vinculo: 'x', matricula: '0' })).toBeNull();
    });

    it('retorna o historico decorado com o link de origem', () => {
      repo.getFolhaServidorDossie.mockReturnValue([
        { competencia_ano: 2025, competencia_mes: 1 },
        { competencia_ano: 2025, competencia_mes: 2 },
      ]);

      const dossie = getServidorDossie({ vinculo: '0000019', matricula: '146' });

      expect(dossie.vinculo).toBe('0000019');
      expect(dossie.historico).toHaveLength(2);
      expect(dossie.historico[0].portal.especifico).toBe(false);
    });
  });

  describe('getResumoSecretarias', () => {
    it('repassa direto pro repo (agregacao ja vem pronta do SQL)', () => {
      repo.getFolhaResumoSecretarias.mockReturnValue([{ secretaria: 'FAZENDA', total_servidores: 2 }]);
      const resumo = getResumoSecretarias({ competenciaAno: 2025 });
      expect(repo.getFolhaResumoSecretarias).toHaveBeenCalledWith({ competenciaAno: 2025 });
      expect(resumo).toEqual([{ secretaria: 'FAZENDA', total_servidores: 2 }]);
    });
  });
});
