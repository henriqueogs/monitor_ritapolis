'use strict';

// Ano das emendas = ano de referência da emenda (recebimento/número/início), não o ano em que a
// Prefeitura postou a ficha no site (documentos.ano vem de data_publicacao). CLAUDE.md §11.1.

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

const {
  salvarEmendaDetalhes,
  listarEmendas,
  contarEmendas,
  totaisPorAno,
  parlamentaresComTotais,
} = require('./emendas-repo');

const ANO_POSTAGEM = 2026;

function seedEmenda({ detalhes = null } = {}) {
  const { lastInsertRowid } = mockConn
    .prepare(
      `INSERT INTO documentos (fonte, tipo, titulo, url_origem, ano, data_publicacao)
       VALUES ('site_prefeitura', 'emenda_parlamentar', 'Emenda', 'https://exemplo.gov.br/emendas', ?, '2026-02-10')`
    )
    .run(ANO_POSTAGEM);
  const id = Number(lastInsertRowid);
  if (detalhes) {
    salvarEmendaDetalhes(id, {
      esfera: 'federal',
      numero_emenda: null,
      nome_parlamentar: 'Parlamentar A',
      cargo_parlamentar: null,
      partido: 'XYZ',
      tipo_emenda: null,
      tipo_transferencia: null,
      objeto: null,
      objeto_detalhado: null,
      valor_repasse: 1000,
      valor_repasse_raw: null,
      valor_contrapartida: null,
      orgao_transferidor: null,
      instrumento_legal: null,
      categoria_economica: null,
      unidade_executora: null,
      gestor_responsavel: null,
      data_inicio: null,
      data_termino: null,
      data_recebimento: null,
      dados_despesa: null,
      ano_referencia: null,
      ...detalhes,
    });
  }
  return id;
}

describe('emendas-repo: ano de referência', () => {
  let de2023;
  let de2024;
  let semDetalhes;

  beforeAll(() => {
    de2023 = seedEmenda({ detalhes: { ano_referencia: 2023, valor_repasse: 300 } });
    de2024 = seedEmenda({ detalhes: { ano_referencia: 2024, valor_repasse: 400 } });
    semDetalhes = seedEmenda();
  });

  it('listagem expõe o ano de referência e mantém o ano de publicação', () => {
    // Act
    const porId = Object.fromEntries(listarEmendas().map((e) => [e.id, e]));

    // Assert
    expect(porId[de2023]).toMatchObject({ ano: 2023, ano_publicacao: ANO_POSTAGEM });
    expect(porId[de2024]).toMatchObject({ ano: 2024, ano_publicacao: ANO_POSTAGEM });
    expect(porId[semDetalhes]).toMatchObject({ ano: ANO_POSTAGEM, ano_publicacao: ANO_POSTAGEM });
  });

  it('filtro por ano usa o ano de referência', () => {
    // Act
    const ids = listarEmendas({ ano: 2023 }).map((e) => e.id);

    // Assert
    expect(ids).toEqual([de2023]);
    expect(contarEmendas({ ano: 2023 })).toBe(1);
    expect(contarEmendas({ ano: ANO_POSTAGEM })).toBe(1);
  });

  it('totais por ano somam cada emenda no seu ano de referência', () => {
    // Act
    const totais = totaisPorAno().filter((t) => t.esfera === 'federal');

    // Assert
    expect(totais).toEqual([
      { ano: 2024, esfera: 'federal', total_emendas: 1, soma_repasse: 400 },
      { ano: 2023, esfera: 'federal', total_emendas: 1, soma_repasse: 300 },
    ]);
  });

  it('detalhes sem ano de referência (antes do backfill) caem no ano de publicação', () => {
    // Arrange
    const id = seedEmenda({ detalhes: { esfera: 'estadual', valor_repasse: 50 } });

    // Act
    const emenda = listarEmendas({ ano: ANO_POSTAGEM }).find((e) => e.id === id);

    // Assert
    expect(emenda).toMatchObject({ ano: ANO_POSTAGEM, esfera: 'estadual' });
  });

  it('invariante: soma dos totais por ano = soma geral (sem dupla contagem)', () => {
    // Act
    const somaPorAno = totaisPorAno().reduce((acc, t) => acc + (t.soma_repasse || 0), 0);
    const qtdPorAno = totaisPorAno().reduce((acc, t) => acc + t.total_emendas, 0);
    const geral = mockConn
      .prepare(
        `SELECT COUNT(*) AS qtd, IFNULL(SUM(ed.valor_repasse), 0) AS soma FROM documentos d
         LEFT JOIN emendas_detalhes ed ON ed.documento_id = d.id WHERE d.tipo = 'emenda_parlamentar'`
      )
      .get();

    // Assert
    expect(somaPorAno).toBe(geral.soma);
    expect(qtdPorAno).toBe(geral.qtd);
  });

  it('invariante: ranking do ano soma o mesmo que os totais do ano', () => {
    for (const ano of [2023, 2024]) {
      // Act
      const ranking = parlamentaresComTotais({ ano }).reduce((acc, p) => acc + p.soma_repasse, 0);
      const totais = totaisPorAno()
        .filter((t) => t.ano === ano)
        .reduce((acc, t) => acc + t.soma_repasse, 0);

      // Assert
      expect(ranking).toBe(totais);
    }
  });

  it('ranking de parlamentares filtra pelo ano de referência', () => {
    // Act
    const ranking = parlamentaresComTotais({ ano: 2024 });

    // Assert
    expect(ranking).toEqual([expect.objectContaining({ nome_parlamentar: 'Parlamentar A', soma_repasse: 400 })]);
  });
});
