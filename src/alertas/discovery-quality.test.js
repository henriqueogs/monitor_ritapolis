'use strict';

const { validarFactual, validarEditorial } = require('./discovery-quality');

function descobertaIdeal() {
  return {
    id: 57,
    titulo: 'Supressao de 70 arvores em 2026',
    valor_total: 70,
    periodo_inicio: '2026-01-01',
    periodo_fim: '2026-12-31',
    documentos_ids: [12, 607],
    documentos: [
      { documento_id: 12, url_origem: 'https://ritapolis.mg.gov.br/doc/12' },
      { documento_id: 607, url_origem: 'https://ritapolis.mg.gov.br/doc/607' },
    ],
    evidencias: [
      { documento_id: 12, fato_id: 1, trecho_fonte: 'Supressao de 10 arvores.', metadados: { quantidade: 10, unidade: 'arvores' } },
      { documento_id: 607, fato_id: 2, trecho_fonte: 'Supressao de 60 arvores.', metadados: { quantidade: 60, unidade: 'arvores' } },
    ],
    metadados: {
      discovery_kind: 'investigacao_factual',
      investigacao_tipo: 'supressao_arvores',
      subject_key: 'supressao-arvores|2026',
      unidade: 'arvores',
      metrica_principal: { nome: 'total_arvores', valor: 70, unidade: 'arvores' },
      metricas_deterministicas: { total_arvores: 70, documentos_distintos: 2 },
      comparativos_deterministicos: {},
    },
  };
}

describe('gates de qualidade das descobertas v3', () => {
  it('aprova o padrao fixo e reproduzivel da descoberta 57', () => {
    const gate = validarFactual(descobertaIdeal());
    expect(gate.aprovado).toBe(true);
    expect(gate.motivos).toEqual([]);
  });

  it('reprova o padrao generico da descoberta 132 com motivos objetivos', () => {
    const alerta = {
      id: 132,
      titulo: 'Servicos recorrentes para investigar em 2026',
      valor_total: 113,
      documentos_ids: [1, 2, 3, 4, 5, 6, 7, 8],
      evidencias: Array.from({ length: 8 }, (_, i) => ({
        documento_id: i + 1,
        trecho_fonte: 'servico recorrente',
        metadados: { descricao: 'servico recorrente' },
      })),
      metadados: {
        discovery_kind: 'investigacao_factual',
        investigacao_tipo: 'contratos.recorrencia_fornecedor_objeto',
        subject_key: 'servicos-recorrentes|2026',
        unidade: 'documentos',
        metrica_principal: { nome: 'documentos', valor: 113, unidade: 'documentos' },
      },
    };
    const gate = validarFactual(alerta);
    expect(gate.aprovado).toBe(false);
    expect(gate.motivos).toEqual(expect.arrayContaining([
      'GENERIC_EVIDENCE',
      'DOCUMENT_COUNT_MISMATCH',
      'RECURRENCE_NOT_PROVEN',
      'MIXED_SUBJECTS',
    ]));
  });

  it('bloqueia titulo editorial generico mesmo com base factual aprovada', () => {
    const alerta = descobertaIdeal();
    const factual = validarFactual(alerta);
    const editorial = validarEditorial(alerta, {
      pergunta_cidada: 'Servicos recorrentes para investigar em 2026',
      resposta_direta: 'Os documentos 12 e 607 registram 70 arvores em 2026.',
      por_que_olhar: 'Vale conferir o laudo tecnico publicado.',
      narrativa_consolidada: 'Os documentos registram 70 arvores em 2026. O laudo tecnico merece conferencia.',
      perguntas_abertas: [],
    }, factual);
    expect(editorial.aprovado).toBe(false);
    expect(editorial.motivos).toContain('EDITORIAL_GENERIC_TITLE');
  });

  it('bloqueia narrativa que declara ausente um fato presente no pacote deterministico', () => {
    const alerta = {
      valor_total: 2,
      periodo_inicio: '2026-01-01',
      periodo_fim: '2026-02-01',
      documentos_ids: [14, 15],
      documentos: [
        { documento_id: 14, url_origem: 'https://ritapolis.mg.gov.br/doc/14' },
        { documento_id: 15, url_origem: 'https://ritapolis.mg.gov.br/doc/15' },
      ],
      evidencias: [
        { documento_id: 14, trecho_fonte: 'Contratacao de trio eletrico para o Carnaval.' },
        { documento_id: 15, trecho_fonte: 'Contratacao de ornamentacao para o Carnaval.' },
      ],
      metadados: {
        discovery_kind: 'investigacao_factual',
        investigacao_tipo: 'eventos.gastos_eventos_publicos',
        subject_key: 'evento|carnaval|2026',
        unidade: 'documentos',
        metrica_principal: { nome: 'processos_do_evento', valor: 2, unidade: 'processos' },
        metricas_deterministicas: { processos_distintos: 2, valor_final_identificado: 137250 },
        comparativos_deterministicos: { evento: 'Carnaval' },
        event_group: { event_key: 'carnaval', evento: 'Carnaval' },
      },
    };
    const factual = validarFactual(alerta);
    const editorial = validarEditorial(alerta, {
      pergunta_cidada: 'Quantos contratos foram firmados para o Carnaval 2026?',
      resposta_direta: 'Foram 2 contratos para o Carnaval em 2026.',
      por_que_olhar: 'Os contratos tratam de objetos diferentes do mesmo evento.',
      narrativa_consolidada: 'Foram identificadas contratacoes de trio eletrico e ornamentacao [14, 15]. Nao foram encontradas informacoes sobre o objeto contratado ou o valor [14, 15].',
      lacunas_encontradas: [
        'nao encontrado nos documentos analisados: objeto contratado',
        'nao encontrado nos documentos analisados: valor',
      ],
      perguntas_abertas: [],
    }, factual);
    expect(factual.aprovado).toBe(true);
    expect(editorial.aprovado).toBe(false);
    expect(editorial.motivos).toContain('EDITORIAL_CONTRADICTS_FACTS');
    expect(editorial.diagnostico.campos_contraditorios).toEqual(['valor', 'objeto']);
  });
});
