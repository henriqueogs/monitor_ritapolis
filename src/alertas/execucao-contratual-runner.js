'use strict';

/**
 * Runner do detector "empenhado acima do contratado". Lê processos e empenhos,
 * roda o detector puro e grava cada sinal como descoberta em 'revisao' (nunca
 * publica sozinho). Evidências: o trecho do contrato publicado e os empenhos com
 * deep-link do portal (§11.3). Idempotente por chave_unica; decisões humanas
 * (rejeitado/publicado com as mesmas evidências) são preservadas pelo upsert.
 */

const crypto = require('node:crypto');
const logger = require('../logger');
const repo = require('../db/execucao-contratual-repo');
const { getDespesasPorIds } = require('../db/transparencia-agregados-repo');
const { upsertAlerta } = require('../db/alertas-repo');
const { buildPortalDespesaLink } = require('../transparencia/portal-links');
const { detectarEmpenhadoAcimaContratado } = require('./detectores/empenhado-acima-contratado');
const { formatBRL } = require('./tipos');

const TIPO = 'execucao_contratual';
const SUBCATEGORIA = 'empenhado_acima_contratado';
const QUALIDADE_VERSAO = 'execucao-contratual-v1';
const RAZAO_CRITICA = 2;
const MAX_EMPENHOS_EVIDENCIA = 10;
const TRECHO_MAX = 200;

function periodo(sinal) {
  return sinal.ano_inicio === sinal.ano_fim ? `${sinal.ano_inicio}` : `${sinal.ano_inicio}–${sinal.ano_fim}`;
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
    trecho_fonte: sinal.trecho_contrato,
    metadados: { descricao: `Valor do contrato publicado: ${formatBRL(sinal.valor_contrato)}${onde}` },
  };
}

// Junta a cada processo os anexos de contrato dele (fontes do valor).
function processosComFontes() {
  const anexosPorDocumento = new Map();
  for (const anexo of repo.listarAnexosDeContrato()) {
    const lista = anexosPorDocumento.get(anexo.documento_id) || [];
    lista.push(anexo);
    anexosPorDocumento.set(anexo.documento_id, lista);
  }
  return repo.listarProcessosComTextoContrato().map((processo) => ({
    ...processo,
    fontes: anexosPorDocumento.get(processo.documento_id) || [],
  }));
}

// O hash padrão do repo usa documento/papel/trecho; empenhos com o mesmo histórico
// colidiriam e só o primeiro seria gravado. O id do empenho torna cada um único.
function hashEmpenho(id) {
  return crypto.createHash('sha256').update(`empenho:${id}`, 'utf8').digest('hex');
}

function evidenciaEmpenho(d) {
  return {
    documento_id: null,
    evidencia_hash: hashEmpenho(d.id),
    papel: 'empenho',
    trecho_fonte: (d.historico || '').slice(0, TRECHO_MAX) || null,
    metadados: {
      empenho_id: d.id,
      empenho: d.empenho,
      exercicio: d.exercicio_orcamento,
      valor: d.valor,
      credor_nome: d.credor_nome,
      portal_url: buildPortalDespesaLink({ empenho: d.empenho, exercicio: d.exercicio_orcamento, tipo: d.tipo }).url,
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
      `Os empenhos de ${periodo(sinal)} para ${sinal.credor_nome} que citam o Processo ${sinal.processo} ` +
      `somam ${formatBRL(sinal.valor_empenhado)}. O contrato publicado nesse processo é de ` +
      `${formatBRL(sinal.valor_contrato)}. A diferença pode ter explicação (aditivo, reajuste ou ` +
      'empenho que cita o processo errado); confira o contrato e os empenhos vinculados abaixo.',
    periodo_inicio: `${sinal.ano_inicio}-01-01`,
    periodo_fim: `${sinal.ano_fim}-12-31`,
    valor_total: sinal.valor_empenhado,
    valor_periodo_label: `Empenhado em ${periodo(sinal)}`,
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
      unidade: 'R$',
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
      campos_a_verificar: ['valor do contrato', 'aditivos', 'número do processo citado nos empenhos'],
      lacunas_deterministicas: [
        'aditivos e apostilamentos nem sempre estão publicados no acervo',
        'em adesão a ata de registro de preços, pode haver mais de uma compra (e contrato) no mesmo processo',
      ],
    },
  };
}

function gerarDescobertasExecucao({ dryRun = false } = {}) {
  const sinais = detectarEmpenhadoAcimaContratado({
    processos: processosComFontes(),
    empenhos: repo.listarEmpenhosQueCitamProcesso(),
  });
  let gravados = 0;
  for (const sinal of sinais) {
    if (dryRun) {
      continue;
    }
    try {
      const empenhos = getDespesasPorIds(sinal.empenho_ids).slice(0, MAX_EMPENHOS_EVIDENCIA);
      upsertAlerta(
        sinalParaAlerta(sinal),
        [{ documento_id: sinal.documento_id, papel: 'contrato', trecho_fonte: sinal.trecho_contrato }],
        [evidenciaContrato(sinal), ...empenhos.map(evidenciaEmpenho)]
      );
      gravados += 1;
    } catch (err) {
      logger.error('execucao-contratual-runner: falha ao gravar descoberta', {
        processo: sinal.processo,
        erro: err.message,
      });
    }
  }
  return { sinais, gravados, dryRun };
}

module.exports = { gerarDescobertasExecucao, sinalParaAlerta };
