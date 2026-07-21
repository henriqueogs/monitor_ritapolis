'use strict';

const {
  fallbackInvestigation,
  investigarDescoberta,
  validateDiscoveryInvestigation,
} = (() => {
  const mod = require('./discovery-investigation');
  const contract = require('./contracts/discovery-investigation-contract');
  return { ...mod, validateDiscoveryInvestigation: contract.validateDiscoveryInvestigation };
})();

function alertaBase() {
  return {
    tipo: 'tematico',
    categoria: 'Meio ambiente',
    subcategoria: 'Supressao de arvores',
    titulo: 'Supressao de arvores em 2026',
    narrativa: 'Documentos indicam supressao de arvores.',
    chave_unica: 'fato|meio-ambiente|supressao-arvores|ano|2026',
    documentos_ids: [607, 12],
    valor_total: 70,
    valor_periodo_label: 'Total factual em 2026',
    confianca: 0.8,
    metadados: {
      tipo_fato: 'meio_ambiente.supressao_arvores',
      discovery_kind: 'investigacao_factual',
      investigacao_tipo: 'supressao_arvores',
      unidade: 'arvores',
      total_quantidade: 70,
    },
    evidencias: [
      {
        documento_id: 607,
        anexo_id: null,
        trecho_fonte: 'Supressao de 60 arvores acima de 10 metros nas ruas e pracas da cidade.',
        metadados: { quantidade: 60, unidade: 'arvores' },
      },
      {
        documento_id: 12,
        anexo_id: 40,
        trecho_fonte: 'Supressao de 10 arvores dentro da area urbana.',
        metadados: { quantidade: 10, unidade: 'arvores' },
      },
    ],
  };
}

describe('discovery-investigation', () => {
  it('fallback preserva descoberta e marca lacunas nao encontradas', () => {
    const result = fallbackInvestigation(alertaBase(), 'teste');
    expect(result.hipotese_publica).toContain('70 arvores');
    expect(result.o_que_os_dados_mostram.join(' ')).toContain('70');
    expect(result.lacunas_encontradas.some((item) => item.includes('laudo tecnico'))).toBe(true);
    expect(result.analise_admin).toContain('Fallback deterministico');
  });

  it('fallback tambem produz narrativa_consolidada (paragrafo unico)', () => {
    const result = fallbackInvestigation(alertaBase(), 'teste');
    expect(result.narrativa_consolidada).toContain('70 arvores');
    // a narrativa consolidada incorpora a lacuna na mesma prosa, nao so nos arrays
    expect(result.narrativa_consolidada.length).toBeGreaterThan(result.hipotese_publica.length);
  });

  it('fallback nao produz narrativa_consolidada quando o toggle esta desligado', () => {
    const result = fallbackInvestigation(alertaBase(), 'teste', { narrativaConsolidadaAtiva: false });
    expect(result.narrativa_consolidada).toBeUndefined();
  });

  it('contrato rejeita linguagem acusatoria no publico', () => {
    expect(() => validateDiscoveryInvestigation({
      hipotese_publica: 'Ha suspeita de irregularidade nos documentos.',
      pergunta_cidada: 'O que os documentos mostram?',
      resposta_direta: 'Os documentos registram 70 arvores.',
      por_que_olhar: 'Vale conferir o laudo tecnico.',
      narrativa_consolidada: 'Os documentos registram 70 arvores. Vale conferir o laudo tecnico publicado.',
      o_que_os_dados_mostram: ['70 arvores'],
      lacunas_encontradas: [],
      perguntas_abertas: [],
      evidencias_usadas: [{ documento_id: 607, anexo_id: null, descricao: 'trecho' }],
      nivel_confianca: 0.8,
      analise_admin: 'admin pode ser incisivo',
    })).toThrow(/acusatorio/);
  });

  it('contrato rejeita linguagem acusatoria dentro de narrativa_consolidada', () => {
    expect(() => validateDiscoveryInvestigation({
      hipotese_publica: 'Vale conferir os documentos.',
      pergunta_cidada: 'O que os documentos mostram?',
      resposta_direta: 'Os documentos registram 70 arvores.',
      por_que_olhar: 'Vale conferir o laudo tecnico.',
      narrativa_consolidada: 'Ha indicio de fraude nos documentos analisados.',
      o_que_os_dados_mostram: ['70 arvores'],
      lacunas_encontradas: [],
      perguntas_abertas: [],
      evidencias_usadas: [{ documento_id: 607, anexo_id: null, descricao: 'trecho' }],
      nivel_confianca: 0.8,
      analise_admin: 'admin pode ser incisivo',
    })).toThrow(/acusatorio/);
  });

  it('contrato aceita narrativa_consolidada valida', () => {
    const validado = validateDiscoveryInvestigation({
      hipotese_publica: 'Vale conferir os documentos.',
      pergunta_cidada: 'O que os documentos mostram?',
      resposta_direta: 'Os documentos registram 70 arvores.',
      por_que_olhar: 'Vale conferir o laudo tecnico.',
      narrativa_consolidada: 'A prefeitura contratou a supressao de 70 arvores em 2026, sem registro de laudo tecnico nos documentos analisados.',
      o_que_os_dados_mostram: ['70 arvores'],
      lacunas_encontradas: [],
      perguntas_abertas: [],
      evidencias_usadas: [{ documento_id: 607, anexo_id: null, descricao: 'trecho' }],
      nivel_confianca: 0.8,
      analise_admin: 'admin pode ser incisivo',
    });
    expect(validado.narrativa_consolidada).toContain('70 arvores');
  });

  it('usa fallback quando provider falha', async () => {
    const provider = {
      generateJson: jest.fn().mockRejectedValue(new Error('modelo indisponivel')),
    };
    const result = await investigarDescoberta(alertaBase(), { provider });
    expect(result.metadados.discovery_v2.status).toBe('fallback');
    expect(result.metadados.discovery_v2.erro).toContain('modelo indisponivel');
    expect(result.narrativa).toContain('70 arvores');
  });

  it('aceita resposta valida do provider', async () => {
    const provider = {
      provider: 'mock',
      model: 'mock-model',
      generateJson: jest.fn().mockResolvedValue(JSON.stringify({
        hipotese_publica: 'A supressao de arvores em 2026 merece leitura dos documentos tecnicos publicados.',
        pergunta_cidada: 'O que os documentos mostram sobre 70 arvores em 2026?',
        resposta_direta: 'Os documentos 607 e 12 registram a supressao de 70 arvores em 2026.',
        por_que_olhar: 'Os trechos analisados nao registram laudo tecnico ou compensacao ambiental.',
        narrativa_consolidada: 'A prefeitura contratou a supressao de 70 arvores em 2026 (documentos 607 e 12), sem registro de laudo tecnico nos documentos analisados.',
        o_que_os_dados_mostram: ['A contagem informada soma 70 arvores.'],
        lacunas_encontradas: ['Nao encontrado nos documentos analisados: compensacao ou replantio.'],
        perguntas_abertas: ['Existe laudo tecnico vinculado?'],
        evidencias_usadas: [{ documento_id: 607, anexo_id: null, descricao: 'Supressao de 60 arvores.' }],
        nivel_confianca: 0.82,
        analise_admin: 'Sinal sensivel para revisar documentacao ambiental.',
      })),
    };
    const result = await investigarDescoberta(alertaBase(), { provider });
    expect(result.metadados.discovery_v2.status).toBe('ok');
    expect(result.metadados.discovery_v2.contrato_versao).toBe('discovery-investigation-v2');
    expect(result.metadados.discovery_v2.provider).toBe('mock');
    expect(result.questionamentos).toContain('Existe laudo tecnico vinculado?');
    // narrativa_consolidada (quando presente) vira a narrativa principal do alerta
    expect(result.narrativa).toBe(result.metadados.discovery_v2.narrativa_consolidada);
  });

  it('usa fallback quando a resposta do provider nao cumpre o contrato v3', async () => {
    const provider = {
      provider: 'mock',
      model: 'mock-model',
      generateJson: jest.fn().mockResolvedValue(JSON.stringify({
        hipotese_publica: 'A supressao de arvores em 2026 merece leitura dos documentos tecnicos publicados.',
        o_que_os_dados_mostram: ['A contagem informada soma 70 arvores.'],
        lacunas_encontradas: [],
        perguntas_abertas: [],
        evidencias_usadas: [{ documento_id: 607, anexo_id: null, descricao: 'Supressao de 60 arvores.' }],
        nivel_confianca: 0.82,
        analise_admin: 'Sinal sensivel para revisar documentacao ambiental.',
      })),
    };
    const result = await investigarDescoberta(alertaBase(), { provider });
    expect(result.metadados.discovery_v2.status).toBe('fallback');
    expect(result.narrativa).toContain('70 arvores');
  });
});
