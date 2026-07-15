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

const { listCredores, getCredorProfile, upsertCredorEnriquecimento } = require('./credores-repo');
const { backfillClassificacoesDespesas } = require('./transparencia-classificacao-repo');
const { buildCredorChave } = require('../transparencia/credor-chave');

let seq = 0;
function seedDespesa({
  nome,
  cnpj = null,
  valor = 100,
  exercicio = 2026,
  cargo = null,
  funcao = '10 - SAÚDE',
  categoriaEconomica = '3.3.90.39.00 - OUTROS SERVICOS PJ',
  historico = null,
}) {
  seq += 1;
  mockConn
    .prepare(
      `INSERT INTO transparencia_despesas
         (exercicio_orcamento, empenho, tipo, data_empenho, credor_nome, credor_cnpj,
          credor_cargo, credor_chave, valor, funcao, categoria_economica, historico, hash_despesa)
       VALUES (?, ?, 'EO - Empenho Ordinário', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      categoriaEconomica,
      historico,
      `hash-${seq}`
    );
}

describe('credores-repo', () => {
  beforeEach(() => {
    mockConn.exec('DELETE FROM credores_enriquecimentos; DELETE FROM transparencia_despesas_classificacoes; DELETE FROM transparencia_despesas; DELETE FROM licitacoes_detalhes; DELETE FROM fornecedores_perfil; DELETE FROM documentos;');
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

    it('inclui finalidade predominante por credor', () => {
      seedDespesa({
        nome: 'EMPRESA X LTDA',
        cnpj: '12345678000190',
        valor: 1000,
        categoriaEconomica: '3.3.90.39.00 - OUTROS SERVICOS DE TERCEIROS - PESSOA JURIDICA',
      });
      seedDespesa({
        nome: 'ADILSON DE SOUZA MELO',
        valor: 500,
        cargo: 'MOTORISTA',
        categoriaEconomica: '3.3.90.14.00 - DIARIAS',
        historico: 'DIARIA PARA MOTORISTA',
      });
      backfillClassificacoesDespesas({ force: true });

      const r = listCredores({});
      const pj = r.dados.find((c) => c.credor_chave === '12345678000190');
      const pf = r.dados.find((c) => c.credor_chave === 'pf-adilson-de-souza-melo');

      expect(pj.finalidades[0]).toMatchObject({ classe: 'servico_pj_sem_licitacao', rotulo: 'Serviço PJ' });
      expect(pf.finalidades[0]).toMatchObject({ classe: 'diaria_servidor', rotulo: 'Diária' });
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

    it('perfil PJ expõe cache auditavel de Receita/QSA quando importado', () => {
      seedDespesa({ nome: 'EMPRESA X LTDA', cnpj: '12345678000190', valor: 1000 });
      upsertCredorEnriquecimento({
        credor_chave: '12345678000190',
        tipo_credor: 'pj',
        fonte: 'receita_cnpj',
        identificador: '12345678000190',
        confianca: 0.98,
        dados: {
          natureza_juridica: '206-2 - Sociedade Empresaria Limitada',
          situacao_cadastral: 'ATIVA',
          qsa: [{ nome: 'MARIA SOCIA' }],
        },
      });

      const p = getCredorProfile('12.345.678/0001-90');

      expect(p.enriquecimento.receita).toMatchObject({
        natureza_juridica: '206-2 - Sociedade Empresaria Limitada',
        situacao_cadastral: 'ATIVA',
        confianca: 0.98,
      });
      expect(p.enriquecimento.receita.qsa[0].nome).toBe('MARIA SOCIA');
      expect(p.enriquecimento.fontes_previstas.map((fonte) => fonte.id)).toEqual(
        expect.arrayContaining(['receita_cnpj', 'consulta_cnpj', 'tse_candidatos', 'tse_prestacao_contas'])
      );
    });

    it('perfil PF mantém cargo do portal e TSE apenas como contexto por nome', () => {
      seedDespesa({ nome: 'ADILSON DE SOUZA MELO', valor: 45, cargo: 'MOTORISTA' });
      upsertCredorEnriquecimento({
        credor_chave: 'pf-adilson-de-souza-melo',
        tipo_credor: 'pf',
        fonte: 'tse_candidatos',
        identificador: 'ADILSON DE SOUZA MELO|2024',
        confianca: 0.35,
        dados: {
          cargo_disputado: 'VEREADOR',
          partido: 'XYZ',
          observacao: 'match apenas por nome',
        },
      });

      const p = getCredorProfile('pf-adilson-de-souza-melo');

      expect(p.tipo).toBe('pf');
      expect(p.cargo).toBe('MOTORISTA');
      expect(p.enriquecimento.receita).toBeNull();
      expect(p.enriquecimento.tse).toHaveLength(1);
      expect(p.enriquecimento.tse[0].confianca).toBe(0.35);
      expect(p.enriquecimento.limites).toContain('Pessoa fisica sem CPF publico');
      expect(p.enriquecimento.limites).toContain('MOTORISTA');
    });

    it('chave inválida ou inexistente retorna null', () => {
      expect(getCredorProfile('abc')).toBeNull();
      expect(getCredorProfile('pf-nao-existe')).toBeNull();
      expect(getCredorProfile(null)).toBeNull();
    });
  });
});

describe('credores-repo finalidade no perfil', () => {
  beforeEach(() => {
    mockConn.exec('DELETE FROM credores_enriquecimentos; DELETE FROM transparencia_despesas_classificacoes; DELETE FROM transparencia_despesas; DELETE FROM licitacoes_detalhes; DELETE FROM fornecedores_perfil; DELETE FROM documentos;');
    seq = 0;
  });

  it('perfil expoe distribuicao por finalidade do credor', () => {
    seedDespesa({
      nome: 'EMPRESA X LTDA',
      cnpj: '12345678000190',
      valor: 1000,
      categoriaEconomica: '3.3.90.39.00 - OUTROS SERVICOS DE TERCEIROS - PESSOA JURIDICA',
    });
    seedDespesa({
      nome: 'EMPRESA X LTDA',
      cnpj: '12345678000190',
      valor: 500,
      categoriaEconomica: '4.4.90.52.00 - EQUIPAMENTOS',
    });
    backfillClassificacoesDespesas({ force: true });

    const p = getCredorProfile('12.345.678/0001-90');

    expect(p.finalidades).toHaveLength(2);
    expect(p.finalidades[0]).toMatchObject({
      classe: 'servico_pj_sem_licitacao',
      n: 1,
      valor_total: 1000,
    });
    expect(p.finalidades[1]).toMatchObject({ classe: 'investimento', valor_total: 500 });
  });
});
