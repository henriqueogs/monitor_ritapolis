'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

function criarBancoMemoria() {
  const conn = new DatabaseSync(':memory:');
  conn.exec(fs.readFileSync(path.resolve(__dirname, '../db/schema.sql'), 'utf8'));
  return conn;
}

const mockConn = criarBancoMemoria();
jest.mock('../db/index', () => ({ db: mockConn }));

const { getFinalidadesResumo, getFinalidadeDossie, resolverExercicios } = require('./finalidade-service');

let seq = 0;

function seedDespesa({ classe, exercicio, valor, credorNome, credorChave, unidade = '02.001 - ADM', fonte = '1.500 - RECURSOS PROPRIOS', tipo = 'EO - Empenho Ordinario' }) {
  seq += 1;
  const result = mockConn.prepare(`
    INSERT INTO transparencia_despesas
      (exercicio_orcamento, empenho, tipo, data_empenho, credor_nome, credor_chave,
       valor, unidade, fonte_recurso, categoria_economica, historico, hash_despesa)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '3.3.90.39.00 - SERVICOS PJ', 'Teste', ?)
  `).run(
    exercicio,
    `${seq}`.padStart(5, '0') + '-000',
    tipo,
    `${exercicio}-06-01`,
    credorNome,
    credorChave,
    valor,
    unidade,
    fonte,
    `hash-finalidade-${seq}`
  );
  const despesaId = Number(result.lastInsertRowid);
  mockConn.prepare(`
    INSERT INTO transparencia_despesas_classificacoes
      (despesa_id, classe_principal, subclasse, confianca, evidencias_json, versao)
    VALUES (?, ?, NULL, 0.9, '[]', 'test')
  `).run(despesaId, classe);
  return despesaId;
}

describe('finalidade-service', () => {
  beforeEach(() => {
    mockConn.exec('DELETE FROM transparencia_despesas_classificacoes; DELETE FROM transparencia_despesas; DELETE FROM documentos;');
    seq = 0;
  });

  it('resolve mandato para quatro exercicios', () => {
    expect(resolverExercicios({ mandato: 2026 })).toEqual([2025, 2026, 2027, 2028]);
  });

  it('agrega finalidades no periodo selecionado', () => {
    seedDespesa({ classe: 'licitacao', exercicio: 2026, valor: 100, credorNome: 'EMPRESA A', credorChave: '111' });
    seedDespesa({ classe: 'diaria_servidor', exercicio: 2025, valor: 50, credorNome: 'SERVIDOR B', credorChave: 'pf-servidor-b' });
    seedDespesa({ classe: 'licitacao', exercicio: 2023, valor: 30, credorNome: 'EMPRESA A', credorChave: '111' });

    const resumo = getFinalidadesResumo({ mandato: 2026 });

    expect(resumo.periodo.mandato).toEqual({ inicio: 2025, fim: 2028, label: '2025-2028' });
    expect(resumo.total).toMatchObject({ n_empenhos: 2, valor_total: 150, n_finalidades: 2 });
    expect(resumo.finalidades.map((item) => item.classe)).toEqual(['licitacao', 'diaria_servidor']);
  });

  it('monta dossie de finalidade com serie, credores, orgaos, fontes e empenhos', () => {
    const id2026 = seedDespesa({ classe: 'licitacao', exercicio: 2026, valor: 100, credorNome: 'EMPRESA A', credorChave: '111' });
    seedDespesa({ classe: 'licitacao', exercicio: 2023, valor: 30, credorNome: 'EMPRESA C', credorChave: '333' });
    seedDespesa({ classe: 'diaria_servidor', exercicio: 2026, valor: 50, credorNome: 'SERVIDOR B', credorChave: 'pf-servidor-b' });

    const dossie = getFinalidadeDossie('licitacao', { exercicio: 2026 });

    expect(dossie.finalidade).toMatchObject({ classe: 'licitacao', rotulo: 'Licita\u00e7\u00e3o' });
    expect(dossie.resumo).toMatchObject({ n_empenhos: 1, valor_total: 100, n_credores: 1 });
    expect(dossie.por_ano.map((row) => row.exercicio)).toEqual([2023, 2026]);
    expect(dossie.top_credores[0]).toMatchObject({ credor_nome: 'EMPRESA A', valor_total: 100 });
    expect(dossie.por_unidade[0]).toMatchObject({ unidade: '02.001 - ADM', valor_total: 100 });
    expect(dossie.por_fonte[0]).toMatchObject({ fonte_recurso: '1.500 - RECURSOS PROPRIOS', valor_total: 100 });
    expect(dossie.empenhos_recentes[0]).toMatchObject({ id: id2026, finalidade: expect.objectContaining({ classe: 'licitacao' }) });
  });

  it('retorna null para finalidade desconhecida', () => {
    expect(getFinalidadeDossie('nao_existe')).toBeNull();
  });
});

describe('finalidade-service - tipos de empenho (fiscal-valores V2/V3/V7)', () => {
  const TIPO_EE = 'EE - Empenho Estimativo';
  const TIPO_OP = 'OP - Ordem de Pagamento';

  beforeEach(() => {
    mockConn.exec('DELETE FROM transparencia_despesas_classificacoes; DELETE FROM transparencia_despesas; DELETE FROM documentos;');
    seq = 0;
    seedDespesa({ classe: 'licitacao', exercicio: 2026, valor: 100, credorNome: 'EMPRESA A', credorChave: '111' });
    seedDespesa({ classe: 'licitacao', exercicio: 2026, valor: 400, credorNome: 'EMPRESA A', credorChave: '111', tipo: TIPO_EE });
    seedDespesa({ classe: 'licitacao', exercicio: 2026, valor: 55, credorNome: 'EMPRESA A', credorChave: '111', tipo: TIPO_OP });
    seedDespesa({ classe: 'diaria_servidor', exercicio: 2025, valor: 40, credorNome: 'SERVIDOR B', credorChave: 'pf-b' });
  });

  it('resumo: valor_total so ordinario; estimativo/global a parte; OP fora', () => {
    const r = getFinalidadesResumo({ mandato: 2026 });

    const licitacao = r.finalidades.find((f) => f.classe === 'licitacao');
    expect(licitacao).toMatchObject({ n: 1, valor_total: 100, valor_estimado_global: 400 });
    expect(r.total).toMatchObject({ n_empenhos: 2, valor_total: 140, valor_estimado_global: 400 });
  });

  it('invariante: soma das finalidades == total == soma da serie por mandato', () => {
    const r = getFinalidadesResumo({ mandato: 2026 });

    expect(r.finalidades.reduce((a, f) => a + f.valor_total, 0)).toBe(r.total.valor_total);
    expect(r.por_mandato[0].valor_total).toBe(r.total.valor_total);
    expect(r.por_mandato[0].valor_estimado_global).toBe(r.total.valor_estimado_global);
  });

  it('dossie: resumo, por ano, unidade e fonte no mesmo universo (ordinario)', () => {
    const d = getFinalidadeDossie('licitacao', { mandato: 2026 });

    expect(d.resumo).toMatchObject({ n_empenhos: 1, valor_total: 100, valor_estimado_global: 400 });
    expect(d.por_ano).toEqual([expect.objectContaining({ exercicio: 2026, n: 1, valor_total: 100, valor_estimado_global: 400 })]);
    expect(d.por_unidade.reduce((a, u) => a + u.valor_total, 0)).toBe(d.resumo.valor_total);
    expect(d.por_fonte.reduce((a, u) => a + u.valor_total, 0)).toBe(d.resumo.valor_total);
    expect(d.top_credores[0]).toMatchObject({ valor_total: 100, valor_estimado_global: 400 });
  });

  it('dossie: empenhos recentes nao listam ordem de pagamento', () => {
    const d = getFinalidadeDossie('licitacao', { mandato: 2026 });

    expect(d.empenhos_recentes.some((e) => /^OP/.test(e.tipo))).toBe(false);
  });

  it('fronteira 2024/2025: anos de mandatos diferentes nao se misturam', () => {
    seedDespesa({ classe: 'licitacao', exercicio: 2024, valor: 700, credorNome: 'EMPRESA A', credorChave: '111' });

    const atual = getFinalidadeDossie('licitacao', { mandato: 2025 });
    const anterior = getFinalidadeDossie('licitacao', { mandato: 2024 });

    expect(atual.resumo.valor_total).toBe(100);
    expect(anterior.resumo.valor_total).toBe(700);
    expect(atual.por_mandato.map((m) => [m.mandato, m.valor_total])).toEqual([['2025-2028', 100], ['2021-2024', 700]]);
  });
});
