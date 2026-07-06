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

const { listCredores, getCredorProfile } = require('./credores-repo');
const { buildCredorChave } = require('../transparencia/credor-chave');

let seq = 0;
function seedDespesa({ nome, cnpj = null, valor = 100, exercicio = 2026, cargo = null, funcao = '10 - SAÚDE' }) {
  seq += 1;
  mockConn
    .prepare(
      `INSERT INTO transparencia_despesas
         (exercicio_orcamento, empenho, tipo, data_empenho, credor_nome, credor_cnpj,
          credor_cargo, credor_chave, valor, funcao, hash_despesa)
       VALUES (?, ?, 'EO - Empenho Ordinário', ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      exercicio,
      `${seq}`.padStart(5, '0') + '-000',
      `${exercicio}-06-01`,
      nome,
      cnpj,
      cargo,
      buildCredorChave({ cnpj, nome }),
      valor,
      funcao,
      `hash-${seq}`
    );
}

describe('credores-repo', () => {
  beforeEach(() => {
    mockConn.exec('DELETE FROM transparencia_despesas; DELETE FROM licitacoes_detalhes; DELETE FROM fornecedores_perfil; DELETE FROM documentos;');
    seq = 0;
  });

  describe('listCredores', () => {
    it('inclui pessoas físicas (sem CNPJ) com credor_chave', () => {
      seedDespesa({ nome: 'EMPRESA X LTDA', cnpj: '12345678000190', valor: 1000 });
      seedDespesa({ nome: 'ADILSON DE SOUZA MELO', valor: 500, cargo: 'MOTORISTA' });

      const r = listCredores({});

      expect(r.total).toBe(2);
      const pf = r.dados.find((c) => c.credor_chave === 'pf-adilson-de-souza-melo');
      expect(pf).toBeDefined();
      expect(pf.credor_cnpj).toBeNull();
      const pj = r.dados.find((c) => c.credor_chave === '12345678000190');
      expect(pj.credor_cnpj).toBe('12345678000190');
    });

    it('continua excluindo folha de pagamento', () => {
      seedDespesa({ nome: 'FOLHA DE PAGAMENTO -RITAPOLIS PREFEITURA', valor: 9999 });
      seedDespesa({ nome: 'FULANO DA SILVA', valor: 10 });

      const r = listCredores({});
      expect(r.total).toBe(1);
      expect(r.dados[0].credor_nome).toBe('FULANO DA SILVA');
    });

    it('busca por nome encontra pessoa física', () => {
      seedDespesa({ nome: 'MARIA TERESA DE RESENDE' });
      seedDespesa({ nome: 'OUTRA EMPRESA', cnpj: '11111111000111' });

      const r = listCredores({ busca: 'teresa' });
      expect(r.total).toBe(1);
      expect(r.dados[0].credor_chave).toBe('pf-maria-teresa-de-resende');
    });
  });

  describe('getCredorProfile', () => {
    it('perfil PF por chave pf-: tipo pf, cargo, sem licitações', () => {
      seedDespesa({ nome: 'ADILSON DE SOUZA MELO', valor: 45, cargo: 'MOTORISTA' });
      seedDespesa({ nome: 'ADILSON DE SOUZA MELO', valor: 90, cargo: 'MOTORISTA', exercicio: 2025 });

      const p = getCredorProfile('pf-adilson-de-souza-melo');

      expect(p).not.toBeNull();
      expect(p.tipo).toBe('pf');
      expect(p.chave).toBe('pf-adilson-de-souza-melo');
      expect(p.cnpj).toBeNull();
      expect(p.cargo).toBe('MOTORISTA');
      expect(p.resumo.n_empenhos).toBe(2);
      expect(p.resumo.valor_total).toBe(135);
      expect(p.licitacoes_ganhas).toEqual([]);
      expect(p.perfil_consolidado).toBeNull();
    });

    it('perfil PJ por CNPJ continua funcionando (regressão), com tipo/chave', () => {
      seedDespesa({ nome: 'EMPRESA X LTDA', cnpj: '12345678000190', valor: 1000 });

      const p = getCredorProfile('12.345.678/0001-90');

      expect(p.tipo).toBe('pj');
      expect(p.chave).toBe('12345678000190');
      expect(p.cnpj).toBe('12345678000190');
      expect(p.resumo.valor_total).toBe(1000);
    });

    it('chave inválida ou inexistente retorna null', () => {
      expect(getCredorProfile('abc')).toBeNull();
      expect(getCredorProfile('pf-nao-existe')).toBeNull();
      expect(getCredorProfile(null)).toBeNull();
    });
  });
});
