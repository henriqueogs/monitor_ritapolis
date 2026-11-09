'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const mockConn = new DatabaseSync(':memory:');
mockConn.exec(fs.readFileSync(path.resolve(__dirname, '../db/schema.sql'), 'utf8'));
jest.mock('../db/connection', () => ({ db: mockConn }));

const repo = require('../db/backfill-detalhe-repo');
const itensRepo = require('../db/despesa-itens-repo');
const { backfillLicitacaoModalidade, backfillItens } = require('./backfill-licitacao-modalidade');

const HTML_ADESAO = `<TR><TD><b>Licitação:</b> 00005225 / 0</TD><TD><b>Modalidade:</b> Adesão a Registro de Preços - 00122025</TD></TR>
  <TR><TD><b>Número:</b>&nbsp;<B>{EMP}</B></TD></TR>`;
const htmlDe = emp => HTML_ADESAO.replace('{EMP}', emp);

let seq = 0;
function seed({
  cnpj = '11111111000111',
  ano = 2025,
  tipo = 'EO',
  licitacao = null,
  modalidade = null,
}) {
  seq += 1;
  const empenho = `${String(seq).padStart(5, '0')}-000`;
  mockConn
    .prepare(
      `INSERT INTO transparencia_despesas
         (exercicio_orcamento, empenho, tipo, data_empenho, credor_cnpj, credor_nome, valor,
          licitacao_ref, modalidade, hash_despesa)
       VALUES (?, ?, ?, ?, ?, 'X LTDA', 10, ?, ?, ?)`
    )
    .run(ano, empenho, tipo, `${ano}-03-10`, cnpj, licitacao, modalidade, `h-${seq}`);
  return empenho;
}

const linha = empenho =>
  mockConn
    .prepare('SELECT licitacao_ref, modalidade FROM transparencia_despesas WHERE empenho = ?')
    .get(empenho);

describe('backfill-detalhe-repo', () => {
  beforeEach(() => {
    mockConn.exec('DELETE FROM transparencia_despesas');
    seq = 0;
  });

  it('lista só empenhos originais ainda sem licitação/modalidade, filtrando por ano e CNPJ', () => {
    seed({});
    seed({ ano: 2024 });
    seed({ tipo: 'EE' });
    seed({ modalidade: 'Pregão' });
    seed({ cnpj: '22222222000122' });
    expect(repo.listarSemModalidade({ anoMin: 2025 }).map(r => r.empenho)).toEqual([
      '00001-000',
      '00005-000',
    ]);
    expect(repo.listarSemModalidade({ anoMin: 2025, cnpj: '22.222.222/0001-22' })).toHaveLength(1);
    expect(repo.listarSemModalidade({ anoMin: 2025, limite: 1 })).toHaveLength(1);
  });

  it('grava só quando os campos ainda estão vazios', () => {
    const vazio = seed({});
    const preenchido = seed({ modalidade: 'Pregão' });
    const [{ id }] = repo.listarSemModalidade({ anoMin: 2025 });
    expect(repo.gravarLicitacaoModalidade(id, '1 / 0', 'Adesão')).toBe(true);
    expect(linha(vazio)).toEqual({ licitacao_ref: '1 / 0', modalidade: 'Adesão' });
    const id2 = mockConn
      .prepare('SELECT id FROM transparencia_despesas WHERE empenho = ?')
      .get(preenchido).id;
    expect(repo.gravarLicitacaoModalidade(id2, 'x', 'y')).toBe(false);
    expect(linha(preenchido).modalidade).toBe('Pregão');
  });
});

describe('backfillItens', () => {
  const PAGINA = emp => `${htmlDe(emp)}
    <TR><TH colspan='3'>Item 1</TH></TR>
    <TR><TD colspan='3'><b>Produto:</b> 00000001283 - ENGRENAGEM</TD></TR>
    <TR><TD colspan='3'><b>Unidade:</b> PÇ</TD></TR>
    <TR><TD><b>Quantidade:</b> 1,00</TD><TD><b>Valor Unitário:</b> 3.187,26</TD><TD><b>Total:</b> 3.187,26</TD></TR>`;
  const base = (extra = {}) => ({ repo: itensRepo, delayMs: 0, anoMin: 2025, ...extra });
  const contar = () =>
    mockConn.prepare('SELECT COUNT(*) n FROM transparencia_despesas_itens').get().n;

  beforeEach(() => {
    mockConn.exec('DELETE FROM transparencia_despesas_itens; DELETE FROM transparencia_despesas;');
    seq = 0;
  });

  it('dry-run conta mas não grava; apply grava os itens do empenho com modalidade', async () => {
    seed({ modalidade: 'Adesão a Registro de Preços' });
    seed({});
    const seco = await backfillItens(base({ buscarHtml: async x => PAGINA(x.empenho) }));
    expect(seco).toMatchObject({ lidos: 1, comItens: 1, gravados: 0, apply: false });
    expect(contar()).toBe(0);
    const r = await backfillItens(base({ buscarHtml: async x => PAGINA(x.empenho), apply: true }));
    expect(r).toMatchObject({ lidos: 1, comItens: 1, gravados: 1 });
    expect(contar()).toBe(1);
  });

  it('página de outro empenho ou sem itens não grava; falha não interrompe', async () => {
    seed({ modalidade: 'Pregão' });
    seed({ modalidade: 'Pregão' });
    seed({ modalidade: 'Pregão' });
    const r = await backfillItens(
      base({
        apply: true,
        buscarHtml: async x => {
          if (x.empenho === '00001-000') {return '<html>sem itens</html>';}
          if (x.empenho === '00002-000') {throw new Error('timeout');}
          return PAGINA('99999-000');
        },
      })
    );
    expect(r).toMatchObject({ lidos: 3, gravados: 0, semDado: 2, falhas: 1 });
  });
});

describe('backfillLicitacaoModalidade', () => {
  beforeEach(() => {
    mockConn.exec('DELETE FROM transparencia_despesas');
    seq = 0;
  });
  const opcoes = (buscarHtml, extra = {}) => ({
    repo,
    buscarHtml,
    delayMs: 0,
    anoMin: 2025,
    ...extra,
  });

  it('dry-run lê as páginas e conta, mas não grava', async () => {
    const e = seed({});
    const r = await backfillLicitacaoModalidade(
      opcoes(async x => htmlDe(x.empenho), { apply: false })
    );
    expect(r).toMatchObject({ lidos: 1, encontrados: 1, gravados: 0, falhas: 0 });
    expect(linha(e).modalidade).toBeNull();
  });

  it('com apply grava licitação e modalidade lidas da página', async () => {
    const e = seed({});
    const r = await backfillLicitacaoModalidade(
      opcoes(async x => htmlDe(x.empenho), { apply: true })
    );
    expect(r.gravados).toBe(1);
    expect(linha(e)).toEqual({
      licitacao_ref: '00005225 / 0',
      modalidade: 'Adesão a Registro de Preços - 00122025',
    });
  });

  it('página de outro empenho ou sem os campos não grava e conta como sem dado', async () => {
    seed({});
    seed({});
    const r = await backfillLicitacaoModalidade(
      opcoes(async x => (x.empenho === '00001-000' ? htmlDe('99999-000') : '<html>vazio</html>'), {
        apply: true,
      })
    );
    expect(r).toMatchObject({ lidos: 2, gravados: 0, semDado: 2 });
  });

  it('falha de rede num empenho não interrompe os demais', async () => {
    const a = seed({});
    seed({});
    const r = await backfillLicitacaoModalidade(
      opcoes(
        async x => {
          if (x.empenho === '00002-000') {
            throw new Error('timeout');
          }
          return htmlDe(x.empenho);
        },
        { apply: true }
      )
    );
    expect(r).toMatchObject({ lidos: 2, gravados: 1, falhas: 1 });
    expect(linha(a).modalidade).toMatch(/Adesão/);
  });

  it('respeita o limite pedido', async () => {
    seed({});
    seed({});
    seed({});
    const r = await backfillLicitacaoModalidade(
      opcoes(async x => htmlDe(x.empenho), { limite: 2 })
    );
    expect(r.lidos).toBe(2);
  });
});
