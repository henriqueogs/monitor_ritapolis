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
  getPainelInteligencia,
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

  describe('denominadores da pagina de inteligencia', () => {
    it('invariante: total do exercicio (evolucao) == total_geral + total_sem_cnpj', () => {
      seedDespesa({ cnpj: '11111111111111', nome: 'A LTDA', valor: 70 });
      seedDespesa({ cnpj: null, nome: 'SEM CNPJ', valor: 30 });
      seedDespesa({ cnpj: null, nome: 'OP SEM CNPJ', valor: 999, tipo: TIPO_OP });

      const c = getConcentracaoCredores(2026);
      const e = getEvolucaoFuncoes({ anosMin: 2026, anosMax: 2026 });

      expect(c).toMatchObject({ total_geral: 70, total_sem_cnpj: 30 });
      expect(e.total_por_ano[0].total).toBe(c.total_geral + c.total_sem_cnpj);
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

    it('limiar de dispensa muda na fronteira 2023/2024 (3 x 10.000 na semana)', () => {
      for (const exercicio of [2023, 2024]) {
        for (const d of ['02', '03', '04']) {
          seedDespesa({ exercicio, cnpj: '80000000000000', nome: 'LIMIAR LTDA', valor: 10000, data: `${exercicio}-03-${d}` });
        }
      }

      expect(getEmpenhoAtipicos(2023).total_fracionamento).toBe(1); // 30.000 > 17.600
      expect(getEmpenhoAtipicos(2024).total_fracionamento).toBe(0); // 30.000 < 57.900
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

describe('inteligencia-repo - periodo dinamico (fiscal-datas D1/D7/D9)', () => {
  beforeEach(() => {
    mockConn.exec('DELETE FROM transparencia_despesas; DELETE FROM documentos;');
    seq = 0;
  });

  function semear(exercicio, n = 101) {
    for (let i = 0; i < n; i += 1) {
      seedDespesa({ exercicio, data: `${exercicio}-03-10`, valor: 10, cnpj: String(10000000000000 + i), nome: `F${i}` });
    }
  }

  it('evolucao sem argumentos usa o ultimo ano COM DADOS (nao 2026 fixo) e informa os anos comparados', () => {
    semear(2025);
    semear(2027);

    const e = getEvolucaoFuncoes({ anoAtual: 2027 });

    expect(e.anos_range.max).toBe(2027);
    expect(e).toMatchObject({ ano_ref: 2026, ano_anterior: 2025 });
  });

  it('evolucao com janela fechada compara o proprio ultimo ano', () => {
    semear(2024);
    semear(2025);

    const e = getEvolucaoFuncoes({ anoAtual: 2026 });

    expect(e).toMatchObject({ ano_ref: 2025, ano_anterior: 2024 });
    expect(e.por_funcao[0].crescimento_yoy).toBe(0);
  });

  it('painel sem nenhum ano com dados nao inventa 2025', () => {
    const p = getPainelInteligencia();

    expect(p.exercicio).toBeNull();
    expect(p.sem_dados).toBe(true);
    expect(p.anos_disponiveis).toEqual([]);
  });

  it('painel escolhe o ultimo ano com dados significativos', () => {
    semear(2024);
    semear(2026);

    const p = getPainelInteligencia();

    expect(p.exercicio).toBe(2026);
    expect(p.sem_dados).toBeFalsy();
  });

  it('anomalias expoem fonte do limiar e avisam quando ele e extrapolado', () => {
    expect(getEmpenhoAtipicos(2024)).toMatchObject({ limiar_dispensa: 57900, limiar_dispensa_extrapolado: false });
    expect(getEmpenhoAtipicos(2027)).toMatchObject({ limiar_dispensa: 57900, limiar_dispensa_extrapolado: true });
    expect(getEmpenhoAtipicos(2027).limiar_dispensa_fonte).toEqual(expect.any(String));
  });
});
