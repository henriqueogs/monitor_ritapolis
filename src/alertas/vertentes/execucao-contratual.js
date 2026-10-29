'use strict';

/**
 * Vertente "empenhado acima do contratado": adapta o detector puro ao contrato do orquestrador.
 * Contexto: { processos (com fontes), empenhos, empenhosPorId: Map<id, despesa> } já carregados
 * pelo chamador. Evidências: o trecho do contrato publicado e os empenhos com deep-link do
 * portal (§11.3). O alerta mantém tipo, chave e qualidade_versao do runner anterior.
 */

const crypto = require('node:crypto');
const { detectarEmpenhadoAcimaContratado } = require('../detectores/empenhado-acima-contratado');
const { buildPortalDespesaLink } = require('../../transparencia/portal-links');
const { formatBRL } = require('../tipos');

const TIPO = 'execucao_contratual';
const SUBCATEGORIA = 'empenhado_acima_contratado';
const QUALIDADE_VERSAO = 'execucao-contratual-v1';
const RAZAO_CRITICA = 2;
const MAX_EMPENHOS_EVIDENCIA = 10;
const TRECHO_MAX = 200;
const MOEDA = 'R$';

function periodoLabel(sinal) {
  return sinal.ano_inicio === sinal.ano_fim
    ? `${sinal.ano_inicio}`
    : `${sinal.ano_inicio}–${sinal.ano_fim}`;
}

function formatarRazao(razao) {
  return razao.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

function evidenciaContrato(sinal) {
  const onde = sinal.anexo_nome ? ` (lido em ${sinal.anexo_nome})` : '';
  return {
    documento_id: sinal.documento_id,
    anexo_id: sinal.anexo_id || null,
    papel: 'contrato',
    trecho: sinal.trecho_contrato,
    url_origem: sinal.url_pdf || sinal.url_origem || null,
    metadados: {
      descricao: `Valor do contrato publicado: ${formatBRL(sinal.valor_contrato)}${onde}`,
    },
  };
}

// O hash padrão do repo usa documento/papel/trecho; empenhos com o mesmo histórico
// colidiriam e só o primeiro seria gravado. O id do empenho torna cada um único.
function hashEmpenho(id) {
  return crypto.createHash('sha256').update(`empenho:${id}`, 'utf8').digest('hex');
}

function evidenciaEmpenho(d) {
  const url = buildPortalDespesaLink({
    empenho: d.empenho,
    exercicio: d.exercicio_orcamento,
    tipo: d.tipo,
  }).url;
  return {
    documento_id: null,
    evidencia_hash: hashEmpenho(d.id),
    papel: 'empenho',
    trecho: (d.historico || '').slice(0, TRECHO_MAX) || null,
    url_origem: url,
    metadados: {
      empenho_id: d.id,
      empenho: d.empenho,
      exercicio: d.exercicio_orcamento,
      valor: d.valor,
      credor_nome: d.credor_nome,
      portal_url: url,
    },
  };
}

// Puro: sinal do detector → alerta no formato do alertas-repo.
function sinalParaAlerta(sinal) {
  const razao = formatarRazao(sinal.razao);
  return {
    tipo: TIPO,
    categoria: 'Execução de contratos',
    subcategoria: SUBCATEGORIA,
    severidade: sinal.razao >= RAZAO_CRITICA ? 'critico' : 'atencao',
    titulo: `${sinal.credor_nome}: empenhos do Processo ${sinal.processo} somam ${razao}× o valor do contrato`,
    narrativa:
      `Os empenhos de ${periodoLabel(sinal)} para ${sinal.credor_nome} que citam o Processo ${sinal.processo} ` +
      `somam ${formatBRL(sinal.valor_empenhado)}. O contrato publicado nesse processo é de ` +
      `${formatBRL(sinal.valor_contrato)}. A diferença pode ter explicação (aditivo, reajuste ou ` +
      'empenho que cita o processo errado); confira o contrato e os empenhos vinculados abaixo.',
    periodo_inicio: `${sinal.ano_inicio}-01-01`,
    periodo_fim: `${sinal.ano_fim}-12-31`,
    valor_total: sinal.valor_empenhado,
    valor_periodo_label: `Empenhado em ${periodoLabel(sinal)}`,
    documentos_ids: [sinal.documento_id],
    questionamentos: [
      `Há aditivo ou apostilamento que eleve o valor do contrato do Processo ${sinal.processo}?`,
      'Os empenhos citam o processo correto?',
    ],
    confianca: 0.9,
    chave_unica: `execucao|${sinal.processo}|${sinal.credor_cnpj}`,
    estado_editorial: 'revisao',
    estado_editorial_origem: 'gerador_factual',
    qualidade_versao: QUALIDADE_VERSAO,
    qualidade_motivos: [],
    metadados: {
      regra: SUBCATEGORIA,
      unidade: MOEDA,
      ano: sinal.ano_fim,
      metricas_deterministicas: {
        valor_contrato: sinal.valor_contrato,
        valor_empenhado: sinal.valor_empenhado,
        excesso: sinal.excesso,
        razao: Number(sinal.razao.toFixed(2)),
        empenhos: sinal.empenho_ids.length,
      },
      comparativos_deterministicos: {
        processo: sinal.titulo_processo,
        credor: sinal.credor_nome,
        cnpj: sinal.credor_cnpj,
      },
      campos_a_verificar: [
        'valor do contrato',
        'aditivos',
        'número do processo citado nos empenhos',
      ],
      lacunas_deterministicas: [
        'aditivos e apostilamentos nem sempre estão publicados no acervo',
        'em adesão a ata de registro de preços, pode haver mais de uma compra (e contrato) no mesmo processo',
      ],
    },
  };
}

function sinalParaCandidato(sinal, empenhosPorId) {
  const empenhos = sinal.empenho_ids
    .map(id => empenhosPorId.get(id))
    .filter(Boolean)
    .slice(0, MAX_EMPENHOS_EVIDENCIA);
  const alerta = sinalParaAlerta(sinal);
  return {
    objeto: alerta.titulo,
    titulo: alerta.titulo,
    narrativa: alerta.narrativa,
    metrica: { nome: SUBCATEGORIA, unidade: MOEDA, valor: sinal.valor_empenhado },
    evidencias: [evidenciaContrato(sinal), ...empenhos.map(evidenciaEmpenho)],
    documentos: [
      { documento_id: sinal.documento_id, papel: 'contrato', trecho_fonte: sinal.trecho_contrato },
    ],
    periodo: { inicio: alerta.periodo_inicio, fim: alerta.periodo_fim },
    severidade: alerta.severidade,
    alerta,
    sinal,
  };
}

function detectar({ processos = [], empenhos = [], empenhosPorId = new Map() } = {}) {
  return detectarEmpenhadoAcimaContratado({ processos, empenhos }).map(sinal =>
    sinalParaCandidato(sinal, empenhosPorId)
  );
}

module.exports = {
  nome: 'execucao-contratual',
  versao: 1,
  criterio:
    'A soma dos empenhos que citam um processo supera o valor do contrato publicado nesse processo.',
  detectar,
  sinalParaAlerta,
};
