'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const mockConn = new DatabaseSync(':memory:');
mockConn.exec(fs.readFileSync(path.resolve(__dirname, '../db/schema.sql'), 'utf8'));
jest.mock('../db/index', () => ({ db: mockConn }));
jest.mock('../db/connection', () => ({ db: mockConn }));

const { gerarDescobertasDiarias } = require('./diarias-runner');

let seq = 0;
function seedDiaria({
  ano,
  mesDia,
  valor,
  beneficiario,
  categoria = '3.3.90.14.00 - DIÁRIAS - CIVIL',
}) {
  seq += 1;
  mockConn
    .prepare(
      `INSERT INTO transparencia_despesas
         (exercicio_orcamento, empenho, tipo, data_empenho, credor_nome, credor_chave, valor,
          categoria_economica, historico, hash_despesa)
       VALUES (?, ?, 'EO', ?, 'FULANO DE TAL', ?, ?, ?, 'DIÁRIA DE VIAGEM', ?)`
    )
    .run(
      ano,
      `${String(seq).padStart(5, '0')}-000`,
      `${ano}-${mesDia}`,
      beneficiario,
      valor,
      categoria,
      `h-${seq}`
    );
}
const seedConcentracao = () => {
  ['a', 'b', 'c', 'd', 'e'].forEach(b => {
    seedDiaria({ ano: 2025, mesDia: '03-10', valor: 5000, beneficiario: b });
    seedDiaria({ ano: 2025, mesDia: '06-10', valor: 5000, beneficiario: b });
  });
  for (let i = 0; i < 20; i += 1)
    {seedDiaria({ ano: 2025, mesDia: '04-10', valor: 1000, beneficiario: `x${i}` });}
};

describe('diarias-runner', () => {
  beforeEach(() => {
    mockConn.exec(
      'DELETE FROM alertas_evidencias; DELETE FROM alertas_documentos; DELETE FROM alertas; DELETE FROM transparencia_despesas;'
    );
    seq = 0;
  });

  it('grava a descoberta agregada em revisão, sem nome do beneficiário, e é idempotente', () => {
    seedConcentracao();
    expect(gerarDescobertasDiarias({ anoMin: 2025 })).toMatchObject({ candidatos: 1, gravados: 1 });
    gerarDescobertasDiarias({ anoMin: 2025 });
    const alertas = mockConn.prepare("SELECT * FROM alertas WHERE tipo = 'diarias'").all();
    expect(alertas).toHaveLength(1);
    expect(alertas[0].estado_editorial).toBe('revisao');
    const tudo = JSON.stringify({
      alerta: alertas[0],
      ev: mockConn.prepare('SELECT * FROM alertas_evidencias').all(),
    });
    expect(tudo).not.toMatch(/FULANO|credor_chave/);
    expect(tudo).toContain('Detalhamento_Despesa.php');
  });

  it('dry-run não grava e o ano mínimo é respeitado', () => {
    seedConcentracao();
    expect(gerarDescobertasDiarias({ anoMin: 2025, dryRun: true }).candidatos).toBe(1);
    expect(mockConn.prepare('SELECT COUNT(*) n FROM alertas').get().n).toBe(0);
    expect(gerarDescobertasDiarias({ anoMin: 2026 }).candidatos).toBe(0);
  });
});
