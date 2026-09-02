'use strict';

const { gerarCandidatosInvestigativos, candidatosRiscosResumo } = require('./discovery-candidates');

function fato(id, tipo, subtipo, documentoId, ano, overrides = {}) {
  return {
    id,
    documento_id: documentoId,
    anexo_id: overrides.anexo_id ?? null,
    tipo,
    subtipo,
    descricao: overrides.descricao || `${tipo}.${subtipo}`,
    quantidade: overrides.quantidade ?? null,
    unidade: overrides.unidade || null,
    valor: overrides.valor ?? null,
    periodo_inicio: `${ano}-03-01`,
    data_evento: `${ano}-03-01`,
    ano,
    trecho_fonte: overrides.trecho_fonte || `${tipo}.${subtipo} em ${ano}`,
    confianca: overrides.confianca ?? 0.78,
    ...overrides,
  };
}

describe('gerarCandidatosInvestigativos', () => {
  it('gera candidatos dos quatro temas prioritarios com chaves estaveis', () => {
    const fatos = [
      fato(1, 'meio_ambiente', 'supressao_arvores', 10, 2026, { quantidade: 60, unidade: 'arvores' }),
      fato(2, 'meio_ambiente', 'supressao_arvores', 11, 2026, { quantidade: 10, unidade: 'arvores' }),
      ...Array.from({ length: 8 }, (_, i) => fato(10 + i, 'compras', 'preco_item', 20 + i, 2026, { valor: i < 5 ? 20 : 5000 + i, unidade: i % 2 ? null : 'un' })),
      ...Array.from({ length: 3 }, (_, i) => fato(30 + i, 'contratos', 'servico_recorrente', 40 + i, 2026, {
        titulo: `Contratacao de manutencao preventiva de veiculos da frota municipal lote ${i + 1}`,
        vencedor_cnpj: '12.345.678/0001-90',
        vencedor_nome: 'Oficina Exemplo Ltda',
        documento_numero: `PRC-${i + 1}`,
      })),
      ...Array.from({ length: 3 }, (_, i) => fato(60 + i, 'eventos', 'evento_publico', 70 + i, 2026, {
        titulo: `${42 + 0} Exposicao Agropecuaria - contratacao ${i + 1}`,
        trecho_fonte: `Servico destinado a 42 Exposicao Agropecuaria de Ritapolis`,
      })),
    ];

    const candidatos = gerarCandidatosInvestigativos(fatos, { thresholdArvores: 20 });
    const tipos = candidatos.map((c) => c.metadados.investigacao_tipo);
    expect(tipos).toContain('supressao_arvores');
    expect(tipos).toContain('compras.precos_itens');
    expect(tipos).toContain('contratos.recorrencia_fornecedor_objeto');
    expect(tipos).toContain('eventos.gastos_eventos_publicos');
    expect(new Set(candidatos.map((c) => c.chave_unica)).size).toBe(candidatos.length);
  });

  it('nao cria recorrencia sem o mesmo CNPJ e objeto equivalente', () => {
    const candidatos = gerarCandidatosInvestigativos([
      fato(1, 'contratos', 'servico_recorrente', 10, 2026, {
        titulo: 'Manutencao preventiva da frota municipal',
        vencedor_cnpj: '11.111.111/0001-11',
      }),
      fato(2, 'contratos', 'servico_recorrente', 11, 2026, {
        titulo: 'Show musical para festa municipal',
        vencedor_cnpj: '22.222.222/0001-22',
      }),
    ]);
    expect(candidatos.some((c) => c.metadados.investigacao_tipo === 'contratos.recorrencia_fornecedor_objeto')).toBe(false);
  });

  it('deduplica evidencias repetidas por documento/anexo nos candidatos anuais', () => {
    const candidatos = gerarCandidatosInvestigativos([
      fato(1, 'meio_ambiente', 'supressao_arvores', 10, 2026, { quantidade: 60, unidade: 'arvores', anexo_id: null }),
      fato(2, 'meio_ambiente', 'supressao_arvores', 10, 2026, { quantidade: 6, unidade: 'arvores', anexo_id: null }),
      fato(3, 'meio_ambiente', 'supressao_arvores', 11, 2026, { quantidade: 10, unidade: 'arvores', anexo_id: null }),
    ], { thresholdArvores: 20 });
    const arvores = candidatos.find((c) => c.metadados.investigacao_tipo === 'supressao_arvores');
    expect(arvores.valor_total).toBe(70);
    expect(arvores.evidencias).toHaveLength(2);
  });

  it('propaga origem_hash do fato pra evidencia — identidade estável entre reextrações (evita reabertura espúria, ver alertas-repo.buildEvidenciasHash)', () => {
    const candidatos = gerarCandidatosInvestigativos([
      fato(1, 'meio_ambiente', 'supressao_arvores', 10, 2026, { quantidade: 60, unidade: 'arvores', origem_hash: 'hash-arvores-doc10' }),
      fato(2, 'meio_ambiente', 'supressao_arvores', 11, 2026, { quantidade: 10, unidade: 'arvores', origem_hash: 'hash-arvores-doc11' }),
      ...Array.from({ length: 3 }, (_, i) => fato(30 + i, 'contratos', 'servico_recorrente', 40 + i, 2026, {
        titulo: `Contratacao de manutencao preventiva de veiculos da frota municipal lote ${i + 1}`,
        vencedor_cnpj: '12.345.678/0001-90',
        vencedor_nome: 'Oficina Exemplo Ltda',
        origem_hash: `hash-contrato-${i}`,
      })),
    ], { thresholdArvores: 20 });

    const arvores = candidatos.find((c) => c.metadados.investigacao_tipo === 'supressao_arvores');
    expect(arvores.evidencias.map((e) => e.origem_hash).sort()).toEqual(['hash-arvores-doc10', 'hash-arvores-doc11']);

    const contratos = candidatos.find((c) => c.metadados.investigacao_tipo === 'contratos.recorrencia_fornecedor_objeto');
    expect(contratos.evidencias.every((e) => e.origem_hash)).toBe(true);
  });
});

describe('candidatosRiscosResumo', () => {
  it('gera um candidato por risco alto, sem agrupar entre documentos', () => {
    const fatos = [
      fato(1, 'riscos_resumo', 'risco_alto', 10, 2026, {
        descricao: 'Falta licença ambiental',
        origem_hash: 'hash-risco-1',
        metadados: { nivel: 'alto', motivo: 'Documento não cita licença.', resumo_ai_id: 500 },
      }),
      fato(2, 'riscos_resumo', 'risco_alto', 11, 2026, {
        descricao: 'Fornecedor único em processo de dispensa',
        origem_hash: 'hash-risco-2',
        metadados: { nivel: 'alto', motivo: 'Só um fornecedor cotou.', resumo_ai_id: 501 },
      }),
    ];
    const candidatos = candidatosRiscosResumo(fatos);
    expect(candidatos).toHaveLength(2);
    expect(new Set(candidatos.map((c) => c.chave_unica)).size).toBe(2);
    expect(candidatos[0].titulo).toBe('Falta licença ambiental');
    expect(candidatos[0].documentos_ids).toEqual([10]);
  });

  it('marca a lacuna de traceabilidade — narrativa vem da IA, não de citação literal', () => {
    const candidatos = candidatosRiscosResumo([
      fato(1, 'riscos_resumo', 'risco_alto', 10, 2026, {
        descricao: 'D', origem_hash: 'h1', metadados: { nivel: 'alto', motivo: 'M' },
      }),
    ]);
    expect(candidatos[0].metadados.lacunas_deterministicas.join(' ')).toMatch(/leitura da IA/);
  });

  it('ignora fatos de outros tipos/subtipos', () => {
    const candidatos = candidatosRiscosResumo([
      fato(1, 'meio_ambiente', 'supressao_arvores', 10, 2026, { quantidade: 60 }),
      fato(2, 'riscos_resumo', 'risco_medio', 11, 2026, {}),
    ]);
    expect(candidatos).toHaveLength(0);
  });

  it('gerarCandidatosInvestigativos inclui riscos junto com os outros temas', () => {
    const candidatos = gerarCandidatosInvestigativos([
      fato(1, 'riscos_resumo', 'risco_alto', 10, 2026, {
        descricao: 'D', origem_hash: 'h1', metadados: { nivel: 'alto', motivo: 'M' },
      }),
    ]);
    expect(candidatos.some((c) => c.metadados.investigacao_tipo === 'riscos.alerta_resumo_ia')).toBe(true);
  });
});
