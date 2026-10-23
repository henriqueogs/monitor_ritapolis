'use strict';

// Revalidação determinística de um alerta já gravado: lista o que impede ou
// pede conferência antes de publicar. Puro (sem banco): recebe o alerta como
// `alertas-repo.getAlerta` devolve (com `documentos` e `evidencias`).
//
// Não decide pelo revisor — aponta pendências com a regra que as gerou. Usado
// pela tela de detalhe do admin e pelo script de revalidação em lote.

const { termosAcusatorios } = require('../ai/eval/metricas-geracao');

const GRAVIDADE = Object.freeze({ BLOQUEIA: 'bloqueia', ATENCAO: 'atencao', INFO: 'info' });

const RECOMENDACAO = Object.freeze({
  NAO_PUBLICAR: 'nao_publicar',
  CONFERIR: 'conferir',
  OK: 'ok',
});

const PENDENCIAS = Object.freeze({
  SEM_EVIDENCIA: 'SEM_EVIDENCIA',
  SEM_FONTE: 'SEM_FONTE',
  NOME_PLACEHOLDER: 'NOME_PLACEHOLDER',
  LINGUAGEM_ACUSATORIA: 'LINGUAGEM_ACUSATORIA',
  RISCO_SO_DA_IA: 'RISCO_SO_DA_IA',
  PUBLICADO_SEM_GATE: 'PUBLICADO_SEM_GATE',
  NAO_INVESTIGADO: 'NAO_INVESTIGADO',
  GATE_REPROVADO: 'GATE_REPROVADO',
  LEGADO: 'LEGADO',
  VALOR_SEM_PERIODO: 'VALOR_SEM_PERIODO',
});

const TIPO_RISCO_IA = 'riscos.alerta_resumo_ia';
const KIND_FACTUAL = 'investigacao_factual';
const MOTIVO_LEGADO = 'LEGACY_NO_QUALITY_GATE';
const STATUS_APROVADO = 'aprovado';
const STATUS_REPROVADO = 'reprovado';
const ESTADO_PUBLICADO = 'publicado';

// Lacuna de modelo de contrato ("Empresa _________") ou máscara ("XXXXX")
// extraída como se fosse nome.
const PADRAO_PLACEHOLDER = /_{3,}|\bX{4,}\b|\.{5,}/;

const ehUrlHttp = (valor) => /^https?:\/\//i.test(String(valor ?? '').trim());

function urlsDaEvidencia(evidencia, documentosPorId) {
  const documento = documentosPorId.get(Number(evidencia.documento_id));
  return [
    evidencia.anexo_url,
    evidencia.metadados?.anexo_url,
    evidencia.metadados?.url_origem,
    evidencia.metadados?.portal_url,
    documento?.url_pdf,
    documento?.url_origem,
  ].filter(ehUrlHttp);
}

function checarEvidencias(alerta) {
  const evidencias = alerta.evidencias || [];
  const documentos = alerta.documentos || [];
  if (!evidencias.length && !documentos.length) {
    return [{
      codigo: PENDENCIAS.SEM_EVIDENCIA,
      gravidade: GRAVIDADE.BLOQUEIA,
      mensagem: 'Nenhum documento ou evidência vinculado: não há como conferir o achado.',
    }];
  }
  const documentosPorId = new Map(documentos.map((d) => [Number(d.documento_id), d]));
  const itens = evidencias.length ? evidencias : documentos;
  const semFonte = itens.filter((item) => !urlsDaEvidencia(item, documentosPorId).length);
  if (!semFonte.length) {
    return [];
  }
  const todas = semFonte.length === itens.length;
  return [{
    codigo: PENDENCIAS.SEM_FONTE,
    gravidade: todas ? GRAVIDADE.BLOQUEIA : GRAVIDADE.ATENCAO,
    mensagem: todas
      ? 'Nenhuma evidência tem link para a fonte oficial (§11.3).'
      : `${semFonte.length} de ${itens.length} evidências sem link para a fonte oficial.`,
  }];
}

function textosPublicos(alerta) {
  const comparativos = alerta.metadados?.comparativos_deterministicos || {};
  return [alerta.titulo, alerta.narrativa, comparativos.fornecedor].filter(Boolean).join('\n');
}

function checarTexto(alerta) {
  const texto = textosPublicos(alerta);
  const pendencias = [];
  if (PADRAO_PLACEHOLDER.test(texto)) {
    pendencias.push({
      codigo: PENDENCIAS.NOME_PLACEHOLDER,
      gravidade: GRAVIDADE.BLOQUEIA,
      mensagem: 'O nome no alerta é um campo em branco de modelo de documento, não um fornecedor real.',
    });
  }
  const termos = termosAcusatorios(texto);
  if (termos.length) {
    pendencias.push({
      codigo: PENDENCIAS.LINGUAGEM_ACUSATORIA,
      gravidade: GRAVIDADE.BLOQUEIA,
      mensagem: `Linguagem acusatória no texto (${termos.join(', ')}): reescrever como fato + fonte + critério.`,
    });
  }
  return pendencias;
}

function checarOrigem(alerta) {
  const metadados = alerta.metadados || {};
  const qualidade = metadados.discovery_v3?.qualidade;
  const pendencias = [];
  if (metadados.investigacao_tipo === TIPO_RISCO_IA) {
    pendencias.push({
      codigo: PENDENCIAS.RISCO_SO_DA_IA,
      gravidade: GRAVIDADE.ATENCAO,
      mensagem: 'O risco vem da leitura da IA sobre o resumo, não de um trecho literal: conferir no documento oficial.',
    });
  }
  if ((alerta.qualidade_motivos || []).includes(MOTIVO_LEGADO)) {
    pendencias.push({
      codigo: PENDENCIAS.LEGADO,
      gravidade: GRAVIDADE.ATENCAO,
      mensagem: 'Gerado pelo detector antigo, que não passa pelo gate de qualidade atual.',
    });
  }
  if (alerta.estado_editorial === ESTADO_PUBLICADO && qualidade?.factual_status !== STATUS_APROVADO) {
    pendencias.push({
      codigo: PENDENCIAS.PUBLICADO_SEM_GATE,
      gravidade: GRAVIDADE.ATENCAO,
      mensagem: 'Está publicado sem ter passado pelo gate factual atual.',
    });
  } else if (metadados.discovery_kind === KIND_FACTUAL && !qualidade) {
    pendencias.push({
      codigo: PENDENCIAS.NAO_INVESTIGADO,
      gravidade: GRAVIDADE.INFO,
      mensagem: 'A IA ainda não investigou este candidato (use "Reprocessar").',
    });
  }
  if (qualidade?.status === STATUS_REPROVADO) {
    pendencias.push({
      codigo: PENDENCIAS.GATE_REPROVADO,
      gravidade: GRAVIDADE.ATENCAO,
      mensagem: 'A investigação da IA foi reprovada pelo gate de qualidade.',
      detalhes: qualidade.motivos || [],
    });
  }
  return pendencias;
}

function checarPeriodo(alerta) {
  const temValor = alerta.valor_total !== null && alerta.valor_total !== undefined;
  const temPeriodo = alerta.valor_periodo_label || alerta.periodo_inicio || alerta.metadados?.ano;
  if (!temValor || temPeriodo) {
    return [];
  }
  return [{
    codigo: PENDENCIAS.VALOR_SEM_PERIODO,
    gravidade: GRAVIDADE.ATENCAO,
    mensagem: 'Há um total sem o período a que se refere (§11.1).',
  }];
}

function recomendar(pendencias) {
  if (pendencias.some((p) => p.gravidade === GRAVIDADE.BLOQUEIA)) {
    return RECOMENDACAO.NAO_PUBLICAR;
  }
  if (pendencias.some((p) => p.gravidade === GRAVIDADE.ATENCAO)) {
    return RECOMENDACAO.CONFERIR;
  }
  return RECOMENDACAO.OK;
}

function avaliarAlerta(alerta) {
  const pendencias = [
    ...checarEvidencias(alerta),
    ...checarTexto(alerta),
    ...checarOrigem(alerta),
    ...checarPeriodo(alerta),
  ];
  return { pendencias, recomendacao: recomendar(pendencias) };
}

function contar(chaves) {
  const out = {};
  for (const chave of chaves) {
    out[chave] = (out[chave] || 0) + 1;
  }
  return out;
}

function resumirRevalidacao(itens) {
  return {
    total: itens.length,
    por_recomendacao: contar(itens.map((item) => item.recomendacao)),
    por_pendencia: contar(itens.flatMap((item) => item.pendencias.map((p) => p.codigo))),
  };
}

module.exports = {
  avaliarAlerta,
  resumirRevalidacao,
  PENDENCIAS,
  GRAVIDADE,
  RECOMENDACAO,
};
