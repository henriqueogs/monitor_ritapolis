'use strict';

/**
 * Service da lente "finalidade": agrega a classificacao auditavel de empenhos
 * sem alterar o registro bruto de transparencia_despesas.
 */

const { db } = require('../db/index');
const {
  CLASSIFICACAO_SELECT,
  CLASSIFICACAO_JOIN,
  decorarDespesaComFinalidade,
} = require('../db/transparencia-classificacao-repo');
const { FINALIDADES, getFinalidadeMeta } = require('./finalidade');
const { comLinkPortal } = require('./portal-links');
const { agruparPorMandato, mandatoInicio, mandatoLabel } = require('../utils/mandato');

const MANDATO_ANOS = 4;
const LIMITE_CREDORES = 15;
const LIMITE_EMPENHOS_RECENTES = 20;

const DESCRICOES = Object.freeze({
  ordem_pagamento: 'Pagamento de despesa ja empenhada ou movimento extraorcamentario; nao conta como novo empenho orcamentario.',
  licitacao: 'Empenhos vinculados a documento municipal, modalidade ou referencia de licitacao.',
  diaria_servidor: 'Diarias e deslocamentos pagos a servidor ou agente identificado pelo portal.',
  transferencia_entidade: 'Repasses, subvencoes, convenios, termos de fomento ou colaboracao com entidades.',
  pessoal_encargos: 'Folha, vencimentos, encargos patronais e obrigacoes de pessoal.',
  auxilio_pf: 'Auxilios e apoios financeiros a pessoa fisica, sem identificacao de CPF publico.',
  distribuicao_gratuita: 'Material, bem ou servico adquirido para distribuicao gratuita a cidadaos.',
  premiacao: 'Premiacoes culturais, cientificas, artisticas ou desportivas.',
  servico_pf: 'Contratacao de servicos de pessoa fisica.',
  servico_pj_sem_licitacao: 'Servicos de pessoa juridica sem licitacao vinculada na base municipal.',
  investimento: 'Obras, equipamentos e outros itens do grupo de investimento.',
  sentenca_judicial: 'Pagamentos de sentencas judiciais.',
  indenizacao_restituicao: 'Indenizacoes e restituicoes pagas pelo municipio.',
  outros: 'Empenhos sem evidencia suficiente para uma regra mais especifica.',
});

const REGRAS = Object.freeze({
  ordem_pagamento: 'Prioridade maxima quando o tipo comeca com OP.',
  licitacao: 'Vence categorias genericas quando ha documento, referencia ou modalidade de licitacao.',
  diaria_servidor: 'Detectada por elemento 3.3.90.14 ou historico com diaria.',
  transferencia_entidade: 'Detectada por elemento 3.3.50 ou texto de repasse, convenio, APAE ou associacao.',
  pessoal_encargos: 'Detectada por grupo 3.1 ou textos de folha, vencimentos e encargos.',
  auxilio_pf: 'Detectada por elemento 3.3.90.48 ou textos de auxilio/subsidio.',
  distribuicao_gratuita: 'Detectada por elemento 3.3.90.32.',
  premiacao: 'Detectada por elemento 3.3.90.31.',
  servico_pf: 'Detectada por elemento 3.3.90.36.',
  servico_pj_sem_licitacao: 'Detectada por elementos 3.3.90.39 ou 3.3.93.39 sem licitacao vinculada.',
  investimento: 'Detectada por grupo 4.',
  sentenca_judicial: 'Detectada por elemento 3.3.90.91.',
  indenizacao_restituicao: 'Detectada por elementos 3.3.90.93, 94 ou 95.',
  outros: 'Fallback quando nenhuma regra anterior explica o empenho.',
});

function resolverExercicios({ exercicio, mandato } = {}) {
  const ano = Number(exercicio);
  if (Number.isInteger(ano) && ano > 0) { return [ano]; }

  const inicio = Number(mandato);
  if (Number.isInteger(inicio) && inicio > 0) {
    const base = mandatoInicio(inicio);
    return Array.from({ length: MANDATO_ANOS }, (_, i) => base + i);
  }
  return undefined;
}

function montarPeriodo({ exercicio, mandato }, serieAnual) {
  const anos = (serieAnual || []).map((r) => Number(r.exercicio)).filter(Number.isInteger);
  const anosCobertos = anos.length ? [Math.min(...anos), Math.max(...anos)] : [];

  const ano = Number(exercicio);
  if (Number.isInteger(ano) && ano > 0) {
    const inicio = mandatoInicio(ano);
    return {
      exercicio: ano,
      mandato: { inicio, fim: inicio + MANDATO_ANOS - 1, label: mandatoLabel(inicio) },
      anos_cobertos: anosCobertos,
    };
  }

  const inicioMandato = Number(mandato);
  if (Number.isInteger(inicioMandato) && inicioMandato > 0) {
    const inicio = mandatoInicio(inicioMandato);
    return {
      exercicio: null,
      mandato: { inicio, fim: inicio + MANDATO_ANOS - 1, label: mandatoLabel(inicio) },
      anos_cobertos: anosCobertos,
    };
  }

  return { exercicio: null, mandato: null, anos_cobertos: anosCobertos };
}

function finalidadePublica(classe, extra = {}) {
  const meta = getFinalidadeMeta(classe);
  return {
    classe,
    rotulo: meta.rotulo,
    tom: meta.tom,
    descricao: DESCRICOES[classe] || DESCRICOES.outros,
    regra: REGRAS[classe] || REGRAS.outros,
    ...extra,
  };
}

function filtroExercicios(exercicios, alias = 'td') {
  const lista = (exercicios || []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!lista.length) { return { sql: '1=1', params: [] }; }
  return {
    sql: `${alias}.exercicio_orcamento IN (${lista.map(() => '?').join(', ')})`,
    params: lista,
  };
}

function getFinalidadeTotalPorAno() {
  return db.prepare(`
    SELECT td.exercicio_orcamento AS exercicio,
           COUNT(*) AS n,
           ROUND(SUM(td.valor), 2) AS valor_total
    FROM transparencia_despesas td
    JOIN transparencia_despesas_classificacoes tdc ON tdc.despesa_id = td.id
    GROUP BY td.exercicio_orcamento
    ORDER BY td.exercicio_orcamento ASC
  `).all();
}

function getFinalidadePorAno(classe) {
  return db.prepare(`
    SELECT td.exercicio_orcamento AS exercicio,
           COUNT(*) AS n,
           ROUND(SUM(td.valor), 2) AS valor_total
    FROM transparencia_despesas td
    JOIN transparencia_despesas_classificacoes tdc ON tdc.despesa_id = td.id
    WHERE tdc.classe_principal = ?
    GROUP BY td.exercicio_orcamento
    ORDER BY td.exercicio_orcamento ASC
  `).all(classe);
}

function getFinalidadesResumo({ exercicio, mandato } = {}) {
  const exercicios = resolverExercicios({ exercicio, mandato });
  const ex = filtroExercicios(exercicios);
  const serieTotal = getFinalidadeTotalPorAno();

  const rows = db.prepare(`
    SELECT tdc.classe_principal AS classe,
           COUNT(*) AS n,
           ROUND(SUM(td.valor), 2) AS valor_total,
           COUNT(DISTINCT COALESCE(td.credor_chave, td.credor_nome)) AS n_credores
    FROM transparencia_despesas td
    JOIN transparencia_despesas_classificacoes tdc ON tdc.despesa_id = td.id
    WHERE ${ex.sql}
    GROUP BY tdc.classe_principal
    ORDER BY valor_total DESC
  `).all(...ex.params);

  const finalidades = rows.map((row) => finalidadePublica(row.classe, {
    n: Number(row.n) || 0,
    valor_total: Number(row.valor_total) || 0,
    n_credores: Number(row.n_credores) || 0,
  }));

  return {
    periodo: montarPeriodo({ exercicio, mandato }, serieTotal),
    por_mandato: agruparPorMandato(serieTotal, {
      anoKey: 'exercicio',
      camposSoma: ['n', 'valor_total'],
    }),
    finalidades,
    total: {
      n_empenhos: finalidades.reduce((acc, item) => acc + item.n, 0),
      valor_total: Math.round(finalidades.reduce((acc, item) => acc + item.valor_total, 0) * 100) / 100,
      n_finalidades: finalidades.length,
    },
  };
}

function getResumoClasse(classe, exercicios) {
  const ex = filtroExercicios(exercicios);
  return db.prepare(`
    SELECT COUNT(*) AS n_empenhos,
           ROUND(IFNULL(SUM(td.valor), 0), 2) AS valor_total,
           COUNT(DISTINCT COALESCE(td.credor_chave, td.credor_nome)) AS n_credores,
           COUNT(DISTINCT td.unidade) AS n_unidades,
           COUNT(DISTINCT td.fonte_recurso) AS n_fontes
    FROM transparencia_despesas td
    JOIN transparencia_despesas_classificacoes tdc ON tdc.despesa_id = td.id
    WHERE tdc.classe_principal = ? AND ${ex.sql}
  `).get(classe, ...ex.params);
}

function getTopCredoresClasse(classe, exercicios, limite = LIMITE_CREDORES) {
  const ex = filtroExercicios(exercicios);
  return db.prepare(`
    SELECT td.credor_nome,
           td.credor_cnpj,
           td.credor_chave,
           MAX(td.credor_cargo) AS credor_cargo,
           COUNT(*) AS n,
           ROUND(SUM(td.valor), 2) AS valor_total
    FROM transparencia_despesas td
    JOIN transparencia_despesas_classificacoes tdc ON tdc.despesa_id = td.id
    WHERE tdc.classe_principal = ?
      AND ${ex.sql}
      AND td.credor_nome IS NOT NULL
    GROUP BY COALESCE(td.credor_chave, td.credor_nome)
    ORDER BY valor_total DESC
    LIMIT ?
  `).all(classe, ...ex.params, Number(limite));
}

function getAgregadoClasse(classe, exercicios, coluna) {
  const ex = filtroExercicios(exercicios);
  return db.prepare(`
    SELECT td.${coluna} AS chave,
           COUNT(*) AS n,
           ROUND(SUM(td.valor), 2) AS valor_total
    FROM transparencia_despesas td
    JOIN transparencia_despesas_classificacoes tdc ON tdc.despesa_id = td.id
    WHERE tdc.classe_principal = ? AND ${ex.sql}
    GROUP BY td.${coluna}
    ORDER BY valor_total DESC
  `).all(classe, ...ex.params);
}

function getEmpenhosRecentesClasse(classe, exercicios, limite = LIMITE_EMPENHOS_RECENTES) {
  const ex = filtroExercicios(exercicios);
  const rows = db.prepare(`
    SELECT
      td.id, td.exercicio_orcamento, td.empenho, td.tipo,
      td.data_empenho, td.data_liquidacao, td.data_pagamento,
      td.credor_nome, td.credor_cnpj, td.credor_chave,
      td.valor, td.funcao, td.unidade, td.programa,
      td.categoria_economica, td.fonte_recurso,
      td.historico, td.modalidade, td.licitacao_ref,
      td.documento_id,
      d.titulo AS documento_titulo, d.numero AS documento_numero,
      ${CLASSIFICACAO_SELECT}
    FROM transparencia_despesas td
    ${CLASSIFICACAO_JOIN}
    LEFT JOIN documentos d ON d.id = td.documento_id
    WHERE tdc.classe_principal = ? AND ${ex.sql}
    ORDER BY td.data_empenho DESC, td.id DESC
    LIMIT ?
  `).all(classe, ...ex.params, Number(limite)).map(decorarDespesaComFinalidade);

  return comLinkPortal(rows);
}

function getFinalidadeDossie(classe, { exercicio, mandato } = {}) {
  if (!FINALIDADES[classe]) { return null; }

  const exercicios = resolverExercicios({ exercicio, mandato });
  const porAno = getFinalidadePorAno(classe);
  const resumo = getResumoClasse(classe, exercicios);

  return {
    finalidade: finalidadePublica(classe),
    periodo: montarPeriodo({ exercicio, mandato }, porAno),
    resumo: {
      n_empenhos: Number(resumo?.n_empenhos) || 0,
      valor_total: Number(resumo?.valor_total) || 0,
      n_credores: Number(resumo?.n_credores) || 0,
      n_unidades: Number(resumo?.n_unidades) || 0,
      n_fontes: Number(resumo?.n_fontes) || 0,
    },
    por_ano: porAno,
    por_mandato: agruparPorMandato(porAno, {
      anoKey: 'exercicio',
      camposSoma: ['n', 'valor_total'],
    }),
    top_credores: getTopCredoresClasse(classe, exercicios),
    por_unidade: getAgregadoClasse(classe, exercicios, 'unidade').map((row) => ({
      unidade: row.chave,
      n: row.n,
      valor_total: row.valor_total,
    })),
    por_fonte: getAgregadoClasse(classe, exercicios, 'fonte_recurso').map((row) => ({
      fonte_recurso: row.chave,
      n: row.n,
      valor_total: row.valor_total,
    })),
    empenhos_recentes: getEmpenhosRecentesClasse(classe, exercicios),
  };
}

module.exports = {
  getFinalidadesResumo,
  getFinalidadeDossie,
  resolverExercicios,
  finalidadePublica,
};
