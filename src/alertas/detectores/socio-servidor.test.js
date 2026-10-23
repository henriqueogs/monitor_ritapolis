'use strict';

const { normalizarNome, detectarSocioServidor } = require('./socio-servidor');

const CNPJ = '11222333000181';

function empresa(extra = {}) {
  return {
    cnpj: CNPJ,
    razao_social: 'PLANTOES SAUDE LTDA',
    qsa: [{ nome: 'Maria José da Silva Souza', qualificacao: 'Sócio-Administrador' }],
    ...extra,
  };
}

function servidor(extra = {}) {
  return {
    nome: 'MARIA JOSE DA SILVA SOUZA',
    cpf_mascarado: '***.111222-**',
    cargo: 'MEDICO DO ESF',
    secretaria: 'SAUDE',
    forma_admissao: 'Contratado',
    ano: 2025,
    ...extra,
  };
}

const EMPENHOS = [
  { credor_cnpj: CNPJ, ano: 2025, valor: 120000, quantidade: 4 },
  { credor_cnpj: CNPJ, ano: 2023, valor: 5000, quantidade: 1 },
];

describe('SocioServidor', () => {
  describe('normalizarNome', () => {
    it('remove acento, pontuação e caixa', () => {
      expect(normalizarNome(' Maria  José da Silva-Souza ')).toBe('MARIA JOSE DA SILVA SOUZA');
    });
  });

  describe('detectarSocioServidor', () => {
    it('aponta sócio com o mesmo nome de servidor no ano em que a empresa recebeu', () => {
      // Act
      const sinais = detectarSocioServidor({ empresas: [empresa()], servidores: [servidor()], empenhos: EMPENHOS });

      // Assert
      expect(sinais).toHaveLength(1);
      expect(sinais[0]).toMatchObject({
        cnpj: CNPJ,
        razao_social: 'PLANTOES SAUDE LTDA',
        socio_nome: 'MARIA JOSE DA SILVA SOUZA',
        qualificacao: 'Sócio-Administrador',
        cargo: 'MEDICO DO ESF',
        secretaria: 'SAUDE',
        anos: [2025],
        valor_empenhado: 120000,
        empenhos: 4,
      });
    });

    it('ignora nome curto (alto risco de homônimo)', () => {
      const sinais = detectarSocioServidor({
        empresas: [empresa({ qsa: [{ nome: 'Maria Souza' }] })],
        servidores: [servidor({ nome: 'MARIA SOUZA' })],
        empenhos: EMPENHOS,
      });

      expect(sinais).toEqual([]);
    });

    it('ignora quando a folha tem duas pessoas com esse nome (CPFs diferentes)', () => {
      const servidores = [servidor(), servidor({ cpf_mascarado: '***.999888-**' })];

      expect(detectarSocioServidor({ empresas: [empresa()], servidores, empenhos: EMPENHOS })).toEqual([]);
    });

    it('exige o mesmo ano na folha e nos empenhos', () => {
      const servidores = [servidor({ ano: 2019 })];

      expect(detectarSocioServidor({ empresas: [empresa()], servidores, empenhos: EMPENHOS })).toEqual([]);
    });

    it('soma só os anos em comum e lista o cargo do último ano', () => {
      const servidores = [servidor({ ano: 2023, cargo: 'PLANTONISTA' }), servidor({ ano: 2025 })];

      const [sinal] = detectarSocioServidor({ empresas: [empresa()], servidores, empenhos: EMPENHOS });

      expect(sinal.anos).toEqual([2023, 2025]);
      expect(sinal.valor_empenhado).toBe(125000);
      expect(sinal.cargo).toBe('MEDICO DO ESF');
    });

    it('não aponta empresa sem empenho', () => {
      expect(detectarSocioServidor({ empresas: [empresa()], servidores: [servidor()], empenhos: [] })).toEqual([]);
    });

    it('aceita QSA vazio ou ausente', () => {
      const empresas = [empresa({ qsa: [] }), empresa({ qsa: undefined })];

      expect(detectarSocioServidor({ empresas, servidores: [servidor()], empenhos: EMPENHOS })).toEqual([]);
    });
  });
});
