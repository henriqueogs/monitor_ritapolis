'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const mockConn = new DatabaseSync(':memory:');
mockConn.exec(fs.readFileSync(path.resolve(__dirname, '../db/schema.sql'), 'utf8'));
jest.mock('../db/index', () => ({ db: mockConn }));
jest.mock('../db/connection', () => ({ db: mockConn }));

const { gerarDescobertasPreco } = require('./preco-itens-runner');

let seq = 0;
function seedItem(valorUnitario) {
  seq += 1;
  const empenho = `${String(seq).padStart(5, '0')}-000`;
  mockConn
    .prepare(
      `INSERT INTO transparencia_despesas
         (exercicio_orcamento, empenho, tipo, data_empenho, credor_cnpj, credor_nome, valor,
          historico, hash_despesa)
       VALUES (2026, ?, 'EO', '2026-03-10', '11111111000111', 'AUTO PECAS LTDA', 100, 'peças', ?)`
    )
    .run(empenho, `h-${seq}`);
  const { id } = mockConn.prepare('SELECT MAX(id) id FROM transparencia_despesas').get();
  mockConn
    .prepare(
      `INSERT INTO transparencia_despesas_itens
         (despesa_id, nota_fiscal, item, produto_codigo, produto, unidade, quantidade, valor_unitario, valor_total)
       VALUES (?, '1', 1, '00000022294', 'FILTRO DE OLEO', 'PÇ', 1, ?, ?)`
    )
    .run(id, valorUnitario, valorUnitario);
}
const seedGrupo = () => [70, 70.3, 70.3, 69.9, 71, 650].forEach(seedItem);

describe('preco-itens-runner', () => {
  beforeEach(() => {
    mockConn.exec(
      'DELETE FROM alertas_evidencias; DELETE FROM alertas_documentos; DELETE FROM alertas; DELETE FROM transparencia_despesas_itens; DELETE FROM transparencia_despesas;'
    );
    seq = 0;
  });

  it('grava a descoberta em revisão com evidências do portal e é idempotente', () => {
    seedGrupo();
    const r = gerarDescobertasPreco({ anoMin: 2025 });
    expect(r).toMatchObject({ candidatos: 1, gravados: 1 });
    gerarDescobertasPreco({ anoMin: 2025 });
    const alertas = mockConn.prepare("SELECT * FROM alertas WHERE tipo = 'preco_item'").all();
    expect(alertas).toHaveLength(1);
    expect(alertas[0].estado_editorial).toBe('revisao');
    expect(alertas[0].severidade).toBe('info');
    const ev = mockConn
      .prepare('SELECT metadados_json FROM alertas_evidencias WHERE alerta_id = ?')
      .all(alertas[0].id);
    expect(ev.length).toBeGreaterThanOrEqual(2);
    expect(JSON.parse(ev[0].metadados_json).portal_url).toContain('Detalhamento_Despesa.php');
  });

  it('dry-run não grava', () => {
    seedGrupo();
    const r = gerarDescobertasPreco({ anoMin: 2025, dryRun: true });
    expect(r.candidatos).toBe(1);
    expect(mockConn.prepare('SELECT COUNT(*) n FROM alertas').get().n).toBe(0);
  });

  it('respeita o ano mínimo', () => {
    seedGrupo();
    expect(gerarDescobertasPreco({ anoMin: 2027 }).candidatos).toBe(0);
  });
});
