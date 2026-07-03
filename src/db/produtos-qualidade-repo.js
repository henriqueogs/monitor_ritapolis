'use strict';

/**
 * Marca linhas-lixo de licitacoes_produtos (fragmentos de OCR sem descrição
 * real: "5091", "| 128.90") como rejeitadas, para que resumos e o painel de
 * qualidade não as contem. Não destrutivo (descrição/valores intactos),
 * idempotente, reversível no /admin/qualidade. O display já as esconde via
 * classificarPapelProduto; isto acerta as contagens e dá trilha de auditoria.
 */

const { db } = require('./connection');
const { detectarLixoProduto } = require('../licitacoes/produto-papel');

const FONTE_VALIDACAO = 'qualidade_item';
const STATUS_DESCARTADO = 'descartado';

function jaMarcado(produtoId) {
  return Boolean(
    db
      .prepare('SELECT 1 FROM licitacoes_produtos_validacoes WHERE produto_id = ? AND fonte = ?')
      .get(produtoId, FONTE_VALIDACAO)
  );
}

function marcarItensLixo({ documentoId, dryRun = false } = {}) {
  const filtro = documentoId ? 'WHERE documento_id = ?' : '';
  const params = documentoId ? [Number(documentoId)] : [];
  const produtos = db.prepare(`SELECT * FROM licitacoes_produtos ${filtro}`).all(...params);

  const resumo = { avaliados: produtos.length, lixo: 0, marcados: 0, ja_marcados: 0, dryRun, exemplos: [] };
  const agora = new Date().toISOString();

  for (const p of produtos) {
    const { lixo, motivo } = detectarLixoProduto(p);
    if (!lixo) {continue;}
    resumo.lixo += 1;
    if (resumo.exemplos.length < 20) {resumo.exemplos.push({ id: p.id, documento_id: p.documento_id, descricao: p.descricao, motivo }); }

    if (jaMarcado(p.id)) { resumo.ja_marcados += 1; continue; }
    if (dryRun) { resumo.marcados += 1; continue; }

    db.prepare(
      `UPDATE licitacoes_produtos
       SET status_revisao = CASE WHEN status_revisao = 'validado' THEN status_revisao ELSE 'rejeitado' END
       WHERE id = ?`
    ).run(p.id);
    db.prepare(
      `INSERT INTO licitacoes_produtos_validacoes (produto_id, fonte, campo_validado, status, payload_json, validado_em)
       VALUES (?, ?, 'descricao', ?, ?, ?)`
    ).run(p.id, FONTE_VALIDACAO, STATUS_DESCARTADO, JSON.stringify({ motivo }), agora);
    resumo.marcados += 1;
  }

  return resumo;
}

module.exports = { marcarItensLixo, FONTE_VALIDACAO, STATUS_DESCARTADO };
