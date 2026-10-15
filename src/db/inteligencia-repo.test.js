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

const {
  getConcentracaoCredores,
  getEvolucaoFuncoes,
  getRankingPorFuncao,
  getEmpenhoAtipicos,
} = require('./inteligencia-repo');

const TIPO_EO = 'EO - Empenho Ordinário';
const TIPO_EE = 'EE - Empenho Estimativo';
const TIPO_EG = 'EG - Empenho Global';
const TIPO_OP = 'OP - Ordem de Pagamento';

let seq = 0;
function seedDespesa({
  exercicio = 2026,
  tipo = TIPO_EO,
  data = '2026-03-02',
  cnpj = '11111111111111',
  nome = 'FORNECEDOR A LTDA',
  valor = 100,
  funcao = '10 - SAÚDE',
} = {}) {
  seq += 1;
  mockConn
    .prepare(
      `INSERT INTO transparencia_despesas
         (exercicio_orcamento, empenho, tipo, data_empenho, credor_cnpj, credor_nome,
          credor_chave, valor, funcao, hash_despesa)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(exercicio, `${String(seq).padStart(5, '0')}-000`, tipo, data, cnpj, nome, cnpj, valor, funcao, `hash-${seq}`);
}

describe('inteligencia-repo — só empenho ordinário (fiscal-valores V2/V3)', () => {
  beforeEach(() => {
    mockConn.exec('DELETE FROM transparencia_despesas; DELETE FROM documentos;');
    seq = 0;
  });

  describe('getConcentracaoCredores', () => {
    it('shares e total ignoram OP e EE/EG (senão o mesmo gasto conta duas vezes)', () => {
      seedDespesa({ cnpj: '11111111111111', nome: 'A LTDA', valor: 100 });
      seedDespesa({ cnpj: '22222222222222', nome: 'B LTDA', valor: 100 });
      seedDespesa({ cnpj: '11111111111111', nome: 'A LTDA', valor: 1000, tipo: TIPO_OP });
      seedDespesa({ cnpj: '22222222222222', nome: 'B LTDA', valor: 5000, tipo: TIPO_EE });

      const c = getConcentracaoCredores(2026);

      expect(c.total_geral).toBe(200);
      expect(c.top_credores.map((x) => x.share_pct)).toEqual([50, 50]);
      expect(c.top_credores[0].n_empenhos).toBe(1);
    });

    it('invariante: Σ valor dos credores == total_geral', () => {
      seedDespesa({ cnpj: '11111111111111', nome: 'A LTDA', valor: 70 });
      seedDespesa({ cnpj: '22222222222222', nome: 'B LTDA', valor: 30 });
      seedDespesa({ cnpj: '22222222222222', nome: 'B LTDA', valor: 9, tipo: TIPO_EG });

      const c = getConcentracaoCredores(2026);

      expect(c.top_credores.reduce((a, x) => a + x.valor_total, 0)).toBe(c.total_geral);
    });
  });

  describe('getEvolucaoFuncoes', () => {
    it('total por ano e por função só somam ordinário; anos não se misturam', () => {
      seedDespesa({ exercicio: 2024, data: '2024-12-31', valor: 10 });
      seedDespesa({ exercicio: 2025, data: '2025-01-02', valor: 20 });
      seedDespesa({ exercicio: 2025, data: '2025-01-03', valor: 999, tipo: TIPO_OP });
      seedDespesa({ exercicio: 2025, data: '2025-01-04', valor: 888, tipo: TIPO_EG });

      const e = getEvolucaoFuncoes({ anosMin: 2024, anosMax: 2025 });

      expect(e.total_por_ano).toEqual([
        expect.objectContaining({ ano: 2024, total: 10 }),
        expect.objectContaining({ ano: 2025, total: 20 }),
      ]);
      const saude = e.por_funcao[0];
      expect(saude.anos[2025].valor_total).toBe(20);
      expect(saude.total_periodo).toBe(30);
    });
  });

  describe('getRankingPorFuncao', () => {
    it('total da função e share dos credores no mesmo universo (ordinário)', () => {
      seedDespesa({ cnpj: '11111111111111', nome: 'A LTDA', valor: 60 });
      seedDespesa({ cnpj: '22222222222222', nome: 'B LTDA', valor: 40 });
      seedDespesa({ cnpj: '11111111111111', nome: 'A LTDA', valor: 5000, tipo: TIPO_OP });

      const r = getRankingPorFuncao(2026);

      const saude = r.funcoes[0];
      expect(saude.total_funcao).toBe(100);
      expect(saude.credores.map((c) => c.share_pct)).toEqual([60, 40]);
    });
  });

  describe('getEmpenhoAtipicos', () => {
    it('OP e EE/EG de valor alto não geram outlier nem distorcem a média da função', () => {
      for (let i = 0; i < 30; i += 1) {
        seedDespesa({ valor: 100 + (i % 5), cnpj: String(30000000000000 + i), nome: `F${i}`, data: '2026-03-10' });
      }
      seedDespesa({ valor: 900000, tipo: TIPO_OP, cnpj: '40000000000000', nome: 'OP GIGANTE' });
      seedDespesa({ valor: 800000, tipo: TIPO_EE, cnpj: '50000000000000', nome: 'EE GIGANTE' });

      const a = getEmpenhoAtipicos(2026);

      expect(a.total_outliers).toBe(0);
    });

    it('fracionamento: 3 ordinários pequenos na semana são flagrados; EE/EG não contam', () => {
      const cnpj = '60000000000000';
      for (const d of ['2026-03-02', '2026-03-03', '2026-03-04']) {
        seedDespesa({ cnpj, nome: 'FRACIONADOR LTDA', valor: 30000, data: d });
      }
      const outro = '70000000000000';
      for (const d of ['2026-03-02', '2026-03-03', '2026-03-04']) {
        seedDespesa({ cnpj: outro, nome: 'SO ESTIMADO LTDA', valor: 30000, data: d, tipo: TIPO_EE });
      }

      const a = getEmpenhoAtipicos(2026);

      expect(a.possivel_fracionamento.map((f) => f.credor_nome)).toEqual(['FRACIONADOR LTDA']);
    });
  });
});
