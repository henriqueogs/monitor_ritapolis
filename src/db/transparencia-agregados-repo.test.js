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
