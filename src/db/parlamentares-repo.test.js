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
jest.mock('./connection', () => ({ db: mockConn }));

const { upsertVereador, upsertMandato, upsertProjeto } = require('./camara-repo');
const {
  listarVereadoresComMandatos,
  listarProposicoesComAutor,
  listarProjetosComAutor,
} = require('./parlamentares-repo');

describe('parlamentares-repo', () => {
  function inserirDocumento({ tipo, autor, fonte = 'camara' }) {
    mockConn
      .prepare(
        `INSERT INTO documentos (fonte, tipo, numero, ano, titulo, resumo, data_publicacao, url_origem, dados_extras)
           VALUES (?, ?, '1', 2024, 'Titulo', 'Ementa', '2024-06-17', 'https://camara.exemplo/m/Legislacao', ?)`
      )
      .run(fonte, tipo, JSON.stringify(autor ? { autor } : {}));
  }

  beforeEach(() => {
    mockConn.exec('DELETE FROM documentos;');
  });

  it('devolve cada vereador com os mandatos do mais recente ao mais antigo', () => {
    upsertVereador({ intPes: 487, nome: 'Totó do Sabiá' });
    upsertMandato({ intPes: 487, periodoInicio: 2021, periodoFim: 2024, partido: 'PSDB' });
    upsertMandato({ intPes: 487, periodoInicio: 2025, periodoFim: 2028, partido: 'PSB' });

    const [vereador] = listarVereadoresComMandatos();

    expect(vereador.mandatos.map(m => m.partido)).toEqual(['PSB', 'PSDB']);
  });

  it('lista só indicações e requerimentos da Câmara que têm autor', () => {
    inserirDocumento({ tipo: 'indicacao', autor: 'Edir Bonifácio Silva Santos' });
    inserirDocumento({ tipo: 'requerimento', autor: 'Sormani Jesus de Oliveira' });
    inserirDocumento({ tipo: 'indicacao', autor: null });
    inserirDocumento({ tipo: 'portaria', autor: 'Sormani Jesus de Oliveira' });
    inserirDocumento({ tipo: 'indicacao', autor: 'Fulano', fonte: 'prefeitura' });

    const proposicoes = listarProposicoesComAutor();

    expect(proposicoes.map(p => p.autor).sort()).toEqual([
      'Edir Bonifácio Silva Santos',
      'Sormani Jesus de Oliveira',
    ]);
    expect(proposicoes[0]).toMatchObject({
      ementa: 'Ementa',
      url_origem: 'https://camara.exemplo/m/Legislacao',
    });
  });

  it('lista projetos com autor para cruzar com os parlamentares', () => {
    upsertProjeto({ intPrjt: 6968, autorTexto: 'Prefeito Antônio Ronato de Melo' });

    expect(listarProjetosComAutor()[0]).toMatchObject({
      int_prjt: 6968,
      autor_texto: 'Prefeito Antônio Ronato de Melo',
    });
  });
});
