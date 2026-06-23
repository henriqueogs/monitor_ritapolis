const axios = require('axios');
const config = require('../config');
const { normalizeNumeroPncpChave } = require('../licitacoes/processo');
const { normalizeText } = require('../utils/text');

const MODALIDADE_CODES = {
  concorrencia_eletronica: 4,
  concorrencia_presencial: 5,
  pregao_eletronico: 6,
  pregao_presencial: 7,
  dispensa: 8,
  inexigibilidade: 9,
  credenciamento: 12
};

const DEFAULT_MODALIDADE_CODES = [
  MODALIDADE_CODES.pregao_eletronico,
  MODALIDADE_CODES.pregao_presencial,
  MODALIDADE_CODES.dispensa,
  MODALIDADE_CODES.inexigibilidade,
  MODALIDADE_CODES.concorrencia_eletronica,
  MODALIDADE_CODES.concorrencia_presencial,
  MODALIDADE_CODES.credenciamento
];

function normalizeKey(value) {
  return normalizeText(String(value || ''))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeCnpj(value) {
  const digits = onlyDigits(value);
  return digits.length === 14 ? digits : null;
}

function normalizeProcesso(value) {
  const text = normalizeKey(value);
  const digits = onlyDigits(text);
  if (digits.length >= 5) {return digits;}
  return text.replace(/\s+/g, '');
}

function parseNumber(value) {
  if (value === null || value === '') {return null;}
  if (typeof value === 'number') {return Number.isFinite(value) ? value : null;}

  const text = String(value)
    .replace(/[^\d,.-]/g, '')
    .trim();

  if (!text) {return null;}
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text;
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function parseDateValue(value) {
  if (!value) {return null;}
  if (value instanceof Date && Number.isFinite(value.getTime())) {return value;}

  const text = String(value).trim();
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  }

  const brMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brMatch) {
    return new Date(Number(brMatch[3]), Number(brMatch[2]) - 1, Number(brMatch[1]));
  }

  const compactMatch = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) {
    return new Date(Number(compactMatch[1]), Number(compactMatch[2]) - 1, Number(compactMatch[3]));
  }

  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function addDays(date, days) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() + Number(days || 0));
  return result;
}

function formatPncpDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function buildDateWindow({ data, ano, dias = 90 }) {
  const parsed = parseDateValue(data);
  const today = new Date();

  if (!parsed && ano) {
    const year = Number(ano);
    const start = new Date(year, 0, 1);
    let end = new Date(year, 11, 31);
    if (end > today) {end = today;}
    if (start > end) {return null;}

    return {
      dataInicial: formatPncpDate(start),
      dataFinal: formatPncpDate(end),
      origem: 'ano_inteiro'
    };
  }

  if (!parsed) {return null;}

  let start = addDays(parsed, -Math.abs(Number(dias || 0)));
  let end = addDays(parsed, Math.abs(Number(dias || 0)));

  if (ano) {
    const min = new Date(Number(ano), 0, 1);
    const max = new Date(Number(ano), 11, 31);
    if (start < min) {start = min;}
    if (end > max) {end = max;}
  }

  if (end > today) {end = today;}
  if (start > end) {start = end;}

  return {
    dataInicial: formatPncpDate(start),
    dataFinal: formatPncpDate(end),
    origem: 'data_base'
  };
}

function resolveModalidadeCodes(value) {
  const text = normalizeKey(value);
  if (!text) {return DEFAULT_MODALIDADE_CODES;}
  if (text.includes('pregao') && text.includes('eletron')) {return [MODALIDADE_CODES.pregao_eletronico];}
  if (text.includes('pregao') && text.includes('presenc')) {return [MODALIDADE_CODES.pregao_presencial];}
  if (text.includes('pregao')) {return [MODALIDADE_CODES.pregao_eletronico, MODALIDADE_CODES.pregao_presencial];}
  if (text.includes('dispensa')) {return [MODALIDADE_CODES.dispensa];}
  if (text.includes('inexig')) {return [MODALIDADE_CODES.inexigibilidade];}
  if (text.includes('credenciamento') || text.includes('chamamento')) {return [MODALIDADE_CODES.credenciamento];}
  if (text.includes('concorr')) {return [MODALIDADE_CODES.concorrencia_eletronica, MODALIDADE_CODES.concorrencia_presencial];}

  return DEFAULT_MODALIDADE_CODES;
}

function extractItems(payload) {
  if (Array.isArray(payload)) {return payload;}
  if (!payload || typeof payload !== 'object') {return [];}

  const candidates = [
    payload.data,
    payload.dados,
    payload.items,
    payload.itens,
    payload.content,
    payload.resultado
  ];

  return candidates.find(Array.isArray) || [];
}

function buildPncpEditalUrl(candidato) {
  const cnpj = normalizeCnpj(candidato?.orgaoEntidade?.cnpj || candidato?.cnpjOrgao || candidato?.cnpj);
  const ano = candidato?.anoCompra || candidato?.anoContratacao || candidato?.ano;
  const sequencial = candidato?.sequencialCompra || candidato?.sequencialContratacao;

  if (cnpj && ano && sequencial) {
    return `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${Number(sequencial)}`;
  }

  const controle = String(candidato?.numeroControlePNCP || '').trim();
  const match = controle.match(/^(\d{14})-\d+-(\d+)\/(\d{4})$/);
  if (!match) {return null;}

  return `https://pncp.gov.br/app/editais/${match[1]}/${match[3]}/${Number(match[2])}`;
}

async function consultarContratacoesPublicacao({
  dataInicial,
  dataFinal,
  codigoModalidadeContratacao,
  codigoMunicipioIbge = config.ibgeCode,
  cnpj,
  uf = 'MG',
  pagina = 1,
  tamanhoPagina = 50,
  timeoutMs = config.collectorTimeoutMs
} = {}) {
  const params = {
    dataInicial,
    dataFinal,
    codigoModalidadeContratacao,
    uf,
    codigoMunicipioIbge,
    cnpj: normalizeCnpj(cnpj) || undefined,
    pagina,
    tamanhoPagina
  };

  const response = await axios.get(`${config.pncpBaseUrl}/v1/contratacoes/publicacao`, {
    params,
    timeout: timeoutMs,
    headers: {
      accept: '*/*',
      'user-agent': config.collectorUserAgent
    }
  });

  const items = extractItems(response.data);
  return {
    params,
    status: response.status,
    raw: response.data,
    items,
    total_registros:
      response.data?.totalRegistros ??
      response.data?.total ??
      response.data?.totalElements ??
      items.length,
    total_paginas:
      response.data?.totalPaginas ??
      response.data?.totalPages ??
      null
  };
}

function getCandidateIdentifier(candidato) {
  return (
    candidato?.numeroControlePNCP ||
    candidato?.idContratacaoPNCP ||
    candidato?.id ||
    [
      candidato?.orgaoEntidade?.cnpj || candidato?.cnpjOrgao || candidato?.cnpj,
      candidato?.anoCompra || candidato?.anoContratacao || candidato?.ano,
      candidato?.sequencialCompra || candidato?.sequencialContratacao,
      candidato?.numeroCompra || candidato?.processo
    ]
      .filter(Boolean)
      .join('|')
  );
}

function getCandidateObjeto(candidato) {
  return (
    candidato?.objetoCompra ||
    candidato?.objetoContratacao ||
    candidato?.objeto ||
    candidato?.descricaoObjeto ||
    ''
  );
}

function getCandidateValor(candidato) {
  return (
    parseNumber(candidato?.valorTotalHomologado) ??
    parseNumber(candidato?.valorTotalEstimado) ??
    parseNumber(candidato?.valorGlobal) ??
    parseNumber(candidato?.valorTotal)
  );
}

function tokenize(value) {
  const ignored = new Set([
    'para',
    'com',
    'dos',
    'das',
    'por',
    'uma',
    'das',
    'que',
    'aos',
    'nas',
    'nos',
    'ritapolis',
    'municipio',
    'municipal',
    'prefeitura',
    'camara',
    'contratacao',
    'aquisicao',
    'servico',
    'servicos',
    'fornecimento'
  ]);

  return normalizeKey(value)
    .split(' ')
    .filter((token) => token.length >= 4 && !ignored.has(token));
}

function overlapRatio(a, b) {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));
  if (!tokensA.size || !tokensB.size) {return 0;}

  let matches = 0;
  tokensA.forEach((token) => {
    if (tokensB.has(token)) {matches += 1;}
  });

  return matches / Math.min(tokensA.size, tokensB.size);
}

function hasModalidadeMatch(local, candidato) {
  const localText = normalizeKey(local?.modalidade);
  const remoteText = normalizeKey(candidato?.modalidadeNome || candidato?.modalidade || '');
  if (!localText || !remoteText) {return false;}
  if (localText.includes('pregao') && remoteText.includes('pregao')) {return true;}
  if (localText.includes('dispensa') && remoteText.includes('dispensa')) {return true;}
  if (localText.includes('inexig') && remoteText.includes('inexig')) {return true;}
  if (localText.includes('credenciamento') && remoteText.includes('credenciamento')) {return true;}
  if (localText.includes('concorr') && remoteText.includes('concorr')) {return true;}
  return localText === remoteText;
}

function scoreContratacaoPncp(local, candidato) {
  let score = 0;
  const motivos = [];
  const localProcesso = normalizeProcesso(local?.processo || local?.numero);
  const remoteProcesso = normalizeProcesso(candidato?.processo || candidato?.numeroCompra);

  if (localProcesso && remoteProcesso) {
    if (localProcesso === remoteProcesso) {
      score += 45;
      motivos.push('processo_exato');
    } else if (localProcesso.includes(remoteProcesso) || remoteProcesso.includes(localProcesso)) {
      score += 28;
      motivos.push('processo_parcial');
    }
  }

  const localObjeto = [local?.objeto, local?.titulo, local?.resumo].filter(Boolean).join(' ');
  const remoteObjeto = getCandidateObjeto(candidato);
  const overlap = overlapRatio(localObjeto, remoteObjeto);
  if (overlap > 0) {
    const points = Math.round(Math.min(overlap, 1) * 25);
    score += points;
    motivos.push(`objeto_${points}`);
  }

  if (hasModalidadeMatch(local, candidato)) {
    score += 10;
    motivos.push('modalidade');
  }

  const localAno = Number(local?.ano);
  const remoteAno = Number(candidato?.anoCompra || candidato?.anoContratacao || candidato?.ano);
  if (localAno && remoteAno && localAno === remoteAno) {
    score += 5;
    motivos.push('ano');
  }

  const localCnpj = normalizeCnpj(local?.cnpjOrgao);
  const remoteCnpj = normalizeCnpj(candidato?.orgaoEntidade?.cnpj || candidato?.cnpjOrgao || candidato?.cnpj);
  if (localCnpj && remoteCnpj && localCnpj === remoteCnpj) {
    score += 15;
    motivos.push('cnpj');
  }

  const localPncp = normalizeNumeroPncpChave(local?.numero_pncp);
  const remotePncp = normalizeNumeroPncpChave(
    candidato?.numeroControlePNCP || candidato?.idContratacaoPNCP
  );
  if (localPncp && remotePncp) {
    if (localPncp === remotePncp) {
      score += 50;
      motivos.push('numero_pncp_exato');
    } else if (localPncp.includes(remotePncp) || remotePncp.includes(localPncp)) {
      score += 30;
      motivos.push('numero_pncp_parcial');
    }
  }

  const localValor = parseNumber(local?.valor_final) ?? parseNumber(local?.valor_estimado);
  const remoteValor = getCandidateValor(candidato);
  if (localValor !== null && remoteValor !== null) {
    const diff = Math.abs(localValor - remoteValor);
    const pct = remoteValor ? diff / Math.abs(remoteValor) : null;
    if (diff <= 1 || (pct !== null && pct <= 0.01)) {
      score += 10;
      motivos.push('valor_proximo');
    } else if (pct !== null && pct <= 0.1) {
      score += 5;
      motivos.push('valor_aproximado');
    }
  }

  return {
    score: Math.min(score, 100),
    motivos,
    overlap_objeto: overlap
  };
}

function getStatusCorrespondencia(score, minScore = 60) {
  if (score >= 80) {return 'forte';}
  if (score >= Number(minScore)) {return 'sugerida';}
  if (score >= 40) {return 'fraca';}
  return 'baixa_confianca';
}

function dedupeCandidatos(candidatos) {
  const byId = new Map();

  candidatos.forEach((item) => {
    const id = getCandidateIdentifier(item.candidato);
    if (!id) {return;}
    const current = byId.get(id);
    if (!current || item.score > current.score) {byId.set(id, item);}
  });

  return Array.from(byId.values()).sort((a, b) => b.score - a.score);
}

async function buscarCandidatosPncpEmCascata(local, options = {}) {
  const minScore = Number(options.minScore ?? 60);
  const baseOptions = { ...options, minScore };

  if (normalizeNumeroPncpChave(local?.numero_pncp)) {
    const porNumeroPncp = await buscarCandidatosPncp(
      { ...local, dias: Math.min(Number(options.dias || 90), 45) },
      { ...baseOptions, retrySemCnpj: true, maxPaginas: Math.max(Number(options.maxPaginas || 2), 3) }
    );

    if (
      porNumeroPncp.melhor_candidato &&
      Number(porNumeroPncp.melhor_candidato.score) >= minScore
    ) {
      return { ...porNumeroPncp, estrategia: 'numero_pncp_janela_curta' };
    }
  }

  const porPublicacao = await buscarCandidatosPncp(local, baseOptions);
  return { ...porPublicacao, estrategia: 'publicacao_modalidade' };
}

async function buscarCandidatosPncp(local, {
  dias = 90,
  cnpj,
  uf = 'MG',
  codigoMunicipioIbge = config.ibgeCode,
  maxPaginas = 2,
  tamanhoPagina = 50,
  timeoutMs = config.collectorTimeoutMs,
  retrySemCnpj = true,
  limiteCandidatos = 10,
  minScore = 60
} = {}) {
  const dataBase = local?.data_publicacao || local?.data_abertura || local?.data_sessao;
  const janela = buildDateWindow({ data: dataBase, ano: local?.ano, dias });

  if (!janela) {
    return {
      documento_id: local?.documento_id || local?.id,
      status: 'sem_data',
      consultas: [],
      erros: [],
      candidatos: [],
      melhor_candidato: null
    };
  }

  const modalidadeCodes = resolveModalidadeCodes(local?.modalidade);
  const cnpjNormalizado = normalizeCnpj(cnpj || local?.cnpjOrgao);
  const retrySemCnpjSeguro = retrySemCnpj && janela.origem !== 'ano_inteiro';
  const etapasCnpj = cnpjNormalizado && retrySemCnpjSeguro ? [cnpjNormalizado, null] : [cnpjNormalizado];
  const consultas = [];
  const erros = [];
  const candidatos = [];

  for (const cnpjEtapa of etapasCnpj) {
    const encontradosAntes = candidatos.length;

    for (const codigoModalidadeContratacao of modalidadeCodes) {
      for (let pagina = 1; pagina <= Number(maxPaginas || 1); pagina += 1) {
        try {
          const consulta = await consultarContratacoesPublicacao({
            ...janela,
            codigoModalidadeContratacao,
            codigoMunicipioIbge,
            cnpj: cnpjEtapa,
            uf,
            pagina,
            tamanhoPagina,
            timeoutMs
          });

          consultas.push({
            params: consulta.params,
            total_registros: consulta.total_registros,
            total_paginas: consulta.total_paginas,
            itens: consulta.items.length
          });

          consulta.items.forEach((candidato) => {
            const scoring = scoreContratacaoPncp(
              { ...local, cnpjOrgao: cnpjEtapa || local?.cnpjOrgao },
              candidato
            );
            candidatos.push({
              identificador: getCandidateIdentifier(candidato),
              url: buildPncpEditalUrl(candidato),
              score: scoring.score,
              status_correspondencia: getStatusCorrespondencia(scoring.score, minScore),
              motivos: scoring.motivos,
              overlap_objeto: scoring.overlap_objeto,
              consulta: {
                dataInicial: consulta.params.dataInicial,
                dataFinal: consulta.params.dataFinal,
                codigoModalidadeContratacao,
                cnpj: cnpjEtapa,
                pagina
              },
              candidato
            });
          });

          if (consulta.items.length < Number(tamanhoPagina || 50)) {break;}
          if (consulta.total_paginas && pagina >= Number(consulta.total_paginas)) {break;}
        } catch (error) {
          erros.push({
            codigoModalidadeContratacao,
            cnpj: cnpjEtapa,
            pagina,
            nome: error.name || null,
            codigo: error.code || null,
            mensagem: error.response?.data?.message || error.message || String(error),
            status: error.response?.status || null
          });
          break;
        }
      }
    }

    if (candidatos.length > encontradosAntes || !retrySemCnpj) {break;}
  }

  const ordenados = dedupeCandidatos(candidatos).slice(0, Number(limiteCandidatos || 10));
  const melhor = ordenados[0] || null;

  return {
    documento_id: local?.documento_id || local?.id,
    status: melhor ? 'com_candidatos' : erros.length ? 'erro_ou_sem_candidatos' : 'sem_candidatos',
    janela,
    modalidade_codes: modalidadeCodes,
    consultas,
    erros,
    candidatos: ordenados,
    melhor_candidato: melhor
  };
}

module.exports = {
  MODALIDADE_CODES,
  buildDateWindow,
  buildPncpEditalUrl,
  buscarCandidatosPncp,
  buscarCandidatosPncpEmCascata,
  consultarContratacoesPublicacao,
  getCandidateIdentifier,
  getStatusCorrespondencia,
  normalizeCnpj,
  resolveModalidadeCodes,
  scoreContratacaoPncp
};
