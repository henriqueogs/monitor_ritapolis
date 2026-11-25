'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const mockConn = new DatabaseSync(':memory:');
mockConn.exec(fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf8'));
jest.mock('./connection', () => ({ db: mockConn }));

const { salvarCandidaturasTse, listarCandidaturasTse } = require('./candidaturas-tse-repo');

const URL_ORIGEM = 'https://dadosabertos.tse.jus.br/dataset/resultados-2024';

function candidatura(overrides = {}) {
  return {
    sq_candidato: '130002026148',
    ano_eleicao: 2024,
    numero: '40444',
    nome: 'SORMANI JESUS DE OLIVEIRA',
    nome_urna: 'TOTÓ DO SABIÁ',
    partido: 'PSB',
    votos: 110,
    situacao: 'ELEITO POR MÉDIA',
    ...overrides,
  };
}

describe('candidaturas-tse-repo', () => {
  beforeEach(() => {
    mockConn.exec('DELETE FROM camara_candidaturas_tse;');
  });

  it('grava cada candidatura com a origem no dataset do TSE', () => {
    salvarCandidaturasTse([candidatura()], { urlOrigem: URL_ORIGEM });

    expect(listarCandidaturasTse()).toEqual([
      expect.objectContaining({ ...candidatura(), url_origem: URL_ORIGEM }),
    ]);
  });

  it('reimportar não duplica e atualiza votos e situação', () => {
    salvarCandidaturasTse([candidatura()], { urlOrigem: URL_ORIGEM });

    const resultado = salvarCandidaturasTse([candidatura({ votos: 111, situacao: 'SUPLENTE' })], {
      urlOrigem: URL_ORIGEM,
    });

    expect(resultado).toEqual({ novos: 0, atualizados: 1 });
    expect(listarCandidaturasTse()).toHaveLength(1);
    expect(listarCandidaturasTse()[0]).toMatchObject({ votos: 111, situacao: 'SUPLENTE' });
  });

  it('conta novos na primeira importação', () => {
    const resultado = salvarCandidaturasTse(
      [candidatura(), candidatura({ sq_candidato: '1', nome_urna: 'LUIZ PAULO' })],
      { urlOrigem: URL_ORIGEM }
    );

    expect(resultado).toEqual({ novos: 2, atualizados: 0 });
  });

  it('recusa gravar sem url_origem', () => {
    expect(() => salvarCandidaturasTse([candidatura()], { urlOrigem: '' })).toThrow(/url_origem/);
  });

  it('lista da eleição mais recente, do mais votado ao menos votado', () => {
    salvarCandidaturasTse(
      [
        candidatura({ sq_candidato: '1', votos: 12 }),
        candidatura({ sq_candidato: '2', votos: 130 }),
        candidatura({ sq_candidato: '3', votos: 500, ano_eleicao: 2020 }),
      ],
      { urlOrigem: URL_ORIGEM }
    );

    expect(listarCandidaturasTse().map(c => c.sq_candidato)).toEqual(['2', '1', '3']);
  });
});
