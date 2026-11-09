'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const mockConn = new DatabaseSync(':memory:');
mockConn.exec(fs.readFileSync(path.resolve(__dirname, '../db/schema.sql'), 'utf8'));
jest.mock('../db/index', () => ({ db: mockConn }));
jest.mock('../db/connection', () => ({ db: mockConn }));

const { gerarDescobertasComprasRepetidas } = require('./compras-repetidas-runner');

const CNPJ = '11111111000111';
let seq = 0;
function seedEmpenho({
  dia,
  cnpj = CNPJ,
  valor = 20000,
  tipo = 'EO',
  historico = 'Aquisição de pneus para a frota',
  modalidade = null,
}) {
  seq += 1;
  mockConn
    .prepare(
      `INSERT INTO transparencia_despesas
         (exercicio_orcamento, empenho, tipo, data_empenho, credor_cnpj, credor_nome,
          valor, historico, modalidade, hash_despesa)
       VALUES (2025, ?, ?, ?, ?, 'AUTO PECAS LTDA', ?, ?, ?, ?)`
    )
    .run(
      `${String(seq).padStart(5, '0')}-000`,
      tipo,
      `2025-03-${String(dia).padStart(2, '0')}`,
      cnpj,
      valor,
      historico,
      modalidade,
      `h-${seq}`
    );
}
const seedQuatro = () => [1, 8, 15, 22].forEach(dia => seedEmpenho({ dia }));

function seedInstrumento(cnpj) {
  mockConn
    .prepare(
      `INSERT INTO documentos (fonte, tipo, titulo, url_origem, hash_conteudo)
       VALUES ('prefeitura', 'licitacao', 'Processo 1/2025', 'https://x.gov.br/p1', 'hc-1')`
    )
    .run();
  const { id } = mockConn.prepare('SELECT MAX(id) id FROM documentos').get();
  mockConn
    .prepare('INSERT INTO licitacoes_detalhes (documento_id, vencedor_cnpj) VALUES (?, ?)')
    .run(id, cnpj);
}

describe('compras-repetidas-runner', () => {
  beforeEach(() => {
    mockConn.exec(
      'DELETE FROM alertas_evidencias; DELETE FROM alertas_documentos; DELETE FROM alertas; ' +
        'DELETE FROM licitacoes_detalhes; DELETE FROM documentos; DELETE FROM transparencia_despesas;'
    );
    seq = 0;
  });

  it('grava a descoberta em revisão com evidências do portal', () => {
    seedQuatro();
    const r = gerarDescobertasComprasRepetidas();

    expect(r.candidatos).toBe(1);
    expect(r.gravados).toBe(1);
    const alerta = mockConn.prepare("SELECT * FROM alertas WHERE tipo = 'compras_repetidas'").get();
    expect(alerta.estado_editorial).toBe('revisao');
    expect(alerta.qualidade_versao).toBe('vertente-compras-repetidas-v1');
    const evidencias = mockConn
      .prepare('SELECT metadados_json FROM alertas_evidencias WHERE alerta_id = ?')
      .all(alerta.id);
    expect(evidencias).toHaveLength(4);
    expect(JSON.parse(evidencias[0].metadados_json).portal_url).toContain(
      'Detalhamento_Despesa.php'
    );
  });

  it('é idempotente — rodar 2× não duplica', () => {
    seedQuatro();
    gerarDescobertasComprasRepetidas();
    gerarDescobertasComprasRepetidas();
    const n = mockConn
      .prepare("SELECT COUNT(*) n FROM alertas WHERE tipo = 'compras_repetidas'")
      .get().n;
    expect(n).toBe(1);
  });

  it('credor com licitação/contrato no acervo não gera descoberta', () => {
    seedQuatro();
    seedInstrumento(CNPJ);
    const r = gerarDescobertasComprasRepetidas();
    expect(r.candidatos).toBe(0);
  });

  describe('processo citado nos históricos', () => {
    const seedCitando = () =>
      [1, 8, 15, 22].forEach(dia =>
        seedEmpenho({ dia, historico: 'Aquisição de pneus CONFORME PROCESSO LICITATÓRIO N°52/25' })
      );
    const seedProcesso = titulo =>
      mockConn
        .prepare(
          `INSERT INTO documentos (fonte, tipo, titulo, url_origem, hash_conteudo)
           VALUES ('prefeitura', 'licitacao', ?, 'https://x.gov.br/p', 'hc-proc')`
        )
        .run(titulo);

    it('processo presente no acervo: empenhos cobertos, nenhuma descoberta', () => {
      seedCitando();
      seedProcesso('Processo 0052/2025 - Adesão 0012/2025 - Peças');
      expect(gerarDescobertasComprasRepetidas().candidatos).toBe(0);
    });

    it('processo ausente do acervo: descoberta com severidade info e o processo no texto', () => {
      seedCitando();
      const r = gerarDescobertasComprasRepetidas();
      expect(r.candidatos).toBe(1);
      const a = mockConn.prepare("SELECT * FROM alertas WHERE tipo = 'compras_repetidas'").get();
      expect(a.severidade).toBe('info');
      expect(a.narrativa).toContain('Processo 52/2025 (4 de 4 empenhos)');
    });
  });

  it('empenhos com modalidade de procedimento (adesão a registro de preços) saem da análise', () => {
    [1, 8, 15, 22].forEach(dia =>
      seedEmpenho({ dia, modalidade: 'Adesão a Registro de Preços - 00122025' })
    );
    expect(gerarDescobertasComprasRepetidas().candidatos).toBe(0);
  });

  it('dry-run não grava', () => {
    seedQuatro();
    const r = gerarDescobertasComprasRepetidas({ dryRun: true });
    expect(r.candidatos).toBe(1);
    expect(mockConn.prepare('SELECT COUNT(*) n FROM alertas').get().n).toBe(0);
  });
});
