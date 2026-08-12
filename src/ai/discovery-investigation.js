'use strict';

const config = require('../config');
const logger = require('../logger');
const { createAiProvider } = require('./providers');
const { buildDiscoveryInvestigationPrompt, CHECKLISTS } = require('./prompts/discovery-investigation-prompt');
const { validateDiscoveryInvestigation } = require('./contracts/discovery-investigation-contract');
const {
  validarFactual,
  validarEditorial,
  montarDiscoveryV3,
  normalizarInvestigacaoEditorial,
} = require('../alertas/discovery-quality');

const CONTRACT_VERSION = 'discovery-investigation-v2';

function extractJsonObject(raw) {
  const text = String(raw || '').trim();
  if (!text) {
    throw new Error('Resposta vazia da IA');
  }
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('Resposta da IA nao contem JSON valido');
    }
    return JSON.parse(text.slice(start, end + 1));
  }
}

function textoBase(alerta) {
  return [
    alerta.titulo,
    alerta.narrativa,
    ...(alerta.evidencias || []).map((ev) => ev.trecho_fonte || ''),
  ].join('\n').toLowerCase();
}

const PADROES_CAMPO = {
  'laudo tecnico': /\b(laudo|parecer tecnico|relatorio tecnico)\b/i,
  'autorizacao/licenca ambiental': /\b(autorizacao ambiental|licenca ambiental|licenciamento|codema|semad)\b/i,
  'compensacao ou replantio': /\b(compensacao|compensar|replantio|plantio|reposicao)\b/i,
  'localizacao detalhada': /\b(rua|praca|bairro|area urbana|municipio|cidade)\b/i,
  especies: /\b(especie|especies|ipe|sibipiruna|mangueira|eucalipto|aroeira)\b/i,
  'altura ou diametro': /\b(altura|diametro|dap|metros de altura|acima de \d+ metros)\b/i,
  justificativa: /\b(justificativa|risco|necessidade|interferencia|seguranca)\b/i,
  'fotos ou mapas': /\b(foto|fotos|imagem|mapa|croqui|planta)\b/i,
  'responsavel tecnico': /\b(responsavel tecnico|art|crea|engenheiro|biologo)\b/i,
  'unidade de medida': /\b(unidade|und|kg|metro|m2|m3|litro|hora|diaria)\b/i,
  quantidade: /\b(quantidade|qtd|qtde|\d+[,.]?\d*)\b/i,
  'valor unitario': /\b(valor unitario|unitario|preco unitario)\b/i,
  'valor final': /\b(valor final|valor global|valor total|homologado|adjudicado)\b/i,
  fornecedor: /\b(fornecedor|contratada|vencedor|empresa|cnpj)\b/i,
  CNPJ: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b|\bcnpj\b/i,
  objeto: /\b(objeto|contratacao|aquisicao|prestacao)\b/i,
  vigencia: /\b(vigencia|prazo|periodo)\b/i,
  evento: /\b(evento|festa|show|exposicao|festival|carnaval)\b/i,
  entregaveis: /\b(entrega|entregavel|relatorio|apresentacao|servico)\b/i,
};

function camposDoAlerta(alerta) {
  const tipo = alerta?.metadados?.investigacao_tipo || alerta?.metadados?.tipo_fato;
  return alerta?.metadados?.campos_a_verificar || CHECKLISTS[tipo] || [];
}

function lacunasDeterministicas(alerta) {
  const texto = textoBase(alerta);
  return camposDoAlerta(alerta).map((campo) => {
    const encontrado = PADROES_CAMPO[campo]?.test(texto) || false;
    return {
      campo,
      status: encontrado ? 'encontrado_nos_trechos' : 'nao_encontrado_nos_documentos_analisados',
    };
  });
}

function evidenciasFortes(alerta) {
  return (alerta.evidencias || []).length > 0 && (alerta.documentos_ids || []).length > 0;
}

function narrativaConsolidadaFallback(alerta, { total, unidade, ano, ausentes, documentosIds }) {
  const partes = [
    `A prefeitura registrou ${total} ${unidade} em ${alerta.categoria || 'um tema publico'} no ${ano}` +
    (documentosIds.length ? ` (documento${documentosIds.length > 1 ? 's' : ''} ${documentosIds.join(', ')})` : '') +
    '.',
  ];
  if (ausentes.length) {
    partes.push(`${ausentes[0]} Vale conferir as informacoes na fonte oficial antes de qualquer conclusao.`);
  } else {
    partes.push('Vale conferir as informacoes na fonte oficial antes de qualquer conclusao.');
  }
  return partes.join(' ');
}

function fallbackInvestigation(alerta, motivo = null, { narrativaConsolidadaAtiva = true } = {}) {
  const lacunas = lacunasDeterministicas(alerta);
  const ausentes = lacunas
    .filter((item) => item.status === 'nao_encontrado_nos_documentos_analisados')
    .map((item) => `Nao encontrado nos documentos analisados: ${item.campo}.`);
  const total = Number(alerta.valor_total || alerta.metadados?.total_quantidade || 0);
  const ano = String(alerta.valor_periodo_label || alerta.metadados?.ano || '').match(/\d{4}/)?.[0] || 'periodo analisado';
  const unidade = alerta.metadados?.unidade || 'itens';
  const tipo = alerta.metadados?.investigacao_tipo || alerta.metadados?.tipo_fato || alerta.subcategoria || 'descoberta';
  const documentosIds = alerta.documentos_ids || [];
  const evidencias = (alerta.evidencias || []).slice(0, 8).map((ev) => ({
    documento_id: ev.documento_id || null,
    anexo_id: ev.anexo_id || null,
    descricao:
      `${ev.metadados?.quantidade ?? ev.metadados?.valor ?? total} ${ev.metadados?.unidade || unidade} em documento oficial relacionado.`,
  }));

  return {
    tema: alerta.metadados?.tema || alerta.categoria || 'Descoberta',
    tipo_investigacao: tipo,
    hipotese_publica:
      `Os documentos indicam ${total} ${unidade} em ${alerta.categoria || 'um tema publico'} no ${ano}; vale conferir as informacoes e lacunas associadas.`,
    pergunta_cidada: `${alerta.titulo || alerta.categoria || 'O que os documentos mostram'}?`,
    resposta_direta: `Os documentos analisados registram ${total} ${unidade} no ${ano}.`,
    por_que_olhar: ausentes[0] || 'O caso reúne dados de documentos oficiais que merecem leitura conjunta.',
    ...(narrativaConsolidadaAtiva
      ? { narrativa_consolidada: narrativaConsolidadaFallback(alerta, { total, unidade, ano, ausentes, documentosIds }) }
      : {}),
    o_que_os_dados_mostram: [
      `A metrica principal do candidato soma ${total} ${unidade}.`,
      `A descoberta esta ligada a ${alerta.documentos_ids?.length || 0} documento(s) oficial(is).`,
    ],
    lacunas_encontradas: ausentes.slice(0, 9),
    perguntas_abertas: [
      'Quais criterios e documentos sustentam os dados destacados?',
      'As fontes publicadas permitem conferir valores, fornecedores, datas e escopo?',
      'Ha documentos complementares que ainda nao apareceram nos trechos analisados?',
    ],
    evidencias_usadas: evidencias.length ? evidencias : [{
      documento_id: alerta.documentos_ids?.[0] || null,
      anexo_id: null,
      descricao: 'Evidencia factual extraida dos documentos analisados.',
    }],
    nivel_confianca: alerta.confianca ?? 0.68,
    analise_admin:
      `Fallback deterministico (${motivo || 'sem IA'}). O caso tem sinal publico relevante, mas deve ser revisado pelos trechos crus antes de qualquer conclusao externa.`,
    metricas: alerta.metadados?.metricas || {},
    comparativos: alerta.metadados?.comparativos || {},
    documentos_relacionados: (alerta.documentos || []).slice(0, 12).map((doc) => ({
      documento_id: doc.documento_id,
      papel: doc.papel || 'evidencia',
      observacao: doc.trecho_fonte || undefined,
    })),
    campos_a_verificar: camposDoAlerta(alerta),
    limites_publicacao: [
      'Analise gerada por fallback deterministico; revisar antes de destacar externamente.',
    ],
  };
}

function discoveryV3Reprovado(alerta, gateFactual, motivosAdicionais = []) {
  const motivos = [...new Set([...gateFactual.motivos, ...motivosAdicionais])];
  return {
    contrato_versao: 'discovery-v3',
    tipo_investigacao: gateFactual.pacote.tipo_investigacao,
    subject_key: gateFactual.pacote.subject_key,
    evidencias_hash: alerta.evidencias_hash || null,
    fato: {
      metrica_principal: gateFactual.pacote.metrica_principal,
      metricas: gateFactual.pacote.metricas,
      comparativos: gateFactual.pacote.comparativos,
      periodo: gateFactual.pacote.periodo,
      documentos_ids: gateFactual.pacote.documentos_ids,
      evidencias: gateFactual.pacote.evidencias,
    },
    qualidade: {
      factual_status: gateFactual.status,
      editorial_status: 'nao_executado',
      status: 'reprovado',
      motivos,
      versao: gateFactual.versao,
      verificado_em: new Date().toISOString(),
    },
  };
}

function montarResultadoEditorial(alerta, investigation, gateFactual, gateEditorial, {
  provider = null,
  model = null,
} = {}) {
  const discoveryV3 = montarDiscoveryV3({
    alerta,
    investigation,
    gateFactual,
    gateEditorial,
    provider,
    model,
  });
  const aprovado = gateFactual.aprovado && gateEditorial.aprovado;
  return {
    ...alerta,
    titulo: investigation.pergunta_cidada,
    narrativa: investigation.narrativa_consolidada,
    questionamentos: [...new Set([
      ...(alerta.questionamentos || []),
      ...(investigation.perguntas_abertas || []),
    ])].slice(0, 10),
    estado_editorial: aprovado ? 'publicado' : 'revisao',
    estado_editorial_origem: aprovado ? 'publicacao_automatica' : 'gate_editorial',
    qualidade_versao: gateFactual.versao,
    qualidade_motivos: discoveryV3.qualidade.motivos,
    publicado_em: aprovado ? new Date().toISOString() : null,
    metadados: { ...(alerta.metadados || {}), discovery_v3: discoveryV3 },
  };
}

function aplicarRegrasPublicacao(investigation, gateEditorial, cfg = {}) {
  const confiancaMinima = Number(cfg.confiancaMinPublica ?? 0.55);
  if (Number(investigation.nivel_confianca || 0) < confiancaMinima) {
    gateEditorial.aprovado = false;
    gateEditorial.status = 'reprovado';
    gateEditorial.motivos = [...new Set([...gateEditorial.motivos, 'CONFIDENCE_BELOW_MIN'])];
  }
  if (cfg.publicacaoAutomatica === false) {
    gateEditorial.aprovado = false;
    gateEditorial.status = 'revisao';
    gateEditorial.motivos = [...new Set([...gateEditorial.motivos, 'AUTOMATIC_PUBLICATION_DISABLED'])];
  }
  return gateEditorial;
}

async function processarDescobertaParaPublicacao(alerta, { provider, cfg = {}, force = false } = {}) {
  const gateFactual = validarFactual(alerta);
  if (!gateFactual.aprovado) {
    const discoveryV3 = discoveryV3Reprovado(alerta, gateFactual);
    return {
      ...alerta,
      estado_editorial: 'revisao',
      estado_editorial_origem: 'gate_factual',
      qualidade_versao: gateFactual.versao,
      qualidade_motivos: gateFactual.motivos,
      publicado_em: null,
      metadados: { ...(alerta.metadados || {}), discovery_v3: discoveryV3 },
    };
  }

  const discoveryV3Existente = alerta.metadados?.discovery_v3;
  if (!force && discoveryV3Existente?.pergunta_cidada && discoveryV3Existente?.narrativa_consolidada) {
    const investigation = normalizarInvestigacaoEditorial({
      ...discoveryV3Existente,
      nivel_confianca: discoveryV3Existente.nivel_confianca ?? alerta.confianca ?? 0,
    });
    const gateEditorial = aplicarRegrasPublicacao(
      investigation,
      validarEditorial(alerta, investigation, gateFactual),
      cfg
    );
    if (gateEditorial.aprovado) {
      return montarResultadoEditorial(alerta, investigation, gateFactual, gateEditorial, {
        provider: discoveryV3Existente.geracao?.provider || 'reuse-v3',
        model: discoveryV3Existente.geracao?.modelo || null,
      });
    }
  }

  const discoveryV2 = alerta.metadados?.discovery_v2;
  const statusV2Aproveitavel = ['ok', 'publicado', 'publicado_automaticamente'].includes(discoveryV2?.status);
  if (!force && statusV2Aproveitavel) {
    try {
      const investigation = validateDiscoveryInvestigation(discoveryV2);
      const gateEditorial = aplicarRegrasPublicacao(
        investigation,
        validarEditorial(alerta, investigation, gateFactual),
        cfg
      );
      return montarResultadoEditorial(alerta, investigation, gateFactual, gateEditorial, {
        provider: 'migration-v2',
        model: discoveryV2.modelo || null,
      });
    } catch (err) {
      logger.info('Investigacao v3: registro v2 nao reutilizado', {
        chave: alerta.chave_unica,
        erro: err.message,
      });
    }
  }

  if (!config.aiSummaryEnabled) {
    const motivos = ['AI_SUMMARY_DISABLED'];
    return {
      ...alerta,
      estado_editorial: 'candidato',
      estado_editorial_origem: 'worker_ia',
      qualidade_versao: gateFactual.versao,
      qualidade_motivos: motivos,
      publicado_em: null,
      metadados: {
        ...(alerta.metadados || {}),
        discovery_v3: discoveryV3Reprovado(alerta, gateFactual, motivos),
      },
    };
  }

  try {
    const aiProvider = provider || createAiProvider(process.env, { model: config.nvidiaModelInvestigacao });
    const lacunas = lacunasDeterministicas(alerta);
    const prompt = buildDiscoveryInvestigationPrompt({
      alerta,
      lacunasDeterministicas: lacunas,
      narrativaConsolidadaAtiva: true,
    });
    const raw = await aiProvider.generateJson({ prompt, temperature: 0.15 });
    const investigation = normalizarInvestigacaoEditorial(
      validateDiscoveryInvestigation(extractJsonObject(raw))
    );
    const gateEditorial = aplicarRegrasPublicacao(
      investigation,
      validarEditorial(alerta, investigation, gateFactual),
      cfg
    );
    return montarResultadoEditorial(alerta, investigation, gateFactual, gateEditorial, {
      provider: aiProvider.provider,
      model: aiProvider.model,
    });
  } catch (err) {
    logger.warn('Investigacao v3: falha de IA; candidato mantido para retentativa', {
      chave: alerta.chave_unica,
      erro: err.message,
    });
    const motivos = ['AI_PROVIDER_ERROR'];
    return {
      ...alerta,
      estado_editorial: 'candidato',
      estado_editorial_origem: 'worker_ia',
      qualidade_versao: gateFactual.versao,
      qualidade_motivos: motivos,
      publicado_em: null,
      metadados: {
        ...(alerta.metadados || {}),
        discovery_v3: {
          ...discoveryV3Reprovado(alerta, gateFactual, motivos),
          geracao: { erro: err.message, gerado_em: new Date().toISOString() },
        },
      },
    };
  }
}

function statusPublicacao(alerta, investigation, status, cfg = {}) {
  const min = Number(cfg.confiancaMinPublica ?? 0.55);
  const publicacaoAutomatica = cfg.publicacaoAutomatica !== false;
  const confianca = Number(investigation.nivel_confianca ?? alerta.confianca ?? 0);
  if (!publicacaoAutomatica) {
    return { status: 'revisao_admin', motivo: 'publicacao automatica desativada' };
  }
  if (!evidenciasFortes(alerta)) {
    return { status: 'revisao_admin', motivo: 'sem evidencias vinculadas suficientes' };
  }
  if (confianca < min) {
    return { status: 'revisao_admin', motivo: `confianca abaixo do minimo ${min}` };
  }
  return { status, motivo: 'publicado automaticamente apos contrato e evidencias' };
}

function applyInvestigationToAlert(alerta, investigation, { status, provider = null, model = null, erro = null, lacunas = [], cfg = {} } = {}) {
  const publicacao = statusPublicacao(alerta, investigation, status, cfg);
  const discoveryV2 = {
    contrato_versao: CONTRACT_VERSION,
    status: publicacao.status,
    provider,
    modelo: model,
    erro,
    gerado_em: new Date().toISOString(),
    lacunas_deterministicas: lacunas,
    score_publicacao: Number(investigation.nivel_confianca ?? alerta.confianca ?? 0),
    motivo_publicacao: publicacao.motivo,
    ...investigation,
  };

  return {
    ...alerta,
    titulo: alerta.titulo || investigation.hipotese_publica.slice(0, 90),
    // narrativa_consolidada (quando presente) e a leitura principal — mais
    // completa que a hipotese isolada. Registros antigos/toggle desligado
    // caem no hipotese_publica de sempre (compatibilidade).
    narrativa: investigation.narrativa_consolidada || investigation.hipotese_publica,
    questionamentos: [
      ...new Set([
        ...(alerta.questionamentos || []),
        ...(investigation.perguntas_abertas || []),
      ]),
    ].slice(0, 10),
    metadados: {
      ...(alerta.metadados || {}),
      discovery_v2: discoveryV2,
    },
  };
}

async function investigarDescoberta(alerta, { provider, cfg } = {}) {
  const lacunas = lacunasDeterministicas(alerta);

  const narrativaConsolidadaAtiva = cfg?.narrativaConsolidadaAtiva !== false;

  if (!config.aiSummaryEnabled) {
    const fallback = fallbackInvestigation(alerta, 'AI_SUMMARY_ENABLED=false', { narrativaConsolidadaAtiva });
    return applyInvestigationToAlert(alerta, fallback, { status: 'fallback', erro: 'AI_SUMMARY_ENABLED=false', lacunas, cfg });
  }

  try {
    const aiProvider = provider || createAiProvider(process.env, { model: config.nvidiaModelInvestigacao });
    const prompt = buildDiscoveryInvestigationPrompt({ alerta, lacunasDeterministicas: lacunas, narrativaConsolidadaAtiva });
    const raw = await aiProvider.generateJson({ prompt, temperature: 0.15 });
    const investigation = validateDiscoveryInvestigation(extractJsonObject(raw));
    return applyInvestigationToAlert(alerta, investigation, {
      status: 'ok',
      provider: aiProvider.provider,
      model: aiProvider.model,
      lacunas,
      cfg,
    });
  } catch (err) {
    logger.warn('Investigacao de descoberta: fallback deterministico', {
      chave: alerta.chave_unica,
      erro: err.message,
    });
    const fallback = fallbackInvestigation(alerta, err.message, { narrativaConsolidadaAtiva });
    return applyInvestigationToAlert(alerta, fallback, {
      status: 'fallback',
      erro: err.message,
      lacunas,
      cfg,
    });
  }
}

function deveInvestigarDescoberta(alerta) {
  return (
    alerta?.tipo === 'tematico' &&
    alerta?.metadados?.discovery_kind === 'investigacao_factual' &&
    Boolean(alerta?.metadados?.investigacao_tipo)
  );
}

module.exports = {
  CONTRACT_VERSION,
  extractJsonObject,
  lacunasDeterministicas,
  fallbackInvestigation,
  evidenciasFortes,
  investigarDescoberta,
  processarDescobertaParaPublicacao,
  deveInvestigarDescoberta,
};
