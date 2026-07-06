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

const { ensureColumn, backfillColunasDerivadas, ensureDespesasMigracoes } = require('./transparencia-migracoes');

function seedDespesa({ empenho, dadosExtras, cnpj = null, nome = 'CREDOR X' }) {
  mockConn
    .prepare(
      `INSERT INTO transparencia_despesas
         (exercicio_orcamento, empenho, credor_nome, credor_cnpj, valor, dados_extras, hash_despesa)
       VALUES (2026, ?, ?, ?, 100, ?, ?)`
    )
    .run(empenho, nome, cnpj, dadosExtras, `hash-${empenho}`);
}

describe('transparencia-migracoes', () => {
  beforeEach(() => {
    mockConn.exec('DELETE FROM transparencia_despesas;');
  });

  describe('ensureColumn', () => {
    it('adiciona coluna inexistente e retorna true; segunda chamada retorna false', () => {
      mockConn.exec('CREATE TABLE IF NOT EXISTS tabela_sintetica (id INTEGER PRIMARY KEY);');
      expect(ensureColumn('tabela_sintetica', 'nova_coluna', 'TEXT')).toBe(true);
      expect(ensureColumn('tabela_sintetica', 'nova_coluna', 'TEXT')).toBe(false);
      const cols = mockConn.prepare('PRAGMA table_info(tabela_sintetica)').all().map((c) => c.name);
      expect(cols).toContain('nova_coluna');
    });

    it('tabela inexistente não lança, retorna false', () => {
      expect(ensureColumn('tabela_que_nao_existe', 'x', 'TEXT')).toBe(false);
    });
  });

  describe('backfillColunasDerivadas', () => {
    it('preenche credor_cargo e co_tce a partir de dados_extras', () => {
      seedDespesa({
        empenho: '00001-000',
        dadosExtras: JSON.stringify({ cargo: 'MOTORISTA', coTce: 'TCE-123' }),
      });

      const r = backfillColunasDerivadas();

      const row = mockConn.prepare("SELECT credor_cargo, co_tce FROM transparencia_despesas WHERE empenho = '00001-000'").get();
      expect(row.credor_cargo).toBe('MOTORISTA');
      expect(row.co_tce).toBe('TCE-123');
      expect(r.atualizadas).toBeGreaterThan(0);
    });

    it('cargo vazio/whitespace vira NULL', () => {
      seedDespesa({ empenho: '00002-000', dadosExtras: JSON.stringify({ cargo: '   ', coTce: '' }) });

      backfillColunasDerivadas();

      const row = mockConn.prepare("SELECT credor_cargo, co_tce FROM transparencia_despesas WHERE empenho = '00002-000'").get();
      expect(row.credor_cargo).toBeNull();
      expect(row.co_tce).toBeNull();
    });

    it('dados_extras inválido não derruba o backfill', () => {
      seedDespesa({ empenho: '00003-000', dadosExtras: '{json quebrado' });
      seedDespesa({ empenho: '00004-000', dadosExtras: JSON.stringify({ cargo: 'PREFEITO' }) });

      expect(() => backfillColunasDerivadas()).not.toThrow();
      const ok = mockConn.prepare("SELECT credor_cargo FROM transparencia_despesas WHERE empenho = '00004-000'").get();
      expect(ok.credor_cargo).toBe('PREFEITO');
    });

    it('é idempotente (rodar duas vezes não muda nada)', () => {
      seedDespesa({ empenho: '00005-000', dadosExtras: JSON.stringify({ cargo: 'SECRETARIA' }) });
      backfillColunasDerivadas();
      const antes = mockConn.prepare("SELECT credor_cargo, co_tce, credor_chave FROM transparencia_despesas WHERE empenho='00005-000'").get();
      backfillColunasDerivadas();
      const depois = mockConn.prepare("SELECT credor_cargo, co_tce, credor_chave FROM transparencia_despesas WHERE empenho='00005-000'").get();
      expect(depois).toEqual(antes);
    });
  });

  describe('ensureDespesasMigracoes', () => {
    it('não lança quando o schema já tem as colunas (caminho dos testes/bancos novos)', () => {
      expect(() => ensureDespesasMigracoes()).not.toThrow();
    });
  });
});
