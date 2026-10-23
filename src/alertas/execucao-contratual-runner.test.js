'use strict';

jest.mock('../db/execucao-contratual-repo', () => ({
  listarProcessosComTextoContrato: jest.fn(),
  listarEmpenhosQueCitamProcesso: jest.fn(),
  listarAnexosDeContrato: jest.fn(),
}));
jest.mock('../db/transparencia-agregados-repo', () => ({ getDespesasPorIds: jest.fn() }));
jest.mock('../db/alertas-repo', () => ({ upsertAlerta: jest.fn() }));

const repo = require('../db/execucao-contratual-repo');
const { getDespesasPorIds } = require('../db/transparencia-agregados-repo');
const { upsertAlerta } = require('../db/alertas-repo');
const { avaliarAlerta } = require('./revalidacao');
const { termosAcusatorios } = require('../ai/eval/metricas-geracao');
const { gerarDescobertasExecucao, sinalParaAlerta } = require('./execucao-contratual-runner');

const SINAL = {
  documento_id: 12,
  titulo_processo: 'Processo 0019/2026 - Adesão nº 005/2026',
  trecho_contrato: 'A contratação tem valor total de R$ 9.184,00',
  processo: '19/2026',
  credor_nome: 'VERDAM LTDA',
  credor_cnpj: '23162312000105',
  valor_contrato: 9184,
  valor_empenhado: 56032.83,
  excesso: 46848.83,
  razao: 6.101,
  empenho_ids: [1, 2],
  ano_inicio: 2026,
  ano_fim: 2026,
};

describe('execucao-contratual-runner', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('sinalParaAlerta', () => {
    it('monta alerta em revisão, com período e unidade em reais', () => {
      // Act
      const alerta = sinalParaAlerta(SINAL);

      // Assert
      expect(alerta).toMatchObject({
        tipo: 'execucao_contratual',
        subcategoria: 'empenhado_acima_contratado',
        severidade: 'critico',
        estado_editorial: 'revisao',
        valor_total: 56032.83,
        valor_periodo_label: 'Empenhado em 2026',
        chave_unica: 'execucao|19/2026|23162312000105',
      });
      expect(alerta.metadados.unidade).toBe('R$');
      expect(alerta.titulo).toContain('6,1×');
    });

    it('usa intervalo de anos quando os empenhos atravessam exercícios', () => {
      const alerta = sinalParaAlerta({ ...SINAL, ano_inicio: 2025, razao: 1.6 });

      expect(alerta.valor_periodo_label).toBe('Empenhado em 2025–2026');
      expect(alerta.severidade).toBe('atencao');
    });

    it('não usa linguagem acusatória', () => {
      const alerta = sinalParaAlerta(SINAL);

      expect(termosAcusatorios(`${alerta.titulo} ${alerta.narrativa}`)).toEqual([]);
    });
  });

  describe('gerarDescobertasExecucao', () => {
    beforeEach(() => {
      repo.listarProcessosComTextoContrato.mockReturnValue([
        {
          documento_id: 12,
          titulo: 'Processo 0019/2026 - Adesão nº 005/2026',
          vencedor_cnpj: '23162312000105',
          url_origem: 'https://prefeitura.example/editais',
          texto: '',
        },
      ]);
      repo.listarAnexosDeContrato.mockReturnValue([
        { documento_id: 12, anexo_id: 77, nome: 'Contrato.pdf', texto: 'valor total de R$ 9.184,00 (nove mil)' },
        { documento_id: 99, anexo_id: 88, nome: 'Outro.pdf', texto: 'valor total de R$ 1,00' },
      ]);
      repo.listarEmpenhosQueCitamProcesso.mockReturnValue([
        { id: 1, empenho: '01446-000', credor_nome: 'VERDAM LTDA', credor_cnpj: '23162312000105', valor: 9184, tipo: 'EO', exercicio_orcamento: 2026, historico: 'PROCESSO LICITATÓRIO N°19/2026' },
        { id: 2, empenho: '01588-000', credor_nome: 'VERDAM LTDA', credor_cnpj: '23162312000105', valor: 46848.83, tipo: 'EO', exercicio_orcamento: 2026, historico: 'PROCESSO LICITATÓRIO N°19/2026' },
      ]);
      getDespesasPorIds.mockReturnValue([
        { id: 1, empenho: '01446-000', exercicio_orcamento: 2026, tipo: 'EO', valor: 9184, historico: 'PODAS', credor_nome: 'VERDAM LTDA' },
        { id: 2, empenho: '01588-000', exercicio_orcamento: 2026, tipo: 'EO', valor: 46848.83, historico: 'PODAS', credor_nome: 'VERDAM LTDA' },
      ]);
    });

    it('grava o alerta com o contrato e os empenhos como evidência', () => {
      const r = gerarDescobertasExecucao();

      expect(r.gravados).toBe(1);
      const [alerta, documentos, evidencias] = upsertAlerta.mock.calls[0];
      expect(documentos[0]).toMatchObject({ documento_id: 12, papel: 'contrato' });
      expect(evidencias[0]).toMatchObject({ documento_id: 12, anexo_id: 77, papel: 'contrato' });
      expect(evidencias[0].metadados.descricao).toMatch(/Contrato\.pdf/);
      expect(evidencias.map((e) => e.papel)).toEqual(['contrato', 'empenho', 'empenho']);
      expect(evidencias[1].metadados.portal_url).toMatch(/^https?:\/\//);

      // O alerta gravado passa na revalidação (tem fonte, período, sem acusação).
      const revalidado = avaliarAlerta({
        ...alerta,
        documentos: [{ documento_id: 12, url_origem: 'https://prefeitura.example/editais' }],
        evidencias,
      });
      expect(revalidado.pendencias).toEqual([]);
    });

    it('dá hash distinto a empenhos com o mesmo histórico (nenhum some no INSERT OR IGNORE)', () => {
      gerarDescobertasExecucao();

      const [, , evidencias] = upsertAlerta.mock.calls[0];
      const hashes = evidencias.filter((e) => e.papel === 'empenho').map((e) => e.evidencia_hash);
      expect(hashes.every(Boolean)).toBe(true);
      expect(new Set(hashes).size).toBe(2);
    });

    it('não grava em dry-run', () => {
      const r = gerarDescobertasExecucao({ dryRun: true });

      expect(r.sinais).toHaveLength(1);
      expect(upsertAlerta).not.toHaveBeenCalled();
    });
  });
});
