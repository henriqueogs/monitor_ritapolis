'use strict';

const {
  avaliarAlerta,
  PENDENCIAS,
  GRAVIDADE,
  RECOMENDACAO,
} = require('./revalidacao');

const URL_ANEXO = 'https://prefeitura.example/arquivo?id=1';
const URL_LISTAGEM = 'https://prefeitura.example/pagina/editais';

function alertaBase(extra = {}) {
  return {
    id: 1,
    tipo: 'tematico',
    titulo: 'Supressao de arvores em 2026',
    narrativa: 'Os documentos indicam 70 arvores em fatos de supressao no ano de 2026.',
    estado_editorial: 'candidato',
    valor_total: 70,
    valor_periodo_label: 'Total factual em 2026',
    qualidade_motivos: [],
    metadados: {
      discovery_kind: 'investigacao_factual',
      investigacao_tipo: 'meio_ambiente.supressao_arvores',
      unidade: 'arvores',
      discovery_v3: { qualidade: { factual_status: 'aprovado', status: 'aprovado', motivos: [] } },
    },
    documentos: [{ documento_id: 10, url_origem: URL_LISTAGEM, url_pdf: null }],
    evidencias: [
      {
        documento_id: 10,
        trecho_fonte: 'Supressão de 60 árvores acima de 10 metros',
        anexo_url: URL_ANEXO,
        metadados: { url_origem: URL_LISTAGEM },
      },
    ],
    ...extra,
  };
}

const codigos = (resultado) => resultado.pendencias.map((p) => p.codigo);

describe('revalidacao', () => {
  describe('avaliarAlerta', () => {
    it('não aponta pendência para alerta investigado, com evidência e fonte', () => {
      // Arrange
      const alerta = alertaBase();

      // Act
      const resultado = avaliarAlerta(alerta);

      // Assert
      expect(resultado.pendencias).toEqual([]);
      expect(resultado.recomendacao).toBe(RECOMENDACAO.OK);
    });

    it('bloqueia quando não há evidência nem documento vinculado', () => {
      const alerta = alertaBase({ evidencias: [], documentos: [] });

      const resultado = avaliarAlerta(alerta);

      expect(codigos(resultado)).toContain(PENDENCIAS.SEM_EVIDENCIA);
      expect(resultado.recomendacao).toBe(RECOMENDACAO.NAO_PUBLICAR);
    });

    it('bloqueia quando nenhuma evidência leva a uma fonte http', () => {
      const alerta = alertaBase({
        documentos: [{ documento_id: 10, url_origem: null, url_pdf: null }],
        evidencias: [{ documento_id: 10, trecho_fonte: 'x', anexo_url: null, metadados: {} }],
      });

      const resultado = avaliarAlerta(alerta);

      const pendencia = resultado.pendencias.find((p) => p.codigo === PENDENCIAS.SEM_FONTE);
      expect(pendencia.gravidade).toBe(GRAVIDADE.BLOQUEIA);
    });

    it('usa a origem do documento vinculado quando a evidência não traz URL própria', () => {
      const alerta = alertaBase({
        evidencias: [{ documento_id: 10, trecho_fonte: 'x', anexo_url: null, metadados: {} }],
      });

      const resultado = avaliarAlerta(alerta);

      expect(codigos(resultado)).not.toContain(PENDENCIAS.SEM_FONTE);
    });

    it('aceita o link do portal da transparência como fonte de evidência de empenho', () => {
      const alerta = alertaBase({
        tipo: 'gasto_atipico',
        documentos: [],
        evidencias: [{ documento_id: null, metadados: { empenho_id: 5, portal_url: URL_ANEXO } }],
      });

      const resultado = avaliarAlerta(alerta);

      expect(codigos(resultado)).not.toContain(PENDENCIAS.SEM_FONTE);
      expect(codigos(resultado)).not.toContain(PENDENCIAS.SEM_EVIDENCIA);
    });

    it('bloqueia nome de fornecedor que é lacuna de modelo de contrato', () => {
      const alerta = alertaBase({
        titulo: 'Empresa _________: objeto semelhante em 2 processos de 2018',
      });

      const resultado = avaliarAlerta(alerta);

      expect(codigos(resultado)).toContain(PENDENCIAS.NOME_PLACEHOLDER);
      expect(resultado.recomendacao).toBe(RECOMENDACAO.NAO_PUBLICAR);
    });

    it('bloqueia linguagem acusatória no título ou na narrativa', () => {
      const alerta = alertaBase({
        titulo: 'Possível caracterização de ato de improbidade administrativa',
      });

      const resultado = avaliarAlerta(alerta);

      const pendencia = resultado.pendencias.find((p) => p.codigo === PENDENCIAS.LINGUAGEM_ACUSATORIA);
      expect(pendencia.gravidade).toBe(GRAVIDADE.BLOQUEIA);
      expect(pendencia.mensagem).toMatch(/improbidade/);
    });

    it('pede conferência quando o risco vem só da leitura da IA', () => {
      const alerta = alertaBase({
        metadados: { ...alertaBase().metadados, investigacao_tipo: 'riscos.alerta_resumo_ia' },
      });

      const resultado = avaliarAlerta(alerta);

      expect(codigos(resultado)).toContain(PENDENCIAS.RISCO_SO_DA_IA);
      expect(resultado.recomendacao).toBe(RECOMENDACAO.CONFERIR);
    });

    it('aponta publicação sem gate factual aprovado', () => {
      const alerta = alertaBase({
        estado_editorial: 'publicado',
        metadados: { ...alertaBase().metadados, discovery_v3: undefined },
      });

      const resultado = avaliarAlerta(alerta);

      expect(codigos(resultado)).toContain(PENDENCIAS.PUBLICADO_SEM_GATE);
    });

    it('marca candidato factual que a IA ainda não investigou', () => {
      const alerta = alertaBase({
        metadados: { ...alertaBase().metadados, discovery_v3: undefined },
      });

      const resultado = avaliarAlerta(alerta);

      expect(codigos(resultado)).toContain(PENDENCIAS.NAO_INVESTIGADO);
      expect(codigos(resultado)).not.toContain(PENDENCIAS.PUBLICADO_SEM_GATE);
    });

    it('repassa os motivos do gate quando a investigação reprovou', () => {
      const alerta = alertaBase({
        metadados: {
          ...alertaBase().metadados,
          discovery_v3: { qualidade: { factual_status: 'reprovado', status: 'reprovado', motivos: ['GENERIC_EVIDENCE'] } },
        },
      });

      const resultado = avaliarAlerta(alerta);

      const pendencia = resultado.pendencias.find((p) => p.codigo === PENDENCIAS.GATE_REPROVADO);
      expect(pendencia.detalhes).toEqual(['GENERIC_EVIDENCE']);
    });

    it('marca alerta do detector antigo, sem gate de qualidade', () => {
      const alerta = alertaBase({
        qualidade_motivos: ['LEGACY_NO_QUALITY_GATE'],
        metadados: { sinais: ['repeticao_tematica'] },
      });

      const resultado = avaliarAlerta(alerta);

      expect(codigos(resultado)).toContain(PENDENCIAS.LEGADO);
      expect(codigos(resultado)).not.toContain(PENDENCIAS.NAO_INVESTIGADO);
    });

    it('exige período quando há valor somado (§11.1)', () => {
      const alerta = alertaBase({ valor_periodo_label: null, periodo_inicio: null, periodo_fim: null });

      const resultado = avaliarAlerta(alerta);

      expect(codigos(resultado)).toContain(PENDENCIAS.VALOR_SEM_PERIODO);
    });

    it('tolera alerta sem metadados nem listas', () => {
      const resultado = avaliarAlerta({ id: 2, titulo: 'x' });

      expect(codigos(resultado)).toContain(PENDENCIAS.SEM_EVIDENCIA);
    });
  });
});

describe('resumirRevalidacao', () => {
  it('conta alertas por recomendação e por pendência', () => {
    // Arrange
    const { resumirRevalidacao } = require('./revalidacao');
    const itens = [
      { recomendacao: RECOMENDACAO.OK, pendencias: [] },
      { recomendacao: RECOMENDACAO.NAO_PUBLICAR, pendencias: [{ codigo: PENDENCIAS.NOME_PLACEHOLDER }, { codigo: PENDENCIAS.LEGADO }] },
      { recomendacao: RECOMENDACAO.CONFERIR, pendencias: [{ codigo: PENDENCIAS.LEGADO }] },
    ];

    // Act
    const resumo = resumirRevalidacao(itens);

    // Assert
    expect(resumo.total).toBe(3);
    expect(resumo.por_recomendacao).toEqual({ ok: 1, nao_publicar: 1, conferir: 1 });
    expect(resumo.por_pendencia).toEqual({ NOME_PLACEHOLDER: 1, LEGADO: 2 });
  });
});
