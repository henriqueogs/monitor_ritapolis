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
  documentoId = null,
} = {}) {
  seq += 1;
  mockConn
    .prepare(
      `INSERT INTO transparencia_despesas
         (exercicio_orcamento, empenho, tipo, data_empenho, credor_cnpj, credor_nome,
          valor, funcao, unidade, programa, categoria_economica, fonte_recurso,
          documento_id, hash_despesa)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      exercicio,
      empenho || `0000${seq}-000`.slice(-9),
      tipo,
      data,
      credorCnpj,
      credorNome,
      valor,
      funcao,
      unidade,
      programa,
      categoriaEconomica,
      fonteRecurso,
      documentoId,
      `hash-${exercicio}-${seq}`
    );
}

describe('transparencia-repo', () => {
  beforeEach(() => {
    mockConn.exec(
      'DELETE FROM transparencia_despesas; DELETE FROM transparencia_receitas; DELETE FROM transparencia_coletas_log; DELETE FROM documentos;'
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

    it('aceita lista de exercicios (escopo por mandato)', () => {
      seedDespesa({ exercicio: 2023, data: '2023-05-01', valor: 5, credorCnpj: '11111111111111', credorNome: 'A' });
      const painel = repo.getPainelResumo({ exercicios: [2025, 2026] });

      expect(painel.total.n_empenhos).toBe(4);
      expect(painel.total.valor_total).toBe(150);
      expect(painel.ultimosEmpenhos.every((e) => [2025, 2026].includes(e.exercicio_orcamento))).toBe(true);
      expect(painel.porAno).toHaveLength(3);
    });
  });
});
