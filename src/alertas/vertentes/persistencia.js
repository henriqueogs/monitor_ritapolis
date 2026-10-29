'use strict';

/**
 * Candidato de vertente → alerta no formato do alertas-repo. Todo candidato entra em
 * 'revisao' (nunca publica sozinho); a publicação passa pelo gate determinístico e pela
 * conferência humana. Idempotente por chave_unica (objeto + período).
 */

const crypto = require('node:crypto');
const logger = require('../../logger');
const { formatBRL } = require('../tipos');

const MOEDA = 'R$';
const CHAVE_HASH_CHARS = 16;

function limitesPeriodo(periodo) {
  if (periodo.inicio && periodo.fim) {
    return { inicio: periodo.inicio, fim: periodo.fim };
  }
  return { inicio: `${periodo.ano}-01-01`, fim: `${periodo.ano}-12-31` };
}

function rotuloPeriodo(periodo) {
  return periodo.ano ? String(periodo.ano) : `${periodo.inicio} a ${periodo.fim}`;
}

function chaveUnica(candidato) {
  const base = `${candidato.objeto}|${JSON.stringify(candidato.periodo)}`;
  const hash = crypto.createHash('sha256').update(base, 'utf8').digest('hex');
  return `vertente|${candidato.vertente}|${hash.slice(0, CHAVE_HASH_CHARS)}`;
}

function evidenciaParaRepo(evidencia) {
  const {
    documento_id: documentoId,
    anexo_id: anexoId,
    trecho,
    papel,
    evidencia_hash: evidenciaHash,
    metadados,
    ...resto
  } = evidencia;
  return {
    documento_id: documentoId ?? null,
    anexo_id: anexoId ?? null,
    papel: papel || 'fonte',
    trecho_fonte: trecho || null,
    ...(evidenciaHash ? { evidencia_hash: evidenciaHash } : {}),
    metadados: { ...resto, ...metadados },
  };
}

function candidatoParaAlerta(candidato) {
  const limites = limitesPeriodo(candidato.periodo);
  const monetario = candidato.metrica.unidade === MOEDA;
  const alerta = {
    tipo: `vertente_${candidato.vertente}`,
    categoria: candidato.categoria || 'Vertentes',
    subcategoria: candidato.vertente,
    severidade: candidato.severidade,
    titulo: candidato.titulo || candidato.objeto,
    narrativa: candidato.narrativa || candidato.objeto,
    periodo_inicio: limites.inicio,
    periodo_fim: limites.fim,
    valor_total: monetario ? candidato.metrica.valor : null,
    valor_periodo_label: monetario
      ? `${formatBRL(candidato.metrica.valor)} em ${rotuloPeriodo(candidato.periodo)}`
      : null,
    documentos_ids: candidato.evidencias.map(e => e.documento_id).filter(Boolean),
    questionamentos: candidato.questionamentos || [],
    confianca: candidato.confianca ?? 0.8,
    chave_unica: chaveUnica(candidato),
    estado_editorial: 'revisao',
    estado_editorial_origem: 'gerador_factual',
    qualidade_versao: `vertente-${candidato.vertente}-v${candidato.versao}`,
    qualidade_motivos: [],
    metadados: {
      regra: candidato.vertente,
      metrica: candidato.metrica,
      campos_a_verificar: candidato.campos_a_verificar,
    },
    // Vertente migrada de runner legado pode fixar tipo/chave/rótulos para atualizar o
    // alerta existente em vez de duplicá-lo.
    ...candidato.alerta,
  };
  const documentos =
    candidato.documentos || alerta.documentos_ids.map(id => ({ documento_id: id }));
  return { alerta, documentos, evidencias: candidato.evidencias.map(evidenciaParaRepo) };
}

function persistirCandidatos(candidatos, { upsert, dryRun = false } = {}) {
  let gravados = 0;
  let falhas = 0;
  for (const candidato of candidatos) {
    if (dryRun) {
      continue;
    }
    try {
      const { alerta, documentos, evidencias } = candidatoParaAlerta(candidato);
      upsert(alerta, documentos, evidencias);
      gravados += 1;
    } catch (err) {
      falhas += 1;
      logger.error('vertentes: falha ao gravar candidato', {
        vertente: candidato.vertente,
        erro: err.message,
      });
    }
  }
  return { gravados, falhas };
}

module.exports = { candidatoParaAlerta, persistirCandidatos };
