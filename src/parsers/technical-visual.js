'use strict';

const STATUS_TECNICO_VISUAL = 'tecnico_visual';

const EXTENSOES_TEXTO_ESTRUTURADO = /\.(docx?|xlsx?|csv)$/i;

const NOMES_PROSA = [
  'edital',
  'ata',
  'homologacao',
  'homologação',
  'memorial descritivo',
  'termo de referencia',
  'termo de referência',
  'contrato',
  'planilha',
  'cronograma',
  'orcamento',
  'orçamento',
  'concorrencia',
  'concorrência',
  'pregao',
  'pregão',
  'dispensa',
  'inexigibilidade',
  'resultado',
  'resultados',
  'classificados',
  'candidatos',
  'recurso',
  'contrarrazoes',
  'lei',
  'termo',
  'adjudicacao',
  'cotacao',
  'cotacoes',
  'bdi',
  'composicao',
  'composicoes',
  'memoria de calculo',
  'memoria_de_calculo',
  'memoria_de_calculos',
  'memorial_descritivo',
  'memoria',
  'proposta',
  'precos',
  'chamada',
  'cronogram',
  'or_amento',
  'orc_amento',
  'art_',
  'chamada publica',
  'chamada pública',
  ' md.',
  '_md.',
  '-md.'
];

const NOMES_PRANCHA = [
  ' arq',
  '.arq',
  '_arq',
  '-arq',
  ' trp',
  '.trp',
  '_trp',
  '-trp',
  ' est',
  '.est',
  '_est',
  '-est',
  ' hid',
  '.hid',
  '_hid',
  '-hid',
  ' esg',
  '.esg',
  '_esg',
  '-esg',
  ' ele',
  '.ele',
  '_ele',
  '-ele',
  ' spda',
  '.spda',
  '_spda',
  '-spda',
  ' inc',
  '.inc',
  '_inc',
  '-inc',
  ' agp',
  '.agp',
  '_agp',
  '-agp',
  ' cbe',
  '.cbe',
  '_cbe',
  '-cbe',
  ' lmt',
  '.lmt',
  '_lmt',
  '-lmt',
  'planta',
  'prancha',
  'projeto arquitetonico',
  'projeto arquitetônico',
  'projeto estrutural',
  'projeto eletrico',
  'projeto elétrico',
  'projeto hidraulico',
  'projeto hidráulico',
  'mapa',
  'croqui'
];

const NOMES_VISUAIS_FORTES = [
  'prancha',
  'planta',
  'croqui',
  'mapa',
  'topograf',
  'projeto arquitetonico',
  'projeto estrutural',
  'projeto eletrico',
  'projeto hidraulico',
  'projeto sanitario',
  'rede coletora',
  'esgoto',
  'esgotamento',
  'drenagem',
  'dwg',
  '.arq',
  '.trp',
  '.est',
  '.hid',
  '.esg',
  '.ele',
  '.spda',
  '.inc',
  '.agp',
  '.cbe',
  '.lmt'
];

const TERMOS_PRANCHA = [
  'planta baixa',
  'corte',
  'fachada',
  'escala',
  'detalhe',
  'legenda',
  'quadro de cargas',
  'diagrama',
  'isometrico',
  'isométrico',
  'locacao',
  'locação',
  'nivel',
  'nível',
  'eixo',
  'rua',
  'pavimento',
  'alvenaria',
  'cobertura',
  'perfil longitudinal',
  'curva de nivel',
  'curva de nível'
];

const TERMOS_PROSA = [
  'edital de licitacao',
  'edital de licitação',
  'ata da sessao',
  'ata da sessão',
  'memorial descritivo',
  'termo de referencia',
  'termo de referência',
  'objeto da contratacao',
  'objeto da contratação',
  'contratada devera',
  'contratada deverá',
  'processo licitatorio',
  'processo licitatório'
];

function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function contarOcorrencias(texto, termos) {
  return termos.reduce((total, termo) => total + (texto.includes(normalizar(termo)) ? 1 : 0), 0);
}

function densidadeFrases(texto) {
  const linhas = String(texto || '')
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter(Boolean);

  if (!linhas.length) {
    return { linhas: 0, frases: 0, mediaLinha: 0, ratio: 0 };
  }

  const frases = linhas.filter((linha) => {
    const palavras = linha.split(/\s+/).filter((item) => /[A-Za-zÀ-ÿ]{3,}/.test(item));
    return palavras.length >= 8 && /[.!?;:]$/.test(linha);
  }).length;

  const totalCaracteres = linhas.reduce((soma, linha) => soma + linha.length, 0);
  return {
    linhas: linhas.length,
    frases,
    mediaLinha: totalCaracteres / linhas.length,
    ratio: frases / linhas.length
  };
}

function proporcaoTokensCurtos(texto) {
  const tokens = String(texto || '').match(/[A-Za-zÀ-ÿ0-9]+/g) || [];
  if (!tokens.length) {
    return 0;
  }
  const curtos = tokens.filter((token) => token.length <= 3).length;
  return curtos / tokens.length;
}

function classificarArquivoTecnicoVisual({ nome, texto, extension } = {}) {
  const nomeNormalizado = normalizar(nome);
  const textoNormalizado = normalizar(texto);
  const ext = String(extension || nome || '').toLowerCase();

  if (EXTENSOES_TEXTO_ESTRUTURADO.test(ext)) {
    return { visual: false, status: null, score: 0, motivo: 'formato_texto_estruturado', sinais: [] };
  }

  const sinais = [];
  let score = 0;

  const nomeProsa = contarOcorrencias(nomeNormalizado, NOMES_PROSA);
  const nomePrancha = contarOcorrencias(` ${nomeNormalizado}`, NOMES_PRANCHA);
  const nomeVisualForte = contarOcorrencias(nomeNormalizado, NOMES_VISUAIS_FORTES);
  const termosPrancha = contarOcorrencias(textoNormalizado, TERMOS_PRANCHA);
  const termosProsa = contarOcorrencias(textoNormalizado, TERMOS_PROSA);
  const frases = densidadeFrases(texto);
  const tokensCurtos = proporcaoTokensCurtos(texto);
  const muitasCoordenadas = ((texto || '').match(/\b\d{1,4}[,.]\d{2,4}\b/g) || []).length >= 20;
  const muitasLinhasCurtas = frases.linhas >= 20 && frases.mediaLinha < 45;

  if (nomePrancha >= 1) {
    score += 3;
    sinais.push('nome_prancha');
  }
  if (termosPrancha >= 4) {
    score += 3;
    sinais.push('termos_desenho');
  } else if (termosPrancha >= 2) {
    score += 1;
    sinais.push('alguns_termos_desenho');
  }
  if (tokensCurtos >= 0.42) {
    score += 2;
    sinais.push('muitos_rotulos_curtos');
  }
  if (muitasCoordenadas) {
    score += 2;
    sinais.push('muitos_numeros_coordenadas');
  }
  if (muitasLinhasCurtas) {
    score += 1;
    sinais.push('linhas_curtas');
  }
  if (frases.ratio < 0.08 && frases.linhas >= 20) {
    score += 1;
    sinais.push('baixa_densidade_frases');
  }
  if (nomeProsa) {
    score -= 6;
    sinais.push('nome_prosa');
  }
  if (termosProsa >= 1) {
    score -= 3;
    sinais.push('termos_prosa');
  }

  const visual =
    score >= 5 &&
    nomeProsa === 0 &&
    (nomeVisualForte >= 1 || nomePrancha >= 1);
  return {
    visual,
    status: visual ? STATUS_TECNICO_VISUAL : null,
    score,
    motivo: visual ? 'arquivo_tecnico_visual' : 'texto_adequado',
    sinais
  };
}

module.exports = {
  STATUS_TECNICO_VISUAL,
  classificarArquivoTecnicoVisual
};
