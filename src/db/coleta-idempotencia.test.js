'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const mockConn = new DatabaseSync(':memory:');
mockConn.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
jest.mock('./connection', () => ({ db: mockConn }));
const { saveDocumento } = require('./index');
const { upsertDespesa, upsertReceita } = require('./transparencia-repo');
const { upsertFolhaRegistro } = require('./folha-repo');
const { ensureDespesasFtsIndex } = require('./fts-despesas-repo');
const totalChanges = () => mockConn.prepare('SELECT total_changes() AS n').get().n;

describe('coleta sem regravacoes', () => {
  beforeEach(() => {
    mockConn.exec('DELETE FROM transparencia_despesas_classificacoes; DELETE FROM transparencia_despesas; DELETE FROM transparencia_receitas; DELETE FROM transparencia_folha; DELETE FROM documentos_fontes; DELETE FROM licitacoes_detalhes; DELETE FROM documentos;');
  });
  const document = () => ({ fonte: 'site_prefeitura', tipo: 'edital', numero: '07/2026', ano: 2026,
    titulo: 'Edital de teste', texto_completo: 'Conteudo oficial', url_origem: 'https://example.invalid/7',
    url_pdf: 'https://example.invalid/7.pdf', hash_conteudo: 'hash-teste',
    dados_extras: { campos: { Objeto: 'Teste', Valor: 100 } },
    licitacao_detalhes: { modalidade: 'Pregao', valor_final: 100 } });

  test('identical document performs ZERO writes, including provenance and details', () => {
    const first = saveDocumento(document());
    expect(first.action).toBe('inserted');
    const before = totalChanges();
    expect(saveDocumento(document())).toEqual({ id: first.id, action: 'unchanged' });
    expect(totalChanges()).toBe(before);
    const reordered = document();
    reordered.dados_extras = { campos: { Valor: 100, Objeto: 'Teste' } };
    expect(saveDocumento(reordered).action).toBe('unchanged');
    expect(totalChanges()).toBe(before);
  });
  test('real document/detail changes are saved without duplicates', () => {
    const first = saveDocumento(document());
    expect(saveDocumento({ ...document(), titulo: 'Retificacao oficial' }).action).toBe('updated');
    expect(saveDocumento({ ...document(), licitacao_detalhes: { valor_final: 101 } }).action).toBe('updated');
    expect(mockConn.prepare('SELECT valor_final FROM licitacoes_detalhes WHERE documento_id=?').get(first.id).valor_final).toBe(101);
    expect(mockConn.prepare('SELECT count(*) AS n FROM documentos').get().n).toBe(1);
  });
  test('recollection preserves OCR, year and established details', () => {
    const doc = { ...document(), texto_completo: 'Texto OCR autoritativo',
      dados_extras: { texto_origem: 'ocr', ocr_dpi: 300 } };
    const first = saveDocumento(doc);
    saveDocumento({ ...document(), ano: null, texto_completo: 'pdfjs', licitacao_detalhes: { valor_final: null } });
    const row = mockConn.prepare('SELECT * FROM documentos WHERE id=?').get(first.id);
    expect(row.texto_completo).toBe('Texto OCR autoritativo');
    expect(row.ano).toBe(2026);
    expect(mockConn.prepare('SELECT valor_final FROM licitacoes_detalhes').get().valor_final).toBe(100);
  });
  test('identical expense performs ZERO writes, preserving links and timestamps', () => {
    const data = { exercicio: 2026, empenho: '00001-000', valor: 100, historico: 'Pagamento teste', modalidade: 'Pregao 7/2026' };
    expect(upsertDespesa(data)).toBe('inserted');
    const before = totalChanges();
    const old = mockConn.prepare('SELECT atualizado_em FROM transparencia_despesas').get();
    expect(upsertDespesa({ modalidade: data.modalidade, historico: data.historico, valor: 100, empenho: data.empenho, exercicio: 2026 })).toBe('unchanged');
    expect(totalChanges()).toBe(before);
    expect(mockConn.prepare('SELECT atualizado_em FROM transparencia_despesas').get()).toEqual(old);
    expect(upsertDespesa({ ...data, valor: 101, modalidade: 'Pregao 8/2026' })).toBe('updated');
    const row = mockConn.prepare('SELECT valor, modalidade FROM transparencia_despesas').get();
    expect(row.valor).toBe(101); expect(row.modalidade).toBe('Pregao 8/2026');
  });
  test('identical receipt and payroll perform ZERO writes; real changes persist', () => {
    const receita = { codigoDaReceita: '1', nomeReceita: 'Teste', valor: 100 };
    const folha = { vinculo: '1', matricula: '1', competenciaAno: 2026, competenciaMes: 9,
      nomeServidor: 'Pessoa ficticia', remuneracaoBruta: 100, rubricas: [{ codigo: '1', valor: 100 }] };
    expect(upsertReceita(2026, receita)).toBe('inserted');
    expect(upsertFolhaRegistro(folha)).toBe('inserted');
    const before = totalChanges();
    expect(upsertReceita(2026, receita)).toBe('unchanged');
    expect(upsertFolhaRegistro(folha)).toBe('unchanged');
    expect(totalChanges()).toBe(before);
    expect(upsertReceita(2026, { ...receita, valor: 101 })).toBe('updated');
    expect(upsertFolhaRegistro({ ...folha, remuneracaoBruta: 101 })).toBe('updated');
  });
  test('FTS ignores non-indexed changes, but indexes actual text corrections', () => {
    ensureDespesasFtsIndex();
    upsertDespesa({ exercicio: 2026, empenho: '00002', valor: 100, historico: 'original' });
    const before = totalChanges();
    mockConn.exec('UPDATE transparencia_despesas SET valor=101;');
    expect(totalChanges() - before).toBe(1);
    mockConn.exec("UPDATE transparencia_despesas SET historico='corrigido';");
    expect(mockConn.prepare("SELECT rowid FROM despesas_fts WHERE despesas_fts MATCH 'corrigido'").get()).toBeDefined();
    expect(mockConn.prepare("SELECT rowid FROM despesas_fts WHERE despesas_fts MATCH 'original'").get()).toBeUndefined();
  });
  test('old FTS trigger is upgraded without rewriting records or rebuilding the populated index', () => {
    upsertDespesa({ exercicio: 2026, empenho: '00003', valor: 100, historico: 'pagamento' });
    mockConn.exec(`DROP TRIGGER despesas_fts_au;
      CREATE TRIGGER despesas_fts_au AFTER UPDATE ON transparencia_despesas BEGIN
        INSERT INTO despesas_fts(despesas_fts, rowid, historico, credor_nome, empenho)
        VALUES ('delete', old.id, old.historico, old.credor_nome, old.empenho);
        INSERT INTO despesas_fts(rowid, historico, credor_nome, empenho)
        VALUES (new.id, new.historico, new.credor_nome, new.empenho);
      END;`);
    const before = totalChanges();
    expect(ensureDespesasFtsIndex()).toEqual({ rebuiltRows: 0 });
    expect(totalChanges()).toBe(before);
    mockConn.exec('UPDATE transparencia_despesas SET valor=101;');
    expect(totalChanges() - before).toBe(1);
    expect(mockConn.prepare("SELECT rowid FROM despesas_fts WHERE despesas_fts MATCH 'pagamento'").get()).toBeDefined();
  });
});
