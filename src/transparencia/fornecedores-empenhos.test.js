'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { agregarEmpenhosPorCredor } = require('./fornecedores-empenhos');

function criarBancoMemoria() {
  const conn = new DatabaseSync(':memory:');
  conn.exec(fs.readFileSync(path.resolve(__dirname, '../db/schema.sql'), 'utf8'));
  return conn;
}

let seq = 0;
function seed(conn, { cnpj = '11111111111111', nome = 'FORNECEDOR A', tipo = 'EO - Empenho Ordinário', valor = 100, exercicio = 2026 } = {}) {
  seq += 1;
  conn
    .prepare(
      `INSERT INTO transparencia_despesas
         (exercicio_orcamento, empenho, tipo, data_empenho, credor_cnpj, credor_nome, credor_chave, valor, hash_despesa)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(exercicio, `${seq}`.padStart(5, '0'), tipo, `${exercicio}-05-05`, cnpj, nome, cnpj, valor, `h-${seq}`);
}

describe('agregarEmpenhosPorCredor (base do ranking de fornecedores)', () => {
  let conn;
  beforeEach(() => {
    conn = criarBancoMemoria();
    seq = 0;
  });

  it('soma só empenho ordinário: OP e EE/EG ficam fora', () => {
    seed(conn, { valor: 100 });
    seed(conn, { valor: 50, exercicio: 2025 });
    seed(conn, { valor: 7000, tipo: 'EE - Empenho Estimativo' });
    seed(conn, { valor: 6000, tipo: 'EG - Empenho Global' });
    seed(conn, { valor: 500, tipo: 'OP - Ordem de Pagamento' });

    const [linha] = agregarEmpenhosPorCredor(conn);

    expect(linha).toMatchObject({ cnpj: '11111111111111', n_empenhos: 2, total_valor: 150 });
    expect(linha.anos.split(',').sort()).toEqual(['2025', '2026']);
  });

  it('credor só com estimativo/global não vira fornecedor com valor', () => {
    seed(conn, { cnpj: '22222222222222', nome: 'SO ESTIMADO', valor: 900, tipo: 'EG - Empenho Global' });

    expect(agregarEmpenhosPorCredor(conn)).toEqual([]);
  });

  it('mantém as exclusões existentes (folha, INSS, FGTS, PASEP, Receita)', () => {
    seed(conn, { cnpj: '33333333333333', nome: 'FOLHA DE PAGAMENTO', valor: 10 });
    seed(conn, { cnpj: '44444444444444', nome: 'INSS-INSTITUTO', valor: 10 });
    seed(conn, { cnpj: '55555555555555', nome: 'FORNECEDOR REAL', valor: 10 });

    expect(agregarEmpenhosPorCredor(conn).map((r) => r.cnpj)).toEqual(['55555555555555']);
  });
});
