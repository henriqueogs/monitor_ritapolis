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

const repo = require('./transparencia-repo');
const { buildCredorChave } = require('../transparencia/credor-chave');

let seq = 0;
function seedDespesa({
  exercicio = 2026,
  empenho,
  tipo = 'EO - Empenho Ordinário',
  data = '2026-06-01',
  credorCnpj = '01991246000135',
  credorNome = 'APAE',
  valor = 100,
  funcao = '10 - SAÚDE',
  unidade = '02.008.001 - FUNDO MUNICIPAL DE SAÚDE',
  programa = '0402 - ATIVIDADE ADMINISTRATIVA',
  categoriaEconomica = '3.3.50.43.00 - SUBVENÇÕES SOCIAIS',
  fonteRecurso = '1.621.000 - SUS ESTADUAL',
  historico = null,
  modalidade = null,
  licitacaoRef = null,
  credorCargo = null,
  documentoId = null,
} = {}) {
  seq += 1;
  mockConn
    .prepare(
      `INSERT INTO transparencia_despesas
         (exercicio_orcamento, empenho, tipo, data_empenho, credor_cnpj, credor_nome,
          credor_chave, valor, funcao, unidade, programa, categoria_economica,
          fonte_recurso, historico, modalidade, licitacao_ref, credor_cargo,
          documento_id, hash_despesa)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      exercicio,
      empenho || `0000${seq}-000`.slice(-9),
      tipo,
      data,
      credorCnpj,
      credorNome,
      buildCredorChave({ cnpj: credorCnpj, nome: credorNome }),
      valor,
      funcao,
      unidade,
      programa,
      categoriaEconomica,
      fonteRecurso,
      historico,
      modalidade,
      licitacaoRef,
      credorCargo,
      documentoId,
      `hash-${exercicio}-${seq}`
    );
}

describe('transparencia-repo', () => {
  beforeEach(() => {
    mockConn.exec(
      'DELETE FROM transparencia_despesas_classificacoes; DELETE FROM transparencia_despesas; DELETE FROM transparencia_receitas; DELETE FROM transparencia_coletas_log; DELETE FROM documentos;'
    );
    seq = 0;
  });

  describe('getDespesas', () => {
    it('retorna campos ricos de classificação orçamentária', () => {
      seedDespesa({});
      const { dados } = repo.getDespesas({});
      expect(dados).toHaveLength(1);
      const d = dados[0];
      expect(d.funcao).toBe('10 - SAÚDE');
      expect(d.unidade).toBe('02.008.001 - FUNDO MUNICIPAL DE SAÚDE');
      expect(d.programa).toBe('0402 - ATIVIDADE ADMINISTRATIVA');
      expect(d.categoria_economica).toBe('3.3.50.43.00 - SUBVENÇÕES SOCIAIS');
      expect(d.fonte_recurso).toBe('1.621.000 - SUS ESTADUAL');
      expect(d.data_liquidacao).toBeDefined();
      expect(d.data_pagamento).toBeDefined();
    });

    it('oculta vinculo legado quando o documento nao corresponde a modalidade', () => {
      mockConn.prepare(`
        INSERT INTO documentos (id, fonte, tipo, numero, ano, titulo, url_origem)
        VALUES (77, 'site_prefeitura', 'edital', '1/2026', 2026, 'Processo 0099/2026 - Pregao 099/2026', 'https://example.invalid')
      `).run();
      seedDespesa({ modalidade: 'Dispensa - 00012026', documentoId: 77 });

      const { dados } = repo.getDespesas({});
      expect(dados[0].documento_id).toBeNull();
      expect(dados[0].documento_titulo).toBeNull();
    });

    it('filtra por prefixos de categoria econômica', () => {
      seedDespesa({ categoriaEconomica: '3.3.90.14.00 - DIÁRIAS' });
      seedDespesa({ categoriaEconomica: '4.4.90.51.00 - OBRAS' });

      const soDiarias = repo.getDespesas({ categoriaPrefixos: ['3.3.90.14'] });
      expect(soDiarias.total).toBe(1);
      expect(soDiarias.dados[0].categoria_economica).toContain('DIÁRIAS');
    });

    it('limita o tamanho máximo da página', () => {
      seedDespesa({});
      const r = repo.getDespesas({ limite: 5000 });
      expect(r.limite).toBeLessThanOrEqual(100);
    });

    it('filtra por credor_cnpj e exercicio, com paginação', () => {
      seedDespesa({ credorCnpj: '01991246000135', exercicio: 2026 });
      seedDespesa({ credorCnpj: '01991246000135', exercicio: 2025, data: '2025-03-01' });
      seedDespesa({ credorCnpj: '99999999999999', exercicio: 2026 });

      const soCredor = repo.getDespesas({ credor_cnpj: '01991246000135' });
      expect(soCredor.total).toBe(2);

      const credorAno = repo.getDespesas({ credor_cnpj: '01991246000135', exercicio: 2025 });
      expect(credorAno.total).toBe(1);
      expect(credorAno.dados[0].exercicio_orcamento).toBe(2025);

      const pag = repo.getDespesas({ credor_cnpj: '01991246000135', limite: 1, pagina: 2 });
      expect(pag.total).toBe(2);
      expect(pag.dados).toHaveLength(1);
    });

    it('filtra por finalidade e devolve evidencias auditaveis', () => {
      seedDespesa({
        credorCnpj: null,
        credorNome: 'JOAO DA SILVA',
        credorCargo: 'MOTORISTA',
        categoriaEconomica: '3.3.90.14.00 - DIARIAS',
        historico: 'DIARIA DE VIAGEM PARA SERVIDOR',
      });
      mockConn.prepare(`
        INSERT INTO documentos (id, fonte, tipo, numero, ano, titulo, url_origem)
        VALUES (77, 'prefeitura', 'edital', '1/2026', 2026, 'Pregao Presencial 1/2026', 'https://example.invalid/pregao')
      `).run();
      seedDespesa({
        credorCnpj: '12345678000190',
        credorNome: 'EMPRESA X LTDA',
        categoriaEconomica: '3.3.90.39.00 - OUTROS SERVICOS PJ',
        modalidade: 'Pregao Presencial 1/2026',
        documentoId: 77,
      });

      repo.backfillClassificacoesDespesas({ force: true });

      const diaria = repo.getDespesas({ finalidade: 'diaria_servidor' });
      expect(diaria.total).toBe(1);
      expect(diaria.dados[0].finalidade).toMatchObject({
        classe: 'diaria_servidor',
        subclasse: 'diarias',
      });
      expect(diaria.dados[0].finalidade.marcadores).toContain('cargo_credor');
      expect(diaria.dados[0].finalidade.evidencias.some((ev) => ev.campo === 'credor_cargo')).toBe(true);

      const licitacao = repo.getDespesas({ finalidade: 'licitacao' });
      expect(licitacao.total).toBe(1);
      expect(licitacao.dados[0].finalidade.classe).toBe('licitacao');
      expect(licitacao.dados[0].finalidade.marcadores).toContain('documento_vinculado');
    });
  });

  describe('getPainelResumo', () => {
    beforeEach(() => {
      seedDespesa({ exercicio: 2025, data: '2025-02-01', valor: 10, credorCnpj: '11111111111111', credorNome: 'A' });
      seedDespesa({ exercicio: 2025, data: '2025-03-01', valor: 20, credorCnpj: '22222222222222', credorNome: 'B' });
      seedDespesa({ exercicio: 2026, data: '2026-01-01', valor: 40, credorCnpj: '11111111111111', credorNome: 'A' });
      seedDespesa({
        exercicio: 2026,
        data: '2026-02-01',
        valor: 80,
        credorCnpj: '22222222222222',
        credorNome: 'B',
        tipo: 'OP - Ordem de Pagamento',
      });
    });

    it('sem filtro mantém comportamento atual (agregado completo)', () => {
      const painel = repo.getPainelResumo();
      expect(painel.total.n_empenhos).toBe(4);
      expect(painel.total.valor_total).toBe(150);
      expect(painel.porAno).toHaveLength(2);
      expect(painel.topCredores).toHaveLength(2);
      expect(painel.ultimosEmpenhos).toHaveLength(4);
    });

    it('com exercicio escopa total, topCredores, ultimosEmpenhos e tiposEmpenho', () => {
      const painel = repo.getPainelResumo({ exercicio: 2026 });

      expect(painel.total.n_empenhos).toBe(2);
      expect(painel.total.valor_total).toBe(120);

      expect(painel.topCredores).toHaveLength(2);
      expect(painel.topCredores[0].valor_total).toBe(80);

      expect(painel.ultimosEmpenhos).toHaveLength(2);
      expect(painel.ultimosEmpenhos.every((e) => e.exercicio_orcamento === 2026)).toBe(true);

      const tipos = painel.tiposEmpenho.map((t) => t.tipo).sort();
      expect(tipos).toEqual(['EO - Empenho Ordinário', 'OP - Ordem de Pagamento']);
      expect(painel.tiposEmpenho.find((t) => t.tipo.startsWith('OP')).n).toBe(1);
    });

    it('com exercicio mantém porAno completo (alimenta o seletor de período)', () => {
      const painel = repo.getPainelResumo({ exercicio: 2026 });
      expect(painel.porAno).toHaveLength(2);
      expect(painel.porAno.map((r) => r.exercicio).sort()).toEqual([2025, 2026]);
    });

    it('porAno separa valor_empenhado (sem OP) de valor_total (movimentação)', () => {
      // OP paga empenho (caixa) — não é nova despesa empenhada (competência);
      // misturar os dois infla o numerador da % de execução da LOA.
      const painel = repo.getPainelResumo();
      const ano2026 = painel.porAno.find((r) => r.exercicio === 2026);
      expect(ano2026.valor_total).toBe(120); // EO 40 + OP 80 (movimentação)
      expect(ano2026.valor_empenhado).toBe(40); // só empenhos
    });

    it('valor_receita_previsto soma apenas categorias nível-1 (sem dupla contagem)', () => {
      const insReceita = mockConn.prepare(
        'INSERT INTO transparencia_receitas (exercicio, codigo_receita, nome_receita, valor_previsto) VALUES (?, ?, ?, ?)'
      );
      insReceita.run(2026, '1.0.0.0.00.0.0', 'RECEITAS CORRENTES', 1000);
      insReceita.run(2026, '1.1.0.0.00.0.0', 'IMPOSTOS', 600); // filho — não pode somar
      insReceita.run(2026, '2.0.0.0.00.0.0', 'RECEITAS DE CAPITAL', 200);

      const painel = repo.getPainelResumo();
      const ano2026 = painel.porAno.find((r) => r.exercicio === 2026);
      expect(ano2026.valor_receita_previsto).toBe(1200);
    });

    it('aceita lista de exercicios (escopo por mandato)', () => {
      seedDespesa({ exercicio: 2023, data: '2023-05-01', valor: 5, credorCnpj: '11111111111111', credorNome: 'A' });
      const painel = repo.getPainelResumo({ exercicios: [2025, 2026] });

      expect(painel.total.n_empenhos).toBe(4);
      expect(painel.total.valor_total).toBe(150);
      expect(painel.ultimosEmpenhos.every((e) => [2025, 2026].includes(e.exercicio_orcamento))).toBe(true);
      expect(painel.porAno).toHaveLength(3);
    });
  });

  describe('crosswalkDespesasDocumentos', () => {
    it('corrige vínculo legado quando o processo correto usa a grafia oficial Inexibilidade', () => {
      mockConn.prepare(`
        INSERT INTO documentos (id, fonte, tipo, numero, ano, titulo, url_origem)
        VALUES (?, 'site_prefeitura', 'edital', ?, ?, ?, 'https://example.invalid')
      `).run(7, '0027/2026', 2026, 'Processo 0027/2026 - Adesão nº 007/2026 - Rede elétrica');
      mockConn.prepare(`
        INSERT INTO documentos (id, fonte, tipo, numero, ano, titulo, url_origem)
        VALUES (?, 'site_prefeitura', 'edital', ?, ?, ?, 'https://example.invalid')
      `).run(674, '0041/2026', 2026, 'Processo 0041/2026 - Inexibilidade n° 007/2026 - Passagens');
      seedDespesa({
        exercicio: 2026,
        modalidade: 'Inexigibilidade - 00072026',
        documentoId: 7,
        credorNome: 'VIAÇÃO SÃO VICENTE LTDA',
        credorCnpj: '24009094000128',
      });

      expect(repo.crosswalkDespesasDocumentos()).toBe(1);
      expect(mockConn.prepare('SELECT documento_id FROM transparencia_despesas').get().documento_id).toBe(674);
    });

    it('remove vínculo legado quando nenhum documento tem a modalidade exata do empenho', () => {
      mockConn.prepare(`
        INSERT INTO documentos (id, fonte, tipo, numero, ano, titulo, url_origem)
        VALUES (?, 'site_prefeitura', 'edital', ?, ?, ?, 'https://example.invalid')
      `).run(25, '0099/2022', 2022, 'Processo 0099/2022 - Pregão 025/2022 - Combustível');
      seedDespesa({
        exercicio: 2022,
        modalidade: 'Adesão - 00022022',
        documentoId: 25,
      });

      expect(repo.crosswalkDespesasDocumentos()).toBe(1);
      expect(mockConn.prepare('SELECT documento_id FROM transparencia_despesas').get().documento_id).toBeNull();
    });

    it('loga colisão e mantém o documento de menor id quando dois documentos têm a mesma modalidade', () => {
      const logger = require('../logger');
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});

      mockConn.prepare(`
        INSERT INTO documentos (id, fonte, tipo, numero, ano, titulo, url_origem)
        VALUES (?, 'site_prefeitura', 'edital', ?, ?, ?, 'https://example.invalid')
      `).run(173, '0083/2023', 2023, 'Processo 0083/2023 - Pregão 032/2023 - Material médico-hospitalar');
      mockConn.prepare(`
        INSERT INTO documentos (id, fonte, tipo, numero, ano, titulo, url_origem)
        VALUES (?, 'site_prefeitura', 'edital', ?, ?, ?, 'https://example.invalid')
      `).run(176, '0069/2023', 2023, 'Processo 0069/2023 - Pregão 032/2023 - Concessão de uso');
      seedDespesa({ exercicio: 2023, modalidade: 'Pregão - 00322023' });

      repo.crosswalkDespesasDocumentos();

      expect(mockConn.prepare('SELECT documento_id FROM transparencia_despesas').get().documento_id).toBe(173);
      expect(warnSpy).toHaveBeenCalledWith(
        'crosswalk: colisao de modalidade entre documentos',
        expect.objectContaining({ chave: 'pregao|32|2023', documento_mantido: 173, documento_ignorado: 176 })
      );

      warnSpy.mockRestore();
    });
  });

  describe('upsertDespesa — colunas derivadas', () => {
    it('grava credor_cargo, co_tce e credor_chave (PF sem CNPJ)', () => {
      repo.upsertDespesa({
        exercicio: 2026,
        empenho: '09001-000',
        credor: 'ADILSON DE SOUZA MELO - CPF/CNPJ:',
        cargo: 'MOTORISTA',
        coTce: 'TCE-42',
        valor: 45,
      });

      const row = mockConn
        .prepare("SELECT credor_cargo, co_tce, credor_chave FROM transparencia_despesas WHERE empenho = '09001-000'")
        .get();
      expect(row.credor_cargo).toBe('MOTORISTA');
      expect(row.co_tce).toBe('TCE-42');
      expect(row.credor_chave).toBe('pf-adilson-de-souza-melo');
    });

    it('PJ com CNPJ vira chave de 14 dígitos', () => {
      repo.upsertDespesa({
        exercicio: 2026,
        empenho: '09002-000',
        credor: 'EMPRESA X LTDA - CPF/CNPJ: CNPJ: 12.345.678/0001-90',
        valor: 100,
      });

      const row = mockConn
        .prepare("SELECT credor_chave, credor_cargo FROM transparencia_despesas WHERE empenho = '09002-000'")
        .get();
      expect(row.credor_chave).toBe('12345678000190');
      expect(row.credor_cargo).toBeNull();
    });

    it('getDespesas filtra por chave PF (param credor_cnpj aceita a chave)', () => {
      repo.upsertDespesa({ exercicio: 2026, empenho: '09010-000', credor: 'ADILSON DE SOUZA MELO - CPF/CNPJ:', valor: 45 });
      repo.upsertDespesa({ exercicio: 2026, empenho: '09011-000', credor: 'OUTRA PESSOA - CPF/CNPJ:', valor: 90 });

      const r = repo.getDespesas({ credor_cnpj: 'pf-adilson-de-souza-melo' });
      expect(r.total).toBe(1);
      expect(r.dados[0].credor_nome).toBe('ADILSON DE SOUZA MELO');
    });

    it('re-upsert atualiza as colunas derivadas', () => {
      repo.upsertDespesa({ exercicio: 2026, empenho: '09003-000', credor: 'FULANO - CPF/CNPJ:', cargo: 'AUXILIAR', valor: 10 });
      repo.upsertDespesa({ exercicio: 2026, empenho: '09003-000', credor: 'FULANO - CPF/CNPJ:', cargo: 'SECRETARIO', valor: 10 });

      const row = mockConn
        .prepare("SELECT credor_cargo FROM transparencia_despesas WHERE empenho = '09003-000'")
        .get();
      expect(row.credor_cargo).toBe('SECRETARIO');
    });
  });

  describe('getFilaPagamentos', () => {
    function seedLiquidado({ id, liquidacao, pagamento = null, valor = 100, tipo = 'EO - Empenho Ordinário', credor = 'FORNECEDOR X' }) {
      seedDespesa({ exercicio: 2026, valor, tipo, credorNome: credor, credorCnpj: `${id}`.padStart(14, '0') });
      mockConn
        .prepare('UPDATE transparencia_despesas SET data_liquidacao = ?, data_pagamento = ? WHERE hash_despesa = ?')
        .run(liquidacao, pagamento, `hash-2026-${seq}`);
    }

    it('lista só empenhos liquidados sem pagamento, mais antigos primeiro', () => {
      seedLiquidado({ id: 1, liquidacao: '2026-03-01' });
      seedLiquidado({ id: 2, liquidacao: '2026-01-15', valor: 500 });
      seedLiquidado({ id: 3, liquidacao: '2026-02-01', pagamento: '2026-02-10' }); // pago — fora
      seedDespesa({ exercicio: 2026, valor: 999 }); // nem liquidado — fora

      const fila = repo.getFilaPagamentos();

      expect(fila.itens).toHaveLength(2);
      expect(fila.itens[0].data_liquidacao).toBe('2026-01-15'); // mais antigo primeiro
      expect(fila.resumo.n_total).toBe(2);
      expect(fila.resumo.valor_total).toBe(600);
    });

    it('exclui ordens de pagamento (extra-orçamentárias) da fila', () => {
      seedLiquidado({ id: 1, liquidacao: '2026-01-01', tipo: 'OP - Ordem de Pagamento' });
      const fila = repo.getFilaPagamentos();
      expect(fila.itens).toHaveLength(0);
    });

    it('filtra por exercicio quando informado', () => {
      seedLiquidado({ id: 1, liquidacao: '2026-01-01' });
      seedDespesa({ exercicio: 2025, valor: 50 });
      mockConn
        .prepare("UPDATE transparencia_despesas SET data_liquidacao = '2025-06-01' WHERE exercicio_orcamento = 2025")
        .run();

      expect(repo.getFilaPagamentos({ exercicio: 2026 }).itens).toHaveLength(1);
      expect(repo.getFilaPagamentos().itens).toHaveLength(2);
    });
  });
});
