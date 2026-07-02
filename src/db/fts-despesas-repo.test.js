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

const { ensureDespesasFtsIndex } = require('./fts-despesas-repo');
const { getDespesas } = require('./transparencia-repo');

let seq = 0;
function seedDespesa({ historico, credorNome = 'FORNECEDOR', valor = 100, exercicio = 2026 } = {}) {
  seq += 1;
  mockConn
    .prepare(
      `INSERT INTO transparencia_despesas
         (exercicio_orcamento, empenho, tipo, data_empenho, credor_nome, credor_cnpj,
          valor, historico, hash_despesa)
       VALUES (?, ?, 'EO', '2026-01-01', ?, '11111111111111', ?, ?, ?)`
    )
    .run(exercicio, `${String(seq).padStart(5, '0')}-000`, credorNome, valor, historico, `h-${seq}`);
}

describe('despesas_fts + getDespesas({ q })', () => {
  beforeEach(() => {
    mockConn.exec('DELETE FROM transparencia_despesas;');
    seq = 0;
  });

  it('ensureDespesasFtsIndex reconstrói índice quando vazio', () => {
    seedDespesa({ historico: 'PAGAMENTO DE DIÁRIA AO SERVIDOR' });
    const r = ensureDespesasFtsIndex();
    expect(r).toHaveProperty('rebuiltRows');
  });

  it('busca com e sem acento encontra o mesmo empenho (trigger sync)', () => {
    seedDespesa({ historico: 'PAGAMENTO DE DIÁRIA AO SERVIDOR PARA VIAGEM' });
    seedDespesa({ historico: 'COMPRA DE COMBUSTÍVEL PARA FROTA' });

    const comAcento = getDespesas({ q: 'diária' });
    const semAcento = getDespesas({ q: 'diaria' });

    expect(comAcento.total).toBe(1);
    expect(semAcento.total).toBe(1);
    expect(semAcento.dados[0].historico).toContain('DIÁRIA');
  });

  it('busca por nome do credor', () => {
    seedDespesa({ historico: 'SERVIÇO X', credorNome: 'ASSOCIAÇÃO APAE RITAPOLIS' });
    seedDespesa({ historico: 'SERVIÇO Y', credorNome: 'OUTRA EMPRESA' });

    const r = getDespesas({ q: 'apae' });
    expect(r.total).toBe(1);
    expect(r.dados[0].credor_nome).toContain('APAE');
  });

  it('q compõe com filtro de exercício', () => {
    seedDespesa({ historico: 'DIÁRIA VIAGEM A', exercicio: 2026 });
    seedDespesa({ historico: 'DIÁRIA VIAGEM B', exercicio: 2025 });

    const r = getDespesas({ q: 'diaria', exercicio: 2025 });
    expect(r.total).toBe(1);
    expect(r.dados[0].exercicio_orcamento).toBe(2025);
  });

  it('query com sintaxe FTS inválida cai no fallback LIKE sem quebrar', () => {
    seedDespesa({ historico: 'PAGAMENTO NORMAL' });
    const r = getDespesas({ q: '"aspas quebradas' });
    expect(r).toHaveProperty('total');
    expect(Array.isArray(r.dados)).toBe(true);
  });

  it('sem q mantém comportamento atual', () => {
    seedDespesa({ historico: 'QUALQUER' });
    const r = getDespesas({});
    expect(r.total).toBe(1);
  });
});
