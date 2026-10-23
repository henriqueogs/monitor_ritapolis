'use strict';

jest.mock('../db/socio-servidor-repo', () => ({
  listarEmpresasComQsa: jest.fn(),
  listarFolhaPorAno: jest.fn(),
  listarEmpenhosPorCredorAno: jest.fn(),
  listarMaioresEmpenhos: jest.fn(),
}));
jest.mock('../db/alertas-repo', () => ({ upsertAlerta: jest.fn() }));

const repo = require('../db/socio-servidor-repo');
const { upsertAlerta } = require('../db/alertas-repo');
const { termosAcusatorios } = require('../ai/eval/metricas-geracao');
const { avaliarGateDeterministico } = require('./gate-deterministico');
const { gerarDescobertasSocioServidor, sinalParaAlerta } = require('./socio-servidor-runner');

const SINAL = {
  cnpj: '11222333000181',
  razao_social: 'PLANTOES SAUDE LTDA',
  socio_nome: 'MARIA JOSE DA SILVA SOUZA',
  qualificacao: 'Sócio-Administrador',
  cargo: 'MEDICO DO ESF',
  secretaria: 'SAUDE',
  forma_admissao: 'Contratado',
  anos: [2024, 2025],
  valor_empenhado: 125000,
  empenhos: 5,
};

describe('socio-servidor-runner', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('sinalParaAlerta', () => {
    it('monta alerta interno, em revisão, com período no rótulo do valor', () => {
      const alerta = sinalParaAlerta(SINAL);

      expect(alerta).toMatchObject({
        tipo: 'conflito_interesse',
        subcategoria: 'socio_servidor',
        estado_editorial: 'revisao',
        valor_total: 125000,
        valor_periodo_label: 'Empenhado em 2024–2025',
        chave_unica: 'socio-servidor|11222333000181|MARIA JOSE DA SILVA SOUZA',
      });
      expect(alerta.metadados.somente_admin).toBe(true);
    });

    it('diz que pode ser homônimo e não usa linguagem acusatória', () => {
      const alerta = sinalParaAlerta(SINAL);

      expect(alerta.narrativa).toMatch(/homônimo/);
      expect(termosAcusatorios(`${alerta.titulo} ${alerta.narrativa}`)).toEqual([]);
    });

    it('nunca passa no gate de publicação', () => {
      const alerta = sinalParaAlerta(SINAL);
      const campos = alerta.metadados.campos_a_verificar;

      expect(avaliarGateDeterministico(alerta, { pendencias: [] }, { conferidos: campos }).podePublicar).toBe(false);
    });
  });

  describe('gerarDescobertasSocioServidor', () => {
    beforeEach(() => {
      repo.listarEmpresasComQsa.mockReturnValue([
        { cnpj: SINAL.cnpj, razao_social: SINAL.razao_social, qsa: [{ nome: SINAL.socio_nome, qualificacao: 'Sócio' }] },
      ]);
      repo.listarFolhaPorAno.mockReturnValue([
        { nome: SINAL.socio_nome, cpf_mascarado: '***.111222-**', ano: 2025, cargo: 'MEDICO', secretaria: 'SAUDE' },
      ]);
      repo.listarEmpenhosPorCredorAno.mockReturnValue([{ credor_cnpj: SINAL.cnpj, ano: 2025, valor: 1000, quantidade: 1 }]);
      repo.listarMaioresEmpenhos.mockReturnValue([
        { id: 9, empenho: '00100-000', tipo: 'EO', valor: 1000, exercicio_orcamento: 2025, credor_nome: 'PLANTOES', historico: 'PLANTOES' },
      ]);
    });

    it('grava com evidências de quadro societário, folha e empenhos, cada uma com hash próprio', () => {
      const r = gerarDescobertasSocioServidor();

      expect(r.gravados).toBe(1);
      const [, documentos, evidencias] = upsertAlerta.mock.calls[0];
      expect(documentos).toEqual([]);
      expect(evidencias.map((e) => e.papel)).toEqual(['quadro_societario', 'folha', 'empenho']);
      expect(new Set(evidencias.map((e) => e.evidencia_hash)).size).toBe(3);
      expect(evidencias[1].metadados.url_origem).toMatch(/^https?:\/\//);
      expect(evidencias[2].metadados.portal_url).toMatch(/^https?:\/\//);
    });

    it('não grava em dry-run', () => {
      const r = gerarDescobertasSocioServidor({ dryRun: true });

      expect(r.sinais).toHaveLength(1);
      expect(upsertAlerta).not.toHaveBeenCalled();
    });
  });
});
