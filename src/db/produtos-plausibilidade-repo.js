'use strict';

/**
 * Gate de plausibilidade item×processo: quarentena produtos cujo valor final
 * excede o valor final do próprio processo (item não pode custar mais que a
 * licitação inteira). Não destrutivo — os valores ficam intactos; a exibição
 * é que respeita a quarentena (`status_revisao='rejeitado'` + validação
 * `implausivel`). Reversível: se o valor for corrigido, o gate libera; produto
 * validado por humano nunca é rebaixado.
 */

const { db } = require('./connection');
const {
  extrairValorFinalEstruturado,
  avaliarValorItemContraProcesso,
  FATOR_MAX_ITEM_VS_PROCESSO,
} = require('../licitacoes/valores');

const FONTE_VALIDACAO = 'plausibilidade_item_processo';
const STATUS_IMPLAUSIVEL = 'implausivel';
const MARCADOR_ORIGEM = 'valor_item_implausivel';
const MARCADOR_RE = /\s*\|?\s*valor_item_implausivel\([^)]*\)/g;

function listarAlvos({ documentoId, ano }) {
  const filters = ['ld.valor_final > 0'];
  const params = [];
  if (documentoId) { filters.push('lp.documento_id = ?'); params.push(Number(documentoId)); }
  if (ano) { filters.push('lp.ano = ?'); params.push(Number(ano)); }

  return db
    .prepare(
      `SELECT lp.*, ld.valor_final AS valor_final_processo
       FROM licitacoes_produtos lp
       JOIN licitacoes_detalhes ld ON ld.documento_id = lp.documento_id
       WHERE ${filters.join(' AND ')}`
    )
    .all(...params);
}

function upsertValidacao(produtoId, { status, valorProcesso, campo, payload }) {
  const existente = db
    .prepare('SELECT id FROM licitacoes_produtos_validacoes WHERE produto_id = ? AND fonte = ?')
    .get(produtoId, FONTE_VALIDACAO);
  const payloadJson = JSON.stringify(payload);
  const agora = new Date().toISOString();

  if (existente) {
    db.prepare(
      `UPDATE licitacoes_produtos_validacoes
       SET status = ?, valor_encontrado = ?, campo_validado = ?, payload_json = ?, validado_em = ?
       WHERE id = ?`
    ).run(status, valorProcesso, campo, payloadJson, agora, existente.id);
    return;
  }
  db.prepare(
    `INSERT INTO licitacoes_produtos_validacoes
       (produto_id, fonte, valor_encontrado, campo_validado, status, payload_json, validado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(produtoId, FONTE_VALIDACAO, valorProcesso, campo, status, payloadJson, agora);
}

function quarentenar(produto, { campo, valorItem, razao, fator }) {
  const jaMarcado = String(produto.origem_detalhe || '').includes(MARCADOR_ORIGEM);
  if (!jaMarcado) {
    const anotacao = `${MARCADOR_ORIGEM}(item=${valorItem};processo=${produto.valor_final_processo};fator=${fator})`;
    db.prepare(
      `UPDATE licitacoes_produtos
       SET status_revisao = CASE WHEN status_revisao = 'validado' THEN status_revisao ELSE 'rejeitado' END,
           origem_detalhe = TRIM(IFNULL(origem_detalhe, '') || ' | ' || ?)
       WHERE id = ?`
    ).run(anotacao, produto.id);
  }
  upsertValidacao(produto.id, {
    status: STATUS_IMPLAUSIVEL,
    valorProcesso: produto.valor_final_processo,
    campo,
    payload: { valor_item: valorItem, razao, fator, motivo: 'item_excede_valor_processo' },
  });
  return jaMarcado;
}

function liberar(produto, { campo, valorItem, razao, fator }) {
  const origemLimpa = String(produto.origem_detalhe || '').replace(MARCADOR_RE, '').trim();
  db.prepare(
    `UPDATE licitacoes_produtos
     SET status_revisao = CASE WHEN status_revisao = 'rejeitado' THEN 'pendente' ELSE status_revisao END,
         origem_detalhe = ?
     WHERE id = ?`
  ).run(origemLimpa || null, produto.id);
  upsertValidacao(produto.id, {
    status: 'validado',
    valorProcesso: produto.valor_final_processo,
    campo,
    payload: { valor_item: valorItem, razao, fator, motivo: 'liberado_apos_correcao' },
  });
}

/**
 * @returns {{ avaliados, quarentenados, ja_quarentenados, liberados, detalhes: [] }}
 */
function aplicarGatePlausibilidadeItemProcesso({
  documentoId,
  ano,
  fator = FATOR_MAX_ITEM_VS_PROCESSO,
  dryRun = false,
} = {}) {
  const alvos = listarAlvos({ documentoId, ano });
  const resumo = { avaliados: 0, quarentenados: 0, ja_quarentenados: 0, liberados: 0, dryRun, detalhes: [] };

  for (const produto of alvos) {
    const estruturado = extrairValorFinalEstruturado(produto);
    if (!estruturado) {continue;}
    resumo.avaliados += 1;

    const { plausivel, razao } = avaliarValorItemContraProcesso({
      valorItem: estruturado.valor,
      valorFinalProcesso: produto.valor_final_processo,
      fator,
    });
    const jaMarcado = String(produto.origem_detalhe || '').includes(MARCADOR_ORIGEM);

    if (!plausivel) {
      resumo.detalhes.push({
        produto_id: produto.id,
        documento_id: produto.documento_id,
        campo: estruturado.campo,
        valor_item: estruturado.valor,
        valor_processo: produto.valor_final_processo,
        razao,
      });
      const humanoValidado = produto.status_revisao === 'validado';
      if (jaMarcado) {
        resumo.ja_quarentenados += 1;
      } else if (!humanoValidado) {
        resumo.quarentenados += 1;
      }
      if (!dryRun) {
        if (humanoValidado) {
          // Humano validou — não rebaixa, mas registra a validação pra auditoria
          upsertValidacao(produto.id, {
            status: STATUS_IMPLAUSIVEL,
            valorProcesso: produto.valor_final_processo,
            campo: estruturado.campo,
            payload: { valor_item: estruturado.valor, razao, fator, motivo: 'item_excede_valor_processo' },
          });
        } else {
          quarentenar(produto, { campo: estruturado.campo, valorItem: estruturado.valor, razao, fator });
        }
      }
      continue;
    }

    if (jaMarcado && !dryRun) {
      liberar(produto, { campo: estruturado.campo, valorItem: estruturado.valor, razao, fator });
      resumo.liberados += 1;
    }
  }

  return resumo;
}

module.exports = {
  aplicarGatePlausibilidadeItemProcesso,
  FONTE_VALIDACAO,
  STATUS_IMPLAUSIVEL,
  MARCADOR_ORIGEM,
};
