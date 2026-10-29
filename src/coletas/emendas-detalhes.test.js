'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const mockConn = new DatabaseSync(':memory:');
mockConn.exec(fs.readFileSync(path.resolve(__dirname, '../db/schema.sql'), 'utf8'));
jest.mock('../db/connection', () => ({ db: mockConn }));

const { gravarDetalhesEmenda } = require('./emendas-detalhes');
const { getEmendaDetalhesByDocumentoId } = require('../db/emendas-repo');

const FICHA_FEDERAL =
  'EMENDAS FEDERAIS 1 – DADOS DA INDICAÇÃO N.º DA EMENDA : 202340290015 ' +
  'TIPO DE EMENDA : Individual NOME DO PARLAMENTAR : Fulano - Deputado Federal ' +
  'VALOR DO REPASSE : R$ 100.000,00 DATA DE RECEBIMENTO DO RECURSO: 12/09/2023';

function seedDocumento() {
  const { lastInsertRowid } = mockConn
    .prepare(
      `INSERT INTO documentos (fonte, tipo, titulo, url_origem, ano)
       VALUES ('site_prefeitura', 'emenda_parlamentar', 'Emenda', 'https://exemplo.gov.br/emendas', 2026)`
    )
    .run();
  return Number(lastInsertRowid);
}

describe('gravarDetalhesEmenda (coleta)', () => {
  it('grava os detalhes com o ano de referência da emenda', () => {
    // Arrange
    const id = seedDocumento();

    // Act
    const gravou = gravarDetalhesEmenda(id, { texto: FICHA_FEDERAL, titulo: 'Emendas Federais' });

    // Assert
    expect(gravou).toBe(true);
    expect(getEmendaDetalhesByDocumentoId(id)).toMatchObject({
      esfera: 'federal',
      valor_repasse: 100000,
      ano_referencia: 2023,
    });
  });

  it('texto que não é ficha de emenda não grava nada', () => {
    // Arrange
    const id = seedDocumento();

    // Act
    const gravou = gravarDetalhesEmenda(id, { texto: 'Aviso de licitação qualquer, sem ficha.', titulo: 'Aviso' });

    // Assert
    expect(gravou).toBe(false);
    expect(getEmendaDetalhesByDocumentoId(id)).toBeNull();
  });
});
