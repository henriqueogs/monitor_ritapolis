'use strict';

jest.mock('../db/alertas-repo', () => ({
  listarAlertas: jest.fn(),
  getAlerta: jest.fn(),
  listarHistoricoEditorial: jest.fn(),
  setEstadoEditorial: jest.fn(),
}));

const repo = require('../db/alertas-repo');
const {
  listarParaRevisao,
  detalharParaRevisao,
  decidirEditorial,
  MOTIVOS_DESCARTE,
  DecisaoInvalidaError,
} = require('./alertas-revisao-service');

const URL_FONTE = 'https://prefeitura.example/arquivo.pdf';

function alertaCompleto(extra = {}) {
  return {
    id: 7,
    titulo: 'Carnaval: 5 contratacoes em 2026',
    estado_editorial: 'candidato',
    valor_periodo_label: 'Processos do evento em 2026',
    valor_total: 5,
    qualidade_motivos: [],
    metadados: { discovery_kind: 'investigacao_factual', investigacao_tipo: 'eventos.gastos_eventos_publicos' },
    documentos: [{ documento_id: 1, url_origem: URL_FONTE }],
    evidencias: [{ documento_id: 1, trecho_fonte: 'x', metadados: {} }],
    ...extra,
  };
}

describe('alertas-revisao-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listarParaRevisao', () => {
    it('anexa a revalidação de cada alerta da página', () => {
      // Arrange
      repo.listarAlertas.mockReturnValue({ total: 1, pagina: 1, limite: 20, dados: [{ id: 7 }] });
      repo.getAlerta.mockReturnValue(alertaCompleto());

      // Act
      const resultado = listarParaRevisao({ status: 'ativo' });

      // Assert
      expect(resultado.total).toBe(1);
      expect(resultado.dados[0].revalidacao.recomendacao).toBeDefined();
      expect(resultado.dados[0].revalidacao.pendencias.map((p) => p.codigo)).toContain('NAO_INVESTIGADO');
    });
  });

  describe('detalharParaRevisao', () => {
    it('devolve alerta, histórico e revalidação', () => {
      repo.getAlerta.mockReturnValue(alertaCompleto());
      repo.listarHistoricoEditorial.mockReturnValue([{ estado_novo: 'candidato' }]);

      const detalhe = detalharParaRevisao(7);

      expect(detalhe.id).toBe(7);
      expect(detalhe.historico_editorial).toHaveLength(1);
      expect(detalhe.revalidacao.pendencias).toBeInstanceOf(Array);
    });

    it('devolve null quando o alerta não existe', () => {
      repo.getAlerta.mockReturnValue(null);

      expect(detalharParaRevisao(99)).toBeNull();
    });
  });

  describe('decidirEditorial', () => {
    it('exige motivo para descartar', () => {
      expect(() => decidirEditorial(7, { estado: 'rejeitado', motivos: [] })).toThrow(DecisaoInvalidaError);
      expect(repo.setEstadoEditorial).not.toHaveBeenCalled();
    });

    it('recusa motivo de descarte fora da lista', () => {
      expect(() => decidirEditorial(7, { estado: 'rejeitado', motivos: ['QUALQUER'] })).toThrow(
        DecisaoInvalidaError
      );
    });

    it('grava motivo e nota do revisor', () => {
      repo.setEstadoEditorial.mockReturnValue(true);

      const ok = decidirEditorial(7, {
        estado: 'rejeitado',
        motivos: [MOTIVOS_DESCARTE.DADO_EXTRAIDO_ERRADO],
        nota: '  fornecedor é campo em branco do modelo  ',
      });

      expect(ok).toBe(true);
      expect(repo.setEstadoEditorial).toHaveBeenCalledWith(7, 'rejeitado', {
        origem: 'admin',
        motivos: ['ADMIN_DADO_EXTRAIDO_ERRADO', 'NOTA: fornecedor é campo em branco do modelo'],
      });
    });

    it('limita o tamanho da nota', () => {
      repo.setEstadoEditorial.mockReturnValue(true);

      decidirEditorial(7, { estado: 'revisao', nota: 'a'.repeat(900) });

      const { motivos } = repo.setEstadoEditorial.mock.calls[0][2];
      expect(motivos[0].length).toBeLessThanOrEqual(506);
    });

    it('não exige motivo para publicar ou manter em revisão', () => {
      repo.setEstadoEditorial.mockReturnValue(true);
      repo.getAlerta.mockReturnValue(alertaCompleto());

      decidirEditorial(7, { estado: 'publicado' });

      expect(repo.setEstadoEditorial).toHaveBeenCalledWith(7, 'publicado', { origem: 'admin', motivos: [] });
    });
  });
  describe('alerta determinístico (sem IA)', () => {
    const CAMPOS = ['valor do contrato', 'aditivos'];

    function deterministico(extra = {}) {
      return alertaCompleto({
        qualidade_versao: 'execucao-contratual-v1',
        metadados: { campos_a_verificar: CAMPOS },
        evidencias: [{ documento_id: 1, trecho_fonte: 'x', metadados: {} }],
        ...extra,
      });
    }

    it('o detalhe traz o gate determinístico com os campos a conferir', () => {
      repo.getAlerta.mockReturnValue(deterministico());
      repo.listarHistoricoEditorial.mockReturnValue([]);

      const detalhe = detalharParaRevisao(7);

      expect(detalhe.gate_deterministico).toMatchObject({ aplicavel: true, campos: CAMPOS });
    });

    it('publica sem gate da IA quando o revisor conferiu tudo, e registra o que conferiu', () => {
      // Arrange
      repo.getAlerta.mockReturnValue(deterministico());
      repo.setEstadoEditorial.mockReturnValue(true);

      // Act
      const ok = decidirEditorial(7, { estado: 'publicado', conferidos: CAMPOS, nota: 'ok' });

      // Assert
      expect(ok).toBe(true);
      expect(repo.setEstadoEditorial).toHaveBeenCalledWith(7, 'publicado', {
        origem: 'admin',
        exigirGateFactual: false,
        motivos: ['CONFERIDO: valor do contrato', 'CONFERIDO: aditivos', 'NOTA: ok'],
      });
    });

    it('recusa publicar com campo não conferido', () => {
      repo.getAlerta.mockReturnValue(deterministico());

      expect(() => decidirEditorial(7, { estado: 'publicado', conferidos: ['aditivos'] })).toThrow(/valor do contrato/);
      expect(repo.setEstadoEditorial).not.toHaveBeenCalled();
    });

    it('recusa publicar quando a revalidação tem pendência', () => {
      repo.getAlerta.mockReturnValue(deterministico({ documentos: [], evidencias: [] }));

      expect(() => decidirEditorial(7, { estado: 'publicado', conferidos: CAMPOS })).toThrow(DecisaoInvalidaError);
    });
  });
});
