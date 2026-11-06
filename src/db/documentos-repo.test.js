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

const {
  listDocumentos,
  listPublicacoesRecentes,
  labelTipo,
  labelFonte,
  cleanField,
  normalizeModalidadeLicitacao,
} = require('./documentos-repo');

describe('labelTipo e labelFonte', () => {
  it('traduz tipos de legislacao e emenda parlamentar pra texto legivel (nao vaza o valor cru do banco)', () => {
    expect(labelTipo('lei_ordinaria')).toBe('Lei Ordinária');
    expect(labelTipo('lei_complementar')).toBe('Lei Complementar');
    expect(labelTipo('decreto')).toBe('Decreto');
    expect(labelTipo('portaria')).toBe('Portaria');
    expect(labelTipo('emenda_parlamentar')).toBe('Emenda Parlamentar');
  });

  it('traduz fontes conhecidas do sistema para texto legivel', () => {
    expect(labelFonte('site_prefeitura')).toBe('Prefeitura');
    expect(labelFonte('camara')).toBe('Câmara');
    expect(labelFonte('camara_legislacao')).toBe('Câmara (Legislação)');
    expect(labelFonte('camara_projetos')).toBe('Câmara (Projetos)');
    expect(labelFonte('legislacao_prefeitura')).toBe('Prefeitura (Legislação)');
    expect(labelFonte('pncp')).toBe('PNCP');
  });

  it('tipo desconhecido cai no proprio valor (nunca "undefined")', () => {
    expect(labelTipo('algo_nunca_visto')).toBe('algo_nunca_visto');
  });
});

describe('cleanField e normalizeModalidadeLicitacao', () => {
  it('cleanField retorna null para undefined, null e strings literais "undefined"/"null"/"NaN"', () => {
    expect(cleanField(undefined)).toBeNull();
    expect(cleanField(null)).toBeNull();
    expect(cleanField('undefined')).toBeNull();
    expect(cleanField('null')).toBeNull();
    expect(cleanField('NaN')).toBeNull();
    expect(cleanField('  ')).toBeNull();
    expect(cleanField('GONVI ENGENHARIA LTDA')).toBe('GONVI ENGENHARIA LTDA');
  });

  it('normalizeModalidadeLicitacao corrige grafia "inexibilidade" e rejeita número puro', () => {
    expect(normalizeModalidadeLicitacao('Inexibilidade nº 002/2025')).toBe('Inexigibilidade');
    expect(normalizeModalidadeLicitacao('Inexigibilidade 001/2025')).toBe('Inexigibilidade');
    expect(normalizeModalidadeLicitacao('004/2025')).toBeNull();
    expect(normalizeModalidadeLicitacao('nº 004/2025')).toBeNull();
  });
});

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

  it('tipo com virgula filtra por qualquer um da lista (pagina de Legislacao)', () => {
    inserirDocumento({ numero: '1', ano: 2025, titulo: 'Decreto 1', tipo: 'decreto' });
    inserirDocumento({ numero: '2', ano: 2025, titulo: 'Portaria 1', tipo: 'portaria' });
    inserirDocumento({ numero: '3', ano: 2025, titulo: 'Edital 1', tipo: 'edital' });
    inserirDocumento({ numero: '4', ano: 2025, titulo: 'Lei 1', tipo: 'lei_ordinaria' });

    const resultado = listDocumentos({ tipo: 'decreto,portaria,lei_ordinaria', pagina: 1, limite: 10 });

    expect(resultado.dados).toHaveLength(3);
    expect(resultado.dados.map((d) => d.tipo).sort()).toEqual(['decreto', 'lei_ordinaria', 'portaria']);
  });

  it('tipo sem virgula continua filtrando por match exato (comportamento antigo)', () => {
    inserirDocumento({ numero: '1', ano: 2025, titulo: 'Decreto 1', tipo: 'decreto' });
    inserirDocumento({ numero: '2', ano: 2025, titulo: 'Portaria 1', tipo: 'portaria' });

    const resultado = listDocumentos({ tipo: 'decreto', pagina: 1, limite: 10 });

    expect(resultado.dados).toHaveLength(1);
    expect(resultado.dados[0].tipo).toBe('decreto');
  });

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

  it('expõe flag divergencia_ano_publicacao e traz o documento ao filtrar por qualquer um dos dois anos', () => {
    inserirDocumento({
      numero: '0135/2023',
      ano: 2023,
      titulo: 'Processo 0135/2023 - Pregão Eletrônico 0052/2023',
      data_publicacao: '2024-01-23',
    });

    const em2023 = listDocumentos({ ano: 2023, pagina: 1, limite: 10 });
    const em2024 = listDocumentos({ ano: 2024, pagina: 1, limite: 10 });

    expect(em2023.dados).toHaveLength(1);
    expect(em2024.dados).toHaveLength(1);
    expect(em2023.dados[0]).toMatchObject({
      ano: 2023,
      ano_instrumento: 2023,
      ano_publicacao: 2024,
      divergencia_ano_publicacao: true,
    });
    expect(em2023.dados[0].qualidade_alertas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tipo: 'divergencia_ano_publicacao',
        }),
      ])
    );
  });
});
