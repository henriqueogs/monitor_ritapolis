'use strict';

const { QUALITY_VERSION } = require('./discovery-candidates');

const GENERIC_EVIDENCE = new Set([
  'servico recorrente',
  'evento publico',
  'contratacoes de eventos',
  'preco item',
]);

// Narrativa pública precisa de substância mínima (fato + contexto/limite),
// mesmo quando o modelo condensa tudo numa única frase.
const MIN_NARRATIVA_CHARS = 80;

function unico(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ''))];
}

function descricaoEvidencia(evidencia) {
  return String(
    evidencia?.metadados?.descricao ||
      evidencia?.fato_descricao ||
      evidencia?.trecho_fonte ||
      ''
  ).trim();
}

function normalizarRotulo(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function numeroQuaseIgual(a, b) {
  const aa = Number(a);
  const bb = Number(b);
  if (!Number.isFinite(aa) || !Number.isFinite(bb)) {return false;}
  return Math.abs(aa - bb) <= Math.max(0.01, Math.abs(bb) * 0.000001);
}

const TERMOS_GENERICOS_ASSUNTO = new Set([
  'aquisicao', 'contratacao', 'contrato', 'contratos', 'documento', 'documentos',
  'empresa', 'evento', 'eventos', 'fornecimento', 'material', 'objeto', 'prefeitura',
  'processo', 'processos', 'registro', 'servico', 'servicos', 'ltda',
]);

function termosEspecificos(...valores) {
  return unico(valores
    .flatMap((valor) => normalizarRotulo(valor).split(' '))
    .filter((termo) => termo.length >= 4 && !TERMOS_GENERICOS_ASSUNTO.has(termo)));
}

function perguntaNomeiaAssunto(pergunta, gateFactual, metadados = {}) {
  const texto = normalizarRotulo(pergunta);
  const tipo = gateFactual.pacote.tipo_investigacao;
  if (tipo === 'supressao_arvores' || tipo === 'meio_ambiente.supressao_arvores') {
    return texto.includes('arvor');
  }
  let termos = [];
  if (tipo === 'eventos.gastos_eventos_publicos') {
    termos = termosEspecificos(
      metadados.event_group?.evento,
      gateFactual.pacote.comparativos?.evento
    );
  } else if (tipo === 'contratos.recorrencia_fornecedor_objeto') {
    termos = termosEspecificos(
      metadados.recurrence_group?.fornecedor,
      metadados.recurrence_group?.objeto_key,
      gateFactual.pacote.comparativos?.fornecedor,
      gateFactual.pacote.comparativos?.objeto_key
    );
  } else if (tipo === 'compras.precos_itens') {
    termos = termosEspecificos(
      metadados.price_group?.produto_key,
      gateFactual.pacote.comparativos?.produto
    );
  }
  return termos.length > 0 && termos.some((termo) => texto.includes(termo));
}

function normalizarInvestigacaoEditorial(investigation = {}) {
  const narrativa = String(investigation.narrativa_consolidada || '').replace(
    /;\s*(entretanto|contudo|porem|porém|no entanto),?\s*/i,
    (_match, conector) => `. ${conector.charAt(0).toUpperCase()}${conector.slice(1)}, `
  );
  return { ...investigation, narrativa_consolidada: narrativa };
}

function montarPacoteFactual(alerta) {
  const metadados = alerta.metadados || {};
  const documentosIds = unico((alerta.documentos_ids || []).map(Number)).sort((a, b) => a - b);
  const evidencias = (alerta.evidencias || []).map((evidencia) => ({
    documento_id: evidencia.documento_id || null,
    anexo_id: evidencia.anexo_id || null,
    fato_id: evidencia.fato_id || null,
    descricao: descricaoEvidencia(evidencia),
    trecho_fonte: evidencia.trecho_fonte || null,
    quantidade: evidencia.metadados?.quantidade ?? evidencia.fato_quantidade ?? null,
    unidade: evidencia.metadados?.unidade || evidencia.fato_unidade || null,
    valor: evidencia.metadados?.valor ?? evidencia.fato_valor ?? null,
  }));
  return {
    tipo_investigacao: metadados.investigacao_tipo || metadados.tipo_fato || null,
    subject_key: metadados.subject_key || null,
    metrica_principal: metadados.metrica_principal || {
      nome: 'valor_total',
      valor: alerta.valor_total ?? null,
      unidade: metadados.unidade || null,
    },
    metricas: metadados.metricas_deterministicas || {},
    comparativos: metadados.comparativos_deterministicos || {},
    periodo: { inicio: alerta.periodo_inicio || null, fim: alerta.periodo_fim || null },
    documentos_ids: documentosIds,
    evidencias,
  };
}

function validarFactual(alerta) {
  const motivos = [];
  const metadados = alerta.metadados || {};
  const pacote = montarPacoteFactual(alerta);
  const tipo = pacote.tipo_investigacao;
  const documentos = alerta.documentos || [];

  if (metadados.discovery_kind !== 'investigacao_factual') {motivos.push('LEGACY_NO_QUALITY_GATE');}
  if (!pacote.subject_key) {motivos.push('NO_FIXED_SUBJECT');}
  if (!pacote.evidencias.length) {motivos.push('GENERIC_EVIDENCE');}
  if (
    pacote.evidencias.length &&
    pacote.evidencias.every((evidencia) => GENERIC_EVIDENCE.has(normalizarRotulo(evidencia.descricao)))
  ) {
    motivos.push('GENERIC_EVIDENCE');
  }
  if (!pacote.documentos_ids.length) {motivos.push('SOURCE_NOT_TRACEABLE');}
  if (
    documentos.length &&
    documentos.some((documento) => !documento.url_origem && !documento.url_pdf)
  ) {
    motivos.push('SOURCE_NOT_TRACEABLE');
  }

  const unidade = normalizarRotulo(metadados.unidade);
  if (['documentos', 'processos'].includes(unidade) && !numeroQuaseIgual(alerta.valor_total, pacote.documentos_ids.length)) {
    motivos.push('DOCUMENT_COUNT_MISMATCH');
  }

  if (tipo === 'supressao_arvores' || tipo === 'meio_ambiente.supressao_arvores') {
    const total = pacote.evidencias.reduce((soma, evidencia) => soma + (Number(evidencia.quantidade) || 0), 0);
    if (!(total > 0) || !numeroQuaseIgual(total, alerta.valor_total)) {motivos.push('METRIC_NOT_REPRODUCIBLE');}
  } else if (tipo === 'contratos.recorrencia_fornecedor_objeto') {
    const grupo = metadados.recurrence_group;
    if (!grupo?.cnpj || !grupo?.objeto_key || unico(grupo?.processos || []).length < 2) {
      motivos.push('RECURRENCE_NOT_PROVEN');
    }
    if (!grupo?.objeto_key) {motivos.push('MIXED_SUBJECTS');}
  } else if (tipo === 'eventos.gastos_eventos_publicos') {
    if (!metadados.event_group?.event_key) {motivos.push('NO_FIXED_SUBJECT');}
    if (pacote.documentos_ids.length < 2) {motivos.push('INSUFFICIENT_SAMPLE');}
  } else if (tipo === 'compras.precos_itens') {
    const grupo = metadados.price_group;
    if (!grupo?.produto_key || !grupo?.unidade) {motivos.push('COMPARISON_NOT_COMPARABLE');}
    if (Number(grupo?.tamanho_amostra || 0) < 3 || pacote.documentos_ids.length < 3) {
      motivos.push('INSUFFICIENT_SAMPLE');
    }
    const mediana = Number(pacote.metricas.mediana_valor_unitario);
    const alvo = Number(pacote.metricas.valor_unitario_alvo);
    if (!(mediana > 0) || !(alvo >= mediana * 4) || alvo - mediana < 1000) {
      motivos.push('METRIC_NOT_REPRODUCIBLE');
    }
  }

  if (!pacote.metrica_principal?.nome || pacote.metrica_principal?.valor === null) {
    motivos.push('METRIC_NOT_REPRODUCIBLE');
  }

  const motivosUnicos = unico(motivos);
  return {
    aprovado: motivosUnicos.length === 0,
    status: motivosUnicos.length ? 'reprovado' : 'aprovado',
    motivos: motivosUnicos,
    pacote,
    versao: QUALITY_VERSION,
  };
}

function coletarNumeros(valor, out = []) {
  if (typeof valor === 'number' && Number.isFinite(valor)) {out.push(valor);}
  else if (Array.isArray(valor)) {valor.forEach((item) => coletarNumeros(item, out));}
  else if (valor && typeof valor === 'object') {Object.values(valor).forEach((item) => coletarNumeros(item, out));}
  else if (typeof valor === 'string') {
    for (const token of valor.match(/\d+(?:[.,]\d+)*/g) || []) {
      const temPontoMilhar = /^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(token);
      const normalizado = temPontoMilhar
        ? token.replace(/\./g, '').replace(',', '.')
        : token.replace(',', '.');
      const numero = Number(normalizado);
      if (Number.isFinite(numero)) {out.push(numero);}
    }
  }
  return out;
}

function numeroPermitido(numero, permitidos) {
  return permitidos.some((permitido) => numeroQuaseIgual(numero, permitido));
}

function camposNegados(investigation = {}) {
  const trechos = [
    ...(investigation.lacunas_encontradas || []),
    ...String(investigation.narrativa_consolidada || '').split(/[.!?]+/),
  ]
    .map(normalizarRotulo)
    .filter((trecho) =>
      /(?:nao (?:foram? )?encontrad|nao consta|sem informac|ausencia de)/.test(trecho)
    );
  const campos = [];
  const registrar = (campo, termos) => {
    if (trechos.some((trecho) => termos.some((termo) => trecho.includes(termo)))) {campos.push(campo);}
  };
  registrar('valor', ['valor', 'preco', 'custo']);
  registrar('objeto', ['objeto contrat', 'objeto do contrat']);
  registrar('fornecedor', ['fornecedor', 'empresa contrat']);
  registrar('evento', ['evento identific', 'nome do evento']);
  registrar('quantidade', ['quantidade', 'numero de process', 'numero de contrat']);
  return unico(campos);
}

function detectarContradicoesFactuais(alerta, investigation, gateFactual) {
  const pacote = gateFactual.pacote;
  const tipo = pacote.tipo_investigacao;
  const metadados = alerta.metadados || {};
  const negados = new Set(camposNegados(investigation));
  const contradicoes = [];
  const metricas = pacote.metricas || {};
  const temValorIdentificado = Object.entries(metricas).some(([nome, valor]) =>
    normalizarRotulo(nome).includes('valor') && Number(valor) > 0
  ) || pacote.evidencias.some((evidencia) => Number(evidencia.valor) > 0);
  const temQuantidadeIdentificada = Number(pacote.metrica_principal?.valor) > 0;
  const temFornecedorIdentificado = Boolean(
    pacote.comparativos?.fornecedor || metadados.recurrence_group?.fornecedor
  );
  const temEventoIdentificado = Boolean(
    pacote.comparativos?.evento || metadados.event_group?.evento
  );
  const temObjetoIdentificado = Boolean(
    metadados.recurrence_group?.objeto_key ||
    (tipo === 'eventos.gastos_eventos_publicos' && pacote.evidencias.some((evidencia) =>
      normalizarRotulo(evidencia.descricao).includes('contrat')
    ))
  );

  if (temValorIdentificado && negados.has('valor')) {contradicoes.push('valor');}
  if (temQuantidadeIdentificada && negados.has('quantidade')) {contradicoes.push('quantidade');}
  if (temFornecedorIdentificado && negados.has('fornecedor')) {contradicoes.push('fornecedor');}
  if (temEventoIdentificado && negados.has('evento')) {contradicoes.push('evento');}
  if (temObjetoIdentificado && negados.has('objeto')) {contradicoes.push('objeto');}
  return unico(contradicoes);
}

function validarEditorial(alerta, investigation, gateFactual) {
  const motivos = [];
  const diagnostico = {};
  const pergunta = String(investigation?.pergunta_cidada || '').trim();
  const resposta = String(investigation?.resposta_direta || '').trim();
  const porQue = String(investigation?.por_que_olhar || '').trim();
  const narrativa = String(investigation?.narrativa_consolidada || '').trim();
  const tituloGenerico = /para investigar|servicos recorrentes|contratacoes ligadas a eventos/i.test(pergunta)
    || /^quant(?:os|as)\s+(?:documentos|contratos|processos)(?:\s+foram\s+registrad[oa]s?)?\??$/i.test(pergunta);
  if (!pergunta || tituloGenerico || !perguntaNomeiaAssunto(pergunta, gateFactual, alerta.metadados || {})) {
    motivos.push('EDITORIAL_GENERIC_TITLE');
  }
  const unidadePrincipal = normalizarRotulo(gateFactual.pacote.metrica_principal?.unidade);
  if (/quanto.*(?:gast|cust|valor|preco)/i.test(pergunta) && !['r', 'rs', 'real', 'reais'].includes(unidadePrincipal)) {
    motivos.push('EDITORIAL_QUESTION_METRIC_MISMATCH');
  }
  if (!resposta) {motivos.push('EDITORIAL_NO_DIRECT_ANSWER');}
  if (!porQue) {motivos.push('EDITORIAL_NO_REASON');}
  const frases = narrativa.split(/[.!?]+/).map((item) => item.trim()).filter(Boolean);
  diagnostico.total_frases_narrativa = frases.length;
  diagnostico.tamanho_narrativa = narrativa.length;
  // 1 a 4 frases, desde que haja substância (fato + contexto/limite). O modelo
  // às vezes condensa tudo numa única frase longa — isso é válido; o que não
  // vale é narrativa vazia, curta demais ou prolixa (>4 frases).
  if (frases.length < 1 || frases.length > 4 || narrativa.length < MIN_NARRATIVA_CHARS) {
    motivos.push('EDITORIAL_NARRATIVE_LENGTH');
  }

  const idsPermitidos = new Set(gateFactual.pacote.documentos_ids.map(Number));
  const camposPublicos = [pergunta, resposta, porQue, narrativa, ...(investigation?.perguntas_abertas || [])];
  for (const campo of camposPublicos) {
    for (const match of campo.matchAll(/\[(\d+)\]/g)) {
      if (!idsPermitidos.has(Number(match[1]))) {motivos.push('EDITORIAL_UNKNOWN_DOCUMENT');}
    }
  }

  // Números fundamentados = tudo que o sistema calculou e expôs ao modelo:
  // pacote factual, período, e também as janelas e métricas dos metadados
  // (ex.: fim da janela de 12 meses cai no ano seguinte — 2027 é legítimo).
  const permitidos = unico(coletarNumeros({
    pacote: gateFactual.pacote,
    alerta: {
      valor_total: alerta.valor_total,
      periodo_inicio: alerta.periodo_inicio,
      periodo_fim: alerta.periodo_fim,
      janelas: alerta.metadados?.janelas || [],
      metricas: alerta.metadados?.metricas || {},
    },
  }));
  const usados = coletarNumeros(camposPublicos);
  const naoFundamentados = unico(usados.filter((numero) => !numeroPermitido(numero, permitidos)));
  diagnostico.numeros_nao_fundamentados = naoFundamentados;
  if (naoFundamentados.length) {
    motivos.push('EDITORIAL_NUMBER_NOT_GROUNDED');
  }

  const contradicoesFactuais = detectarContradicoesFactuais(alerta, investigation, gateFactual);
  diagnostico.campos_contraditorios = contradicoesFactuais;
  if (contradicoesFactuais.length) {motivos.push('EDITORIAL_CONTRADICTS_FACTS');}

  const motivosUnicos = unico(motivos);
  return {
    aprovado: motivosUnicos.length === 0,
    status: motivosUnicos.length ? 'reprovado' : 'aprovado',
    motivos: motivosUnicos,
    diagnostico,
  };
}

function montarDiscoveryV3({ alerta, investigation, gateFactual, gateEditorial, provider = null, model = null }) {
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
    editorial: {
      pergunta_cidada: investigation.pergunta_cidada,
      resposta_direta: investigation.resposta_direta,
      por_que_olhar: investigation.por_que_olhar,
      narrativa_consolidada: investigation.narrativa_consolidada,
      perguntas_abertas: investigation.perguntas_abertas || [],
      limites_publicacao: investigation.limites_publicacao || [],
    },
    qualidade: {
      factual_status: gateFactual.status,
      editorial_status: gateEditorial.status,
      status: gateFactual.aprovado && gateEditorial.aprovado ? 'aprovado' : 'reprovado',
      motivos: unico([...gateFactual.motivos, ...gateEditorial.motivos]),
      diagnostico_editorial: gateEditorial.diagnostico || {},
      versao: QUALITY_VERSION,
      verificado_em: new Date().toISOString(),
    },
    geracao: {
      provider,
      modelo: model,
      gerado_em: new Date().toISOString(),
    },
    // Compatibilidade de leitura durante a transição do frontend.
    pergunta_cidada: investigation.pergunta_cidada,
    resposta_direta: investigation.resposta_direta,
    por_que_olhar: investigation.por_que_olhar,
    narrativa_consolidada: investigation.narrativa_consolidada,
    o_que_os_dados_mostram: investigation.o_que_os_dados_mostram || [],
    lacunas_encontradas: investigation.lacunas_encontradas || [],
    perguntas_abertas: investigation.perguntas_abertas || [],
    limites_publicacao: investigation.limites_publicacao || [],
    nivel_confianca: investigation.nivel_confianca ?? alerta.confianca ?? null,
    metricas: gateFactual.pacote.metricas,
    comparativos: gateFactual.pacote.comparativos,
  };
}

module.exports = {
  QUALITY_VERSION,
  montarPacoteFactual,
  validarFactual,
  validarEditorial,
  montarDiscoveryV3,
  normalizarInvestigacaoEditorial,
  coletarNumeros,
  detectarContradicoesFactuais,
};
