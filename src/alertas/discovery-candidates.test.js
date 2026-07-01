'use strict';

const { gerarCandidatosInvestigativos } = require('./discovery-candidates');

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
      ...Array.from({ length: 10 }, (_, i) => fato(30 + i, 'contratos', 'servico_recorrente', 40 + i, 2026)),
      ...Array.from({ length: 6 }, (_, i) => fato(60 + i, 'eventos', 'evento_publico', 70 + i, 2026)),
    ];

    const candidatos = gerarCandidatosInvestigativos(fatos, { thresholdArvores: 20 });
    const tipos = candidatos.map((c) => c.metadados.investigacao_tipo);
    expect(tipos).toContain('supressao_arvores');
    expect(tipos).toContain('compras.precos_itens');
    expect(tipos).toContain('contratos.recorrencia_fornecedor_objeto');
    expect(tipos).toContain('eventos.gastos_eventos_publicos');
    expect(new Set(candidatos.map((c) => c.chave_unica)).size).toBe(candidatos.length);
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
});
