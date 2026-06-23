'use strict';

/**
 * Extração de entidades a partir dos resumos IA já produzidos.
 * Lê resumo_json de documentos_resumos_ai e enriquece licitacoes_detalhes
 * com vencedor, CNPJ e valor final quando o campo ainda estiver vazio.
 *
 * Não chama a IA — opera apenas sobre dados já armazenados.
 * Seguro para rodar repetidamente (idempotente por condição IS NULL).
 */

const logger = require('../logger');
const { db } = require('../db');

// ── Helpers de extração ───────────────────────────────────────────────────────

function normalizarCnpj(str) {
  if (!str) {return null;}
  const clean = String(str).replace(/\D/g, '');
  return clean.length === 14 ? clean : null;
}

function extrairVencedor(resumoJson) {
  const partes = resumoJson?.partes_envolvidas;
  if (!Array.isArray(partes) || partes.length === 0) {return null;}

  // Procura "contratado" — o vencedor/empresa contratada
  const contratado = partes.find((p) => p.papel === 'contratado');
  if (!contratado?.nome) {return null;}

  // Extrai CNPJ do campo documento (pode conter "CNPJ: 00.000.000/0000-00")
  const cnpj = normalizarCnpj(contratado.documento);

  return { nome: String(contratado.nome).trim(), cnpj };
}

function extrairValorFinal(resumoJson) {
  const valores = resumoJson?.valores;
  if (!Array.isArray(valores) || valores.length === 0) {return null;}

  // Preferência: tipo 'final', depois 'estimado'
  const final = valores.find((v) => v.tipo === 'final');
  if (final?.valor && typeof final.valor === 'number') {return final.valor;}

  return null;
}

function extrairValorEstimado(resumoJson) {
  const valores = resumoJson?.valores;
  if (!Array.isArray(valores) || valores.length === 0) {return null;}
  const est = valores.find((v) => v.tipo === 'estimado');
  return est?.valor && typeof est.valor === 'number' ? est.valor : null;
}

// ── Upsert local (origem = 'resumo_ai') ───────────────────────────────────────

const upsertStmt = db.prepare(`
  INSERT INTO licitacoes_detalhes (documento_id, vencedor_nome, vencedor_cnpj, valor_final, origem, atualizado_em)
  VALUES (@documento_id, @vencedor_nome, @vencedor_cnpj, @valor_final, 'resumo_ai', @now)
  ON CONFLICT(documento_id) DO UPDATE SET
    vencedor_nome = CASE WHEN licitacoes_detalhes.vencedor_nome IS NULL AND @vencedor_nome IS NOT NULL
                         THEN @vencedor_nome ELSE licitacoes_detalhes.vencedor_nome END,
    vencedor_cnpj = CASE WHEN licitacoes_detalhes.vencedor_cnpj IS NULL AND @vencedor_cnpj IS NOT NULL
                         THEN @vencedor_cnpj ELSE licitacoes_detalhes.vencedor_cnpj END,
    valor_final   = CASE WHEN licitacoes_detalhes.valor_final IS NULL AND @valor_final IS NOT NULL
                         THEN @valor_final ELSE licitacoes_detalhes.valor_final END,
    origem        = CASE WHEN licitacoes_detalhes.vencedor_nome IS NULL
                         THEN 'resumo_ai' ELSE licitacoes_detalhes.origem END,
    atualizado_em = @now
`);

// ── Execução principal ────────────────────────────────────────────────────────

/**
 * Processa todos os resumos AI e extrai entidades para licitacoes_detalhes.
 * Retorna estatísticas de enriquecimento.
 */
function extractEntitiesFromResumes() {
  // Busca resumos que pertencem a editais (tipo mais provável de ter vencedor)
  const resumos = db.prepare(`
    SELECT ra.documento_id, ra.resumo_json, d.tipo
    FROM documentos_resumos_ai ra
    JOIN documentos d ON d.id = ra.documento_id
    WHERE ra.resumo_json IS NOT NULL
      AND d.tipo IN ('edital', 'contrato')
    ORDER BY d.ano DESC
  `).all();

  let processados = 0;
  let comVencedor = 0;
  let comValorFinal = 0;
  let erros = 0;
  const now = new Date().toISOString();

  for (const row of resumos) {
    try {
      const json = JSON.parse(row.resumo_json);
      const vencedor = extrairVencedor(json);
      const valorFinal = extrairValorFinal(json);
      const valorEstimado = extrairValorEstimado(json);

      if (!vencedor && valorFinal === null && valorEstimado === null) {continue;}

      upsertStmt.run({
        documento_id: row.documento_id,
        vencedor_nome: vencedor?.nome || null,
        vencedor_cnpj: vencedor?.cnpj || null,
        valor_final: valorFinal,
        now,
      });

      processados++;
      if (vencedor?.nome) {comVencedor++;}
      if (valorFinal !== null) {comValorFinal++;}
    } catch (err) {
      erros++;
      logger.warn('extract-entities: erro ao processar resumo', {
        documento_id: row.documento_id,
        erro: err.message,
      });
    }
  }

  logger.info('extract-entities: concluído', {
    total_resumos: resumos.length,
    processados,
    com_vencedor: comVencedor,
    com_valor_final: comValorFinal,
    erros,
  });

  return { total_resumos: resumos.length, processados, com_vencedor: comVencedor, com_valor_final: comValorFinal, erros };
}

module.exports = { extractEntitiesFromResumes, extrairVencedor, extrairValorFinal };
