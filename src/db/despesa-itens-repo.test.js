'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const mockConn = new DatabaseSync(':memory:');
mockConn.exec(fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf8'));
jest.mock('./connection', () => ({ db: mockConn }));

const repo = require('./despesa-itens-repo');

let seq = 0;
function seedDespesa({ modalidade = 'Adesão a Registro de Preços', tipo = 'EO', ano = 2026 } = {}) {
  seq += 1;
  const empenho = `${String(seq).padStart(5, '0')}-000`;
  mockConn
    .prepare(
      `INSERT INTO transparencia_despesas
         (exercicio_orcamento, empenho, tipo, data_empenho, credor_cnpj, valor, modalidade, hash_despesa)
       VALUES (?, ?, ?, ?, '18855014000152', 10, ?, ?)`
    )
    .run(ano, empenho, tipo, `${ano}-03-10`, modalidade, `h-${seq}`);
  return empenho;
}
const itens = [
  {
    item: 1,
    nota_fiscal: '737',
    produto_codigo: '1',
    produto: 'ENGRENAGEM',
    unidade: 'PÇ',
    quantidade: 1,
    valor_unitario: 3187.26,
    valor_total: 3187.26,
  },
  {
    item: 2,
    nota_fiscal: '737',
    produto_codigo: '2',
    produto: 'RETENTOR',
    unidade: 'PÇ',
    quantidade: 2,
    valor_unitario: 1082.86,
    valor_total: 2165.71,
  },
];
const total = () => mockConn.prepare('SELECT COUNT(*) n FROM transparencia_despesas_itens').get().n;

describe('despesa-itens-repo', () => {
  beforeEach(() => {
    mockConn.exec('DELETE FROM transparencia_despesas_itens; DELETE FROM transparencia_despesas;');
    seq = 0;
  });

  it('grava os itens do empenho e substitui (não duplica) numa segunda gravação', () => {
    const e = seedDespesa();
    expect(repo.substituirItens(2026, e, itens)).toBe(2);
    expect(repo.substituirItens(2026, e, itens.slice(0, 1))).toBe(1);
    expect(total()).toBe(1);
    const linha = mockConn.prepare('SELECT * FROM transparencia_despesas_itens').get();
    expect(linha).toMatchObject({ produto: 'ENGRENAGEM', unidade: 'PÇ', valor_unitario: 3187.26 });
  });

  it('empenho inexistente não grava nada', () => {
    expect(repo.substituirItens(2026, '99999-000', itens)).toBe(0);
    expect(total()).toBe(0);
  });

  it('lista só empenhos originais com modalidade e ainda sem itens', () => {
    const comItens = seedDespesa();
    const semItens = seedDespesa();
    seedDespesa({ modalidade: null });
    seedDespesa({ tipo: 'EE' });
    repo.substituirItens(2026, comItens, itens);
    expect(repo.listarSemItens({ anoMin: 2025 }).map(r => r.empenho)).toEqual([semItens]);
    expect(repo.listarSemItens({ anoMin: 2027 })).toEqual([]);
  });

  it('apagar o empenho apaga os itens (cascata)', () => {
    const e = seedDespesa();
    repo.substituirItens(2026, e, itens);
    mockConn.exec('PRAGMA foreign_keys = ON');
    mockConn.prepare('DELETE FROM transparencia_despesas WHERE empenho = ?').run(e);
    expect(total()).toBe(0);
  });
});
