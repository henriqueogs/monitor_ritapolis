'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

function criarBancoMemoria() {
  const conn = new DatabaseSync(':memory:');
  const schema = fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf8');
  conn.exec(schema);
  return conn;
}

// Mock do módulo de conexão para usar banco em memória
const mockConn = criarBancoMemoria();

jest.mock('./connection', () => ({
  db: mockConn,
}));

const { listDocumentos, listPublicacoesRecentes } = require('./documentos-repo');

describe('listDocumentos', () => {
  beforeEach(() => {
    mockConn.exec('DELETE FROM documentos');
    mockConn.exec('DELETE FROM documentos_resumos_ai');
    mockConn.exec('DELETE FROM licitacoes_grupo_documentos');
    mockConn.exec('DELETE FROM licitacoes_grupos');
    mockConn.exec('DELETE FROM licitacoes_fontes_relacionadas');
  });

  function inserirDocumento(doc) {
    const stmt = mockConn.prepare(`
      INSERT INTO documentos (fonte, tipo, numero, ano, titulo, data_publicacao, data_abertura, status_coleta, url_origem)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      doc.fonte || 'prefeitura',
      doc.tipo || 'edital',
      doc.numero ?? null,
      doc.ano ?? null,
      doc.titulo,
      doc.data_publicacao ?? null,
      doc.data_abertura ?? null,
      doc.status_coleta || 'ok',
      doc.url_origem || 'http://exemplo.com'
    );
  }

  it('ordena documentos por ano (cronológico) antes da data de publicação', () => {
    // Inserir documentos de anos diferentes com datas misturadas
    inserirDocumento({
      numero: '001/2024',
      ano: 2024,
      titulo: 'Edital 2024 - Janeiro',
      data_publicacao: '2024-01-15'
    });
    
    inserirDocumento({
      numero: '002/2026',
      ano: 2026,
      titulo: 'Edital 2026 - Março',
      data_publicacao: '2026-03-10'
    });
    
    inserirDocumento({
      numero: '003/2025',
      ano: 2025,
      titulo: 'Edital 2025 - Dezembro',
      data_publicacao: '2025-12-20'
    });
    
    inserirDocumento({
      numero: '004/2026',
      ano: 2026,
      titulo: 'Edital 2026 - Janeiro',
      data_publicacao: '2026-01-05'
    });

    const resultado = listDocumentos({ pagina: 1, limite: 10 });

    // Deve vir: 2026 (Março), 2026 (Janeiro), 2025, 2024
    expect(resultado.dados).toHaveLength(4);
    expect(resultado.dados[0].ano).toBe(2026);
    expect(resultado.dados[0].data_publicacao).toBe('2026-03-10');
    expect(resultado.dados[1].ano).toBe(2026);
    expect(resultado.dados[1].data_publicacao).toBe('2026-01-05');
    expect(resultado.dados[2].ano).toBe(2025);
    expect(resultado.dados[3].ano).toBe(2024);
  });

  it('documentos sem ano vão para o final da listagem', () => {
    inserirDocumento({
      numero: '001/2026',
      ano: 2026,
      titulo: 'Edital 2026',
      data_publicacao: '2026-01-15'
    });
    
    inserirDocumento({
      numero: null,
      ano: null,
      titulo: 'Documento sem ano',
      data_publicacao: '2026-06-01'
    });
    
    inserirDocumento({
      numero: '002/2025',
      ano: 2025,
      titulo: 'Edital 2025',
      data_publicacao: '2025-12-01'
    });

    const resultado = listDocumentos({ pagina: 1, limite: 10 });

    expect(resultado.dados).toHaveLength(3);
    expect(resultado.dados[0].ano).toBe(2026);
    expect(resultado.dados[1].ano).toBe(2025);
    expect(resultado.dados[2].ano).toBeNull();
  });

  it('paginação mantém ordem cronológica entre páginas', () => {
    // Inserir 5 documentos de 2026 e 5 de 2025
    for (let i = 1; i <= 5; i++) {
      inserirDocumento({
        numero: `00${i}/2026`,
        ano: 2026,
        titulo: `Edital 2026-${i}`,
        data_publicacao: `2026-0${i}-15`
      });
    }
    
    for (let i = 1; i <= 5; i++) {
      inserirDocumento({
        numero: `00${i}/2025`,
        ano: 2025,
        titulo: `Edital 2025-${i}`,
        data_publicacao: `2025-0${i}-15`
      });
    }

    const pagina1 = listDocumentos({ pagina: 1, limite: 3 });
    const pagina2 = listDocumentos({ pagina: 2, limite: 3 });
    const pagina3 = listDocumentos({ pagina: 3, limite: 3 });

    // Página 1: todos de 2026
    expect(pagina1.dados).toHaveLength(3);
    expect(pagina1.dados.every(d => d.ano === 2026)).toBe(true);

    // Página 2: 2 de 2026 + 1 de 2025
    expect(pagina2.dados).toHaveLength(3);
    expect(pagina2.dados[0].ano).toBe(2026);
    expect(pagina2.dados[1].ano).toBe(2026);
    expect(pagina2.dados[2].ano).toBe(2025);

    // Página 3: todos de 2025
    expect(pagina3.dados).toHaveLength(3);
    expect(pagina3.dados.every(d => d.ano === 2025)).toBe(true);
  });

  it('dentro do mesmo ano, ordena por data de publicação', () => {
    inserirDocumento({
      numero: '001/2026',
      ano: 2026,
      titulo: 'Edital Janeiro',
      data_publicacao: '2026-01-15'
    });
    
    inserirDocumento({
      numero: '002/2026',
      ano: 2026,
      titulo: 'Edital Março',
      data_publicacao: '2026-03-10'
    });
    
    inserirDocumento({
      numero: '003/2026',
      ano: 2026,
      titulo: 'Edital Fevereiro',
      data_publicacao: '2026-02-20'
    });

    const resultado = listDocumentos({ pagina: 1, limite: 10 });

    expect(resultado.dados[0].data_publicacao).toBe('2026-03-10');
    expect(resultado.dados[1].data_publicacao).toBe('2026-02-20');
    expect(resultado.dados[2].data_publicacao).toBe('2026-01-15');
  });

  it('home usa data de publicacao estrita, mais recente primeiro, e exclui sem data', () => {
    inserirDocumento({
      ano: 2030,
      titulo: 'Ano cadastral maior, publicacao antiga',
      data_publicacao: '2025-12-30',
    });
    inserirDocumento({
      ano: 2026,
      titulo: 'Publicacao mais recente',
      data_publicacao: '2026-06-30',
    });
    inserirDocumento({
      ano: 2026,
      titulo: 'Sem data de publicacao',
      data_publicacao: null,
      data_abertura: '2026-07-01',
    });

    const recentes = listPublicacoesRecentes({ limite: 8 });
    expect(recentes.map((doc) => doc.titulo)).toEqual([
      'Publicacao mais recente',
      'Ano cadastral maior, publicacao antiga',
    ]);
  });
});
