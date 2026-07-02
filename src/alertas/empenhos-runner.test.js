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
// transparencia-agregados-repo usa ./index; alertas-repo usa ./connection —
// os dois precisam apontar pro banco em memória.
jest.mock('../db/index', () => ({ db: mockConn }));
jest.mock('../db/connection', () => ({ db: mockConn }));

const { gerarDescobertasEmpenhos } = require('./empenhos-runner');

let seq = 0;
function seedDespesa({ credorCnpj, credorNome, valor, exercicio = 2026, categoria = '3.3.90.14.00 - DIÁRIAS - CIVIL' }) {
  seq += 1;
  mockConn
    .prepare(
      `INSERT INTO transparencia_despesas
         (exercicio_orcamento, empenho, tipo, data_empenho, credor_cnpj, credor_nome,
          valor, categoria_economica, historico, hash_despesa)
       VALUES (?, ?, 'EO', ?, ?, ?, ?, ?, 'DIÁRIA DE VIAGEM', ?)`
    )
    .run(
      exercicio,
      `${String(seq).padStart(5, '0')}-000`,
      `${exercicio}-03-01`,
      credorCnpj,
      credorNome,
      valor,
      categoria,
      `h-${seq}`
    );
}

describe('empenhos-runner', () => {
  beforeEach(() => {
    mockConn.exec(
      'DELETE FROM alertas_evidencias; DELETE FROM alertas_documentos; DELETE FROM alertas; DELETE FROM transparencia_despesas; DELETE FROM alertas_config;'
    );
    seq = 0;
    // Thresholds baixos pro cenário de teste
    mockConn
      .prepare(`INSERT INTO alertas_config (chave, valor_json) VALUES (?, ?), (?, ?), (?, ?), (?, ?)`)
      .run(
        'gasto_atipico.share_minimo', '0.4',
        'gasto_atipico.multiplicador_salto', '3',
        'gasto_atipico.valor_minimo', '1000',
        'gasto_atipico.min_credores_categoria', '4'
      );
  });

  function seedCenarioCredorAtipico() {
    seedDespesa({ credorCnpj: '11111111111111', credorNome: 'A', valor: 500 });
    seedDespesa({ credorCnpj: '22222222222222', credorNome: 'B', valor: 600 });
    seedDespesa({ credorCnpj: '33333333333333', credorNome: 'C', valor: 700 });
    seedDespesa({ credorCnpj: '44444444444444', credorNome: 'D', valor: 800 });
    seedDespesa({ credorCnpj: '55555555555555', credorNome: 'FULANO VIAJANTE', valor: 40000 });
  }

  it('gera descoberta de credor atípico com evidências rastreáveis', () => {
    seedCenarioCredorAtipico();
    const resultado = gerarDescobertasEmpenhos();

    expect(resultado.sinais).toBeGreaterThanOrEqual(1);
    const alerta = mockConn
      .prepare(`SELECT * FROM alertas WHERE tipo = 'gasto_atipico' AND subcategoria = 'gasto_atipico_credor'`)
      .get();
    expect(alerta).toBeDefined();
    expect(alerta.titulo).toContain('Diárias');
    expect(alerta.valor_periodo_label).toContain('2026');
    expect(alerta.severidade).toBe('atencao');

    const evidencias = mockConn
      .prepare('SELECT * FROM alertas_evidencias WHERE alerta_id = ?')
      .all(alerta.id);
    expect(evidencias.length).toBeGreaterThanOrEqual(1);
    expect(evidencias[0].documento_id).toBeNull();
    const metadados = JSON.parse(evidencias[0].metadados_json);
    expect(metadados.empenho_id).toBeDefined();
    expect(metadados.portal_url).toContain('Detalhamento_Despesa.php');
  });

  it('é idempotente — rodar 2× não duplica', () => {
    seedCenarioCredorAtipico();
    gerarDescobertasEmpenhos();
    gerarDescobertasEmpenhos();
    const n = mockConn.prepare(`SELECT COUNT(*) n FROM alertas WHERE tipo = 'gasto_atipico'`).get().n;
    expect(n).toBe(1);
  });

  it('dry-run não grava nada', () => {
    seedCenarioCredorAtipico();
    const resultado = gerarDescobertasEmpenhos({ dryRun: true });
    expect(resultado.sinais).toBeGreaterThanOrEqual(1);
    const n = mockConn.prepare(`SELECT COUNT(*) n FROM alertas`).get().n;
    expect(n).toBe(0);
  });

  it('sem sinal não cria alerta', () => {
    seedDespesa({ credorCnpj: '11111111111111', credorNome: 'A', valor: 500 });
    const resultado = gerarDescobertasEmpenhos();
    expect(resultado.sinais).toBe(0);
    expect(mockConn.prepare('SELECT COUNT(*) n FROM alertas').get().n).toBe(0);
  });
});
