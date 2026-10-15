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

const {
  listLicitacoes,
  getDocumentoById,
  getInteligenciaPanorama,
  getCoberturaPorAno,
} = require('./index');

// Quatro licitações de 2026, uma por tipo de origem do valor_final:
//  1 = IA (legítimo) · 2 = legado derivado de empenho · 3 = rótulo atual · 4 = ata (legítimo)
const CASOS = [
  { id: 1, valor: 1000, origem: 'resumo_ai', detalhe: null },
  { id: 2, valor: 5000, origem: 'portal_transparencia', detalhe: null },
  { id: 3, valor: 300, origem: 'portal_transparencia', detalhe: 'empenho_agregado' },
  { id: 4, valor: 700, origem: 'portal_transparencia', detalhe: 'ATA.pdf' },
];

describe('guard de leitura do valor_final (empenhado não é homologado)', () => {
  beforeEach(() => {
    mockConn.exec('DELETE FROM licitacoes_detalhes; DELETE FROM documentos;');
    for (const c of CASOS) {
      mockConn
        .prepare(
          `INSERT INTO documentos (id, fonte, tipo, titulo, numero, ano, url_origem, data_publicacao)
           VALUES (?, 'site_prefeitura', 'edital', ?, ?, 2026, 'https://x/y', '2026-03-0${c.id}')`
        )
        .run(c.id, `Pregão ${c.id}/2026`, `${c.id}/2026`);
      mockConn
        .prepare(
          `INSERT INTO licitacoes_detalhes (documento_id, vencedor_nome, vencedor_cnpj, valor_final, origem, origem_detalhe)
           VALUES (?, 'EMPRESA', '11111111111111', ?, ?, ?)`
        )
        .run(c.id, c.valor, c.origem, c.detalhe);
    }
  });

  it('listLicitacoes: valor derivado de empenho vem nulo; IA e ata permanecem', () => {
    const { dados } = listLicitacoes({ ano: 2026, limite: 20 });

    const porId = Object.fromEntries(dados.map((d) => [d.id, d.valor_final]));
    expect(porId).toEqual({ 1: 1000, 2: null, 3: null, 4: 700 });
  });

  it('getDocumentoById: o detalhe da licitação também esconde o valor derivado', () => {
    expect(getDocumentoById(1).licitacao_detalhes.valor_final).toBe(1000);
    expect(getDocumentoById(2).licitacao_detalhes.valor_final).toBeNull();
    expect(getDocumentoById(3).licitacao_detalhes.valor_final).toBeNull();
    expect(getDocumentoById(4).licitacao_detalhes.valor_final).toBe(700);
  });

  it('getDocumentoById explica por que o valor foi ocultado', () => {
    expect(getDocumentoById(2).licitacao_detalhes.valor_final_oculto).toBe('derivado_de_empenho');
    expect(getDocumentoById(1).licitacao_detalhes.valor_final_oculto).toBeUndefined();
  });

  it('panorama de inteligência: totais de valor final só somam valor homologado', () => {
    const p = getInteligenciaPanorama();

    expect(p.resumo.valor_vencedor_identificado).toBe(1700); // 1000 + 700
    expect(p.por_ano[0].valor_final_total).toBe(1700);
    // com vencedor mas sem valor: os dois derivados de empenho passam a contar como "sem valor"
    expect(p.alertas.sem_valor_vencedor).toBe(2);
  });

  it('cobertura por ano: "com valor" não conta o valor derivado de empenho', () => {
    const ano2026 = getCoberturaPorAno().find((r) => r.ano === 2026);

    expect(ano2026.valor_pct).toBe(50); // 2 de 4 (IA e ata)
  });
});
