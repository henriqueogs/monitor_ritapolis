'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

function criarBancoMemoria() {
  const conn = new DatabaseSync(':memory:');
  conn.exec(fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf8'));
  return conn;
}

const mockConn = criarBancoMemoria();
jest.mock('./index', () => ({ db: mockConn }));

const repo = require('./transparencia-agregados-repo');

let seq = 0;
function seedDespesa({
  exercicio = 2026,
  empenho,
  tipo = 'EO - Empenho Ordinário',
  data = '2026-06-01',
  credorCnpj = '11111111111111',
  credorNome = 'FORNECEDOR A',
  valor = 100,
  categoria = '3.3.90.14.00 - DIÁRIAS - CIVIL',
  unidade = '02.001.001 - SECRETARIA DE ADMINISTRAÇÃO',
  fonteRecurso = '1.500.000 - RECURSOS PRÓPRIOS',
  documentoId = null,
} = {}) {
  seq += 1;
  mockConn
    .prepare(
      `INSERT INTO transparencia_despesas
         (exercicio_orcamento, empenho, tipo, data_empenho, credor_cnpj, credor_nome,
          valor, categoria_economica, unidade, fonte_recurso, documento_id, hash_despesa)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      exercicio,
      empenho || `${String(seq).padStart(5, '0')}-000`,
      tipo,
      data,
      credorCnpj,
      credorNome,
      valor,
      categoria,
      unidade,
      fonteRecurso,
      documentoId,
      `hash-${seq}`
    );
  return mockConn.prepare('SELECT last_insert_rowid() AS id').get().id;
}

function seedDocumento(id) {
  mockConn
    .prepare(
      `INSERT INTO documentos (id, fonte, tipo, titulo, numero, url_origem)
       VALUES (?, 'site_prefeitura', 'edital', 'Pregão 1/2026', '1/2026', 'https://x/y')`
    )
    .run(id);
}

describe('transparencia-agregados-repo', () => {
  beforeEach(() => {
    mockConn.exec('DELETE FROM transparencia_despesas; DELETE FROM documentos;');
    seq = 0;
  });

  describe('getDespesaById', () => {
    it('retorna todas as colunas + documento vinculado', () => {
      seedDocumento(7);
      const id = seedDespesa({ documentoId: 7, valor: 500 });
      const d = repo.getDespesaById(id);

      expect(d.valor).toBe(500);
      expect(d.categoria_economica).toContain('DIÁRIAS');
      expect(d.unidade).toContain('SECRETARIA');
      expect(d.fonte_recurso).toContain('PRÓPRIOS');
      expect(d.documento_titulo).toBe('Pregão 1/2026');
      expect(d.documento_numero).toBe('1/2026');
    });

    it('retorna null quando não existe', () => {
      expect(repo.getDespesaById(99999)).toBeNull();
    });
  });

  describe('getResumoRelacionados (mesmo credor no ano)', () => {
    it('agrega e traz exemplos excluindo o próprio empenho', () => {
      const alvo = seedDespesa({ credorCnpj: '22222222222222', valor: 10 });
      seedDespesa({ credorCnpj: '22222222222222', valor: 20 });
      seedDespesa({ credorCnpj: '22222222222222', valor: 30, exercicio: 2025, data: '2025-01-01' });
      seedDespesa({ credorCnpj: '33333333333333', valor: 99 });

      const r = repo.getResumoRelacionados({
        credorCnpj: '22222222222222',
        exercicio: 2026,
        exceptId: alvo,
      });

      expect(r.n).toBe(1);
      expect(r.valor_total).toBe(20);
      expect(r.exemplos).toHaveLength(1);
      expect(r.exemplos[0]).toMatchObject({ valor: 20 });
      expect(r.exemplos[0].id).toBeDefined();
    });
  });

  describe('agregados para o painel de gastos', () => {
    beforeEach(() => {
      seedDespesa({ valor: 10, categoria: '3.3.90.14.00 - DIÁRIAS', credorCnpj: '1', credorNome: 'A' });
      seedDespesa({ valor: 20, categoria: '3.3.90.14.00 - DIÁRIAS', credorCnpj: '2', credorNome: 'B' });
      seedDespesa({ valor: 300, categoria: '4.4.90.51.00 - OBRAS', unidade: '02.002 - OBRAS', fonteRecurso: '2.500.000 - FUNDEB' });
      seedDespesa({ valor: 40, categoria: '3.3.90.14.00 - DIÁRIAS', exercicio: 2025, data: '2025-01-01' });
    });

    it('getAgregadoPorCategoriaEconomica agrega bruto por exercicios', () => {
      const rows = repo.getAgregadoPorCategoriaEconomica({ exercicios: [2026] });
      expect(rows).toHaveLength(2);
      const diarias = rows.find((r) => r.categoria_economica.includes('DIÁRIAS'));
      expect(diarias.n).toBe(2);
      expect(diarias.valor_total).toBe(30);
    });

    it('getAgregadoPorCategoriaEconomica sem exercicios agrega tudo', () => {
      const rows = repo.getAgregadoPorCategoriaEconomica({});
      const diarias = rows.find((r) => r.categoria_economica.includes('DIÁRIAS'));
      expect(diarias.n).toBe(3);
      expect(diarias.valor_total).toBe(70);
    });

    it('getAgregadoPorUnidade respeita prefixos de categoria', () => {
      const todas = repo.getAgregadoPorUnidade({ exercicios: [2026] });
      expect(todas).toHaveLength(2);
      const soObras = repo.getAgregadoPorUnidade({ exercicios: [2026], prefixos: ['4.4.90.51'] });
      expect(soObras).toHaveLength(1);
      expect(soObras[0].unidade).toContain('OBRAS');
      expect(soObras[0].valor_total).toBe(300);
    });

    it('getAgregadoPorFonteRecurso agrega por fonte', () => {
      const fontes = repo.getAgregadoPorFonteRecurso({ exercicios: [2026] });
      expect(fontes).toHaveLength(2);
      expect(fontes[0].valor_total).toBeGreaterThanOrEqual(fontes[1].valor_total);
    });

    it('getRankingCredores ranqueia credores da categoria no período', () => {
      const ranking = repo.getRankingCredores({ prefixos: ['3.3.90.14'], exercicios: [2026], limite: 10 });
      expect(ranking).toHaveLength(2);
      expect(ranking[0].credor_nome).toBe('B');
      expect(ranking[0].valor_total).toBe(20);
    });

    it('getCategoriaPorAno série anual da categoria', () => {
      const serie = repo.getCategoriaPorAno({ prefixos: ['3.3.90.14'] });
      expect(serie).toEqual([
        expect.objectContaining({ exercicio: 2025, n: 1, valor_total: 40 }),
        expect.objectContaining({ exercicio: 2026, n: 2, valor_total: 30 }),
      ]);
    });
  });

  describe('getAgregadoCredorCategoriaAno', () => {
    it('agrega por categoria bruta × ano × credor com ids dos empenhos', () => {
      seedDespesa({ valor: 10, credorCnpj: '1', credorNome: 'A' });
      seedDespesa({ valor: 20, credorCnpj: '1', credorNome: 'A' });
      seedDespesa({ valor: 5, credorCnpj: '2', credorNome: 'B' });

      const rows = repo.getAgregadoCredorCategoriaAno();
      const a = rows.find((r) => r.credor_cnpj === '1');
      expect(a.n).toBe(2);
      expect(a.valor_total).toBe(30);
      expect(a.exercicio).toBe(2026);
      expect(a.empenho_ids).toHaveLength(2);
      expect(typeof a.empenho_ids[0]).toBe('number');
    });
  });

  describe('getDespesasPorIds', () => {
    it('retorna empenho/exercicio/tipo dos ids pedidos', () => {
      const id1 = seedDespesa({ valor: 10 });
      seedDespesa({ valor: 20 });
      const rows = repo.getDespesasPorIds([id1]);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(id1);
      expect(rows[0].empenho).toMatch(/^\d{5}-\d{3}$/);
    });

    it('lista vazia retorna vazio', () => {
      expect(repo.getDespesasPorIds([])).toEqual([]);
    });
  });

  describe('getResumoCategoriaAno', () => {
    it('agrega por prefixos de categoria no exercício', () => {
      seedDespesa({ valor: 10 });
      seedDespesa({ valor: 15 });
      seedDespesa({ valor: 99, categoria: '4.4.90.51.00 - OBRAS' });
      seedDespesa({ valor: 77, exercicio: 2025, data: '2025-02-01' });

      const r = repo.getResumoCategoriaAno({ prefixos: ['3.3.90.14'], exercicio: 2026 });
      expect(r.n).toBe(2);
      expect(r.valor_total).toBe(25);
      expect(r.exemplos.length).toBeLessThanOrEqual(5);
    });
  });
});
