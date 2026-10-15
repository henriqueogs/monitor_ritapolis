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

const { listCredores, getCredorProfile, upsertCredorEnriquecimento, getCoberturaCredores } = require('./credores-repo');
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
  tipo = 'EO - Empenho Ordinário',
  dataPagamento = null,
}) {
  seq += 1;
  mockConn
    .prepare(
      `INSERT INTO transparencia_despesas
         (exercicio_orcamento, empenho, tipo, data_empenho, credor_nome, credor_cnpj,
          credor_cargo, credor_chave, valor, funcao, categoria_economica, historico, hash_despesa,
          data_pagamento)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      exercicio,
      `${seq}`.padStart(5, '0') + '-000',
      tipo,
      `${exercicio}-06-01`,
      nome,
      cnpj,
      cargo,
      buildCredorChave({ cnpj, nome }),
      valor,
      funcao,
      categoriaEconomica,
      historico,
      `hash-${seq}`,
      dataPagamento
    );
}

const TIPO_EE = 'EE - Empenho Estimativo';
const TIPO_EG = 'EG - Empenho Global';
const TIPO_OP = 'OP - Ordem de Pagamento';

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

describe('credores-repo — tipos de empenho (fiscal-valores V2/V3/V7)', () => {
  const CNPJ = '12345678000190';

  beforeEach(() => {
    mockConn.exec('DELETE FROM credores_enriquecimentos; DELETE FROM transparencia_despesas_classificacoes; DELETE FROM transparencia_despesas; DELETE FROM licitacoes_detalhes; DELETE FROM fornecedores_perfil; DELETE FROM documentos;');
    seq = 0;
  });

  function seedMisto() {
    seedDespesa({ nome: 'EMPRESA X LTDA', cnpj: CNPJ, valor: 1000, exercicio: 2025, dataPagamento: '2025-07-01' });
    seedDespesa({ nome: 'EMPRESA X LTDA', cnpj: CNPJ, valor: 500, exercicio: 2026 });
    seedDespesa({ nome: 'EMPRESA X LTDA', cnpj: CNPJ, valor: 4000, exercicio: 2026, tipo: TIPO_EE });
    seedDespesa({ nome: 'EMPRESA X LTDA', cnpj: CNPJ, valor: 2000, exercicio: 2025, tipo: TIPO_EG });
    seedDespesa({ nome: 'EMPRESA X LTDA', cnpj: CNPJ, valor: 300, exercicio: 2026, tipo: TIPO_OP });
  }

  it('perfil: valor_total é só ordinário; estimativo/global em campo próprio; OP fora', () => {
    seedMisto();

    const p = getCredorProfile(CNPJ);

    expect(p.resumo.valor_total).toBe(1500);
    expect(p.resumo.valor_estimado_global).toBe(6000);
    expect(p.resumo.n_empenhos).toBe(2);
  });

  it('perfil: "Pago" não é mais o valor empenhado — expõe total_empenhado', () => {
    seedMisto();

    const p = getCredorProfile(CNPJ);

    expect(p.resumo).not.toHaveProperty('total_pago');
    expect(p.resumo.total_empenhado).toBe(p.resumo.valor_total);
  });

  it('invariante: Σ por_ano == resumo (ordinário e estimativo/global)', () => {
    seedMisto();

    const p = getCredorProfile(CNPJ);

    const somaOrd = p.por_ano.reduce((a, r) => a + r.valor_total, 0);
    const somaEstGlob = p.por_ano.reduce((a, r) => a + r.valor_estimado_global, 0);
    expect(somaOrd).toBe(p.resumo.valor_total);
    expect(somaEstGlob).toBe(p.resumo.valor_estimado_global);
  });

  it('invariante: Σ finalidades == valor_total e Σ por_funcao == valor_total', () => {
    seedMisto();
    backfillClassificacoesDespesas({ force: true });

    const p = getCredorProfile(CNPJ);

    expect(p.finalidades.reduce((a, f) => a + f.valor_total, 0)).toBe(p.resumo.valor_total);
    expect(p.por_funcao.reduce((a, f) => a + f.valor_total, 0)).toBe(p.resumo.valor_total);
  });

  it('lista: ordena e totaliza só ordinário, com estimativo/global separado', () => {
    seedMisto();
    seedDespesa({ nome: 'OUTRA LTDA', cnpj: '11111111000111', valor: 1700, exercicio: 2026 });

    const r = listCredores({});

    expect(r.dados[0].credor_chave).toBe('11111111000111');
    const x = r.dados.find((c) => c.credor_chave === CNPJ);
    expect(x.valor_total).toBe(1500);
    expect(x.valor_estimado_global).toBe(6000);
    expect(x.n_empenhos).toBe(2);
  });

  it('lista: credor só com estimativo/global aparece com valor_total 0', () => {
    seedDespesa({ nome: 'SO ESTIMADO LTDA', cnpj: '22222222000122', valor: 900, tipo: TIPO_EE });

    const r = listCredores({});

    expect(r.dados).toHaveLength(1);
    expect(r.dados[0]).toMatchObject({ valor_total: 0, valor_estimado_global: 900 });
  });

  it('lista com mandato: dois mandatos não se misturam', () => {
    seedDespesa({ nome: 'EMPRESA X LTDA', cnpj: CNPJ, valor: 1000, exercicio: 2000 });
    seedDespesa({ nome: 'EMPRESA X LTDA', cnpj: CNPJ, valor: 1000, exercicio: 2025 });

    const r = listCredores({ exercicios: [2025, 2026, 2027, 2028] });

    expect(r.dados[0].valor_total).toBe(1000);
  });

  it('invariante de contagem: n_empenhos conta só o universo do valor (EO)', () => {
    seedMisto();

    const p = getCredorProfile(CNPJ);
    const l = listCredores({}).dados.find((c) => c.credor_chave === CNPJ);

    expect(p.resumo.n_empenhos).toBe(2);
    expect(p.resumo.n_empenhos_estimado_global).toBe(2);
    expect(p.por_ano.reduce((a, r) => a + r.n_empenhos, 0)).toBe(p.resumo.n_empenhos);
    expect(l.n_empenhos).toBe(2);
    expect(l.n_empenhos_estimado_global).toBe(2);
  });

  it('invariante: Σ por_funcao == valor_total mesmo com função ausente ("Sem função")', () => {
    seedDespesa({ nome: 'EMPRESA X LTDA', cnpj: CNPJ, valor: 100, funcao: '10 - SAÚDE' });
    seedDespesa({ nome: 'EMPRESA X LTDA', cnpj: CNPJ, valor: 40, funcao: null });

    const p = getCredorProfile(CNPJ);

    expect(p.por_funcao.reduce((a, f) => a + f.valor_total, 0)).toBe(p.resumo.valor_total);
    expect(p.por_funcao.map((f) => f.funcao)).toContain('Sem função informada');
  });

  it('empenhos recentes não listam ordem de pagamento (pagamento ≠ novo gasto)', () => {
    seedMisto();

    const p = getCredorProfile(CNPJ);

    expect(p.empenhos_recentes.some((e) => e.tipo === TIPO_OP)).toBe(false);
    expect(p.empenhos_recentes).toHaveLength(4);
  });

  it('cobertura: primeiro e último exercício com dados de credor', () => {
    seedDespesa({ nome: 'A LTDA', cnpj: CNPJ, exercicio: 2019 });
    seedDespesa({ nome: 'A LTDA', cnpj: CNPJ, exercicio: 2026 });

    expect(getCoberturaCredores()).toEqual({ primeiro: 2019, ultimo: 2026 });
  });
});

describe('credores-repo - perfil consolidado sem "pago" falso (fiscal-valores V2)', () => {
  it('expoe total_valor_empenhado e nao total_valor_pago', () => {
    mockConn.exec('DELETE FROM transparencia_despesas_classificacoes; DELETE FROM transparencia_despesas; DELETE FROM fornecedores_perfil;');
    seq = 0;
    seedDespesa({ nome: 'EMPRESA X LTDA', cnpj: '12345678000190', valor: 100 });
    mockConn
      .prepare("INSERT INTO fornecedores_perfil (cnpj, nome_canonico, total_valor_pago) VALUES ('12.345.678/0001-90', 'EMPRESA X', 100)")
      .run();

    const p = getCredorProfile('12345678000190');

    expect(p.perfil_consolidado).toHaveProperty('total_valor_empenhado', 100);
    expect(p.perfil_consolidado).not.toHaveProperty('total_valor_pago');
  });
});

describe('credores-repo - licitacoes ganhas sem valor final derivado de empenho (fiscal-valores V2)', () => {
  it('valor_final vindo de empenho_agregado nao aparece como homologado', () => {
    mockConn.exec('DELETE FROM licitacoes_detalhes; DELETE FROM transparencia_despesas_classificacoes; DELETE FROM transparencia_despesas; DELETE FROM documentos;');
    seq = 0;
    seedDespesa({ nome: 'EMPRESA X LTDA', cnpj: '12345678000190', valor: 100 });
    mockConn.prepare("INSERT INTO documentos (id, fonte, tipo, numero, ano, titulo, url_origem) VALUES (1, 'site_prefeitura', 'edital', '1/2026', 2026, 'T', 'https://x')").run();
    mockConn.prepare("INSERT INTO documentos (id, fonte, tipo, numero, ano, titulo, url_origem) VALUES (2, 'site_prefeitura', 'edital', '2/2026', 2026, 'T2', 'https://y')").run();
    mockConn.prepare("INSERT INTO licitacoes_detalhes (documento_id, vencedor_cnpj, valor_final, origem_detalhe) VALUES (1, '12345678000190', 900, NULL)").run();
    mockConn.prepare("INSERT INTO licitacoes_detalhes (documento_id, vencedor_cnpj, valor_final, origem_detalhe) VALUES (2, '12345678000190', 5000, 'empenho_agregado')").run();
    mockConn.prepare("INSERT INTO documentos (id, fonte, tipo, numero, ano, titulo, url_origem) VALUES (3, 'site_prefeitura', 'edital', '3/2026', 2026, 'T3', 'https://z')").run();
    mockConn.prepare("INSERT INTO licitacoes_detalhes (documento_id, vencedor_cnpj, valor_final, origem, origem_detalhe) VALUES (3, '12345678000190', 4000, 'portal_transparencia', 'ATA.pdf')").run();

    const p = getCredorProfile('12345678000190');

    const porDoc = Object.fromEntries(p.licitacoes_ganhas.map((l) => [l.documento_id, l.valor_final]));
    expect(porDoc).toEqual({ 1: 900, 2: null, 3: null });
  });
});
