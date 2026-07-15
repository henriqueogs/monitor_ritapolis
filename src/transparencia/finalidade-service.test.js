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

function seedDespesa({ classe, exercicio, valor, credorNome, credorChave, unidade = '02.001 - ADM', fonte = '1.500 - RECURSOS PROPRIOS' }) {
  seq += 1;
  const result = mockConn.prepare(`
    INSERT INTO transparencia_despesas
      (exercicio_orcamento, empenho, tipo, data_empenho, credor_nome, credor_chave,
       valor, unidade, fonte_recurso, categoria_economica, historico, hash_despesa)
    VALUES (?, ?, 'EO - Empenho Ordinario', ?, ?, ?, ?, ?, ?, '3.3.90.39.00 - SERVICOS PJ', 'Teste', ?)
  `).run(
    exercicio,
    `${seq}`.padStart(5, '0') + '-000',
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
