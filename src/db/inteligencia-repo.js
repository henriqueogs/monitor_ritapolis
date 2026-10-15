'use strict';

/**
 * Repositório de inteligência financeira — Monitor Ritápolis.
 * Análises sobre transparencia_despesas: concentração, anomalias, evolução e ranking.
 * Todas as funções retornam dados pré-calculados prontos para o frontend.
 */

const { db } = require('./index');
const config = require('../config');
const { SQL_TIPO_ORDINARIO, sqlTipoOrdinario } = require('../transparencia/tipo-empenho');
const { anosReferenciaYoY, janelaAnos, limiarDispensa } = require('../inteligencia/periodo-inteligencia');

// Exercícios com volume suficiente para análise (mesma regra do seletor do painel).
const MIN_EMPENHOS_ANO_SIGNIFICATIVO = 100;

function listarAnosSignificativos(anoMin = config.inteligenciaAnoMin) {
  return db.prepare(`
    SELECT exercicio_orcamento AS ano FROM transparencia_despesas
    WHERE exercicio_orcamento >= ?
    GROUP BY exercicio_orcamento
    HAVING COUNT(*) > ?
    ORDER BY exercicio_orcamento ASC
  `).all(anoMin, MIN_EMPENHOS_ANO_SIGNIFICATIVO).map((r) => r.ano);
}

// Análises estatísticas olham gasto real: OP duplicaria o empenho e EE/EG são previsão.
const ORDINARIO = SQL_TIPO_ORDINARIO;
const ORDINARIO_TD = sqlTipoOrdinario('td');

// CNPJs que representam a própria Prefeitura/entidades governamentais obrigatórias
// e não devem ser considerados "fornecedores privados" na análise de concentração.
const CNPJS_EXCLUIR_CONCENTRACAO = [
  '18557553000105', // CNPJ Prefeitura de Ritápolis
  '26148056000181', // CNPJ Câmara Municipal
];
const NOMES_EXCLUIR_CONCENTRACAO = [
  'FOLHA DE PAGAMENTO',
  'INSS',
  'FUNDO DE PREVIDÊNCIA',
  'PASEP',
  'IRRF',
];

function isEntidadeGov(credor_nome, credor_cnpj) {
  if (!credor_cnpj) {return true;} // sem CNPJ = provável folha / repasse
  if (CNPJS_EXCLUIR_CONCENTRACAO.includes(credor_cnpj)) {return true;}
  const nome = String(credor_nome || '').toUpperCase();
  return NOMES_EXCLUIR_CONCENTRACAO.some((n) => nome.includes(n));
}

// ---------------------------------------------------------------------------
// B1 — Concentração de fornecedores
// ---------------------------------------------------------------------------

/** Exercício padrão das rotas: último ano com dados significativos (null se não houver). */
function getExercicioPadrao() {
  const anos = listarAnosSignificativos();
  return anos.length ? anos[anos.length - 1] : null;
}

/**
 * Calcula concentração de fornecedores por exercício.
 * Exclui folha de pagamento e entidades governamentais.
 * Retorna top credores, % share, índice HHI e alertas.
 * @param {number} exercicio
 */
function getConcentracaoCredores(exercicio) {
  const rows = db.prepare(`
    SELECT
      credor_cnpj,
      credor_nome,
      COUNT(*)              AS n_empenhos,
      ROUND(SUM(valor), 2)  AS valor_total,
      MIN(exercicio_orcamento) AS primeiro_ano,
      MAX(exercicio_orcamento) AS ultimo_ano,
      COUNT(DISTINCT funcao) AS n_funcoes
    FROM transparencia_despesas
    WHERE exercicio_orcamento = ?
      AND ${ORDINARIO}
      AND credor_cnpj IS NOT NULL
      AND credor_cnpj != ''
    GROUP BY credor_cnpj
    ORDER BY valor_total DESC
  `).all(exercicio);

  // Linhas ordinárias sem CNPJ (folha etc.) ficam fora do ranking: expõe o total à parte
  // para que total_geral + total_sem_cnpj feche com o total do exercício (evolução).
  const semCnpj = db.prepare(`
    SELECT ROUND(IFNULL(SUM(valor), 0), 2) AS total
    FROM transparencia_despesas
    WHERE exercicio_orcamento = ? AND ${ORDINARIO}
      AND (credor_cnpj IS NULL OR credor_cnpj = '')
  `).get(exercicio);

  // Filtrar entidades gov para o cálculo de concentração de mercado
  const privados = rows.filter((r) => !isEntidadeGov(r.credor_nome, r.credor_cnpj));
  const totalPrivado = privados.reduce((s, r) => s + r.valor_total, 0);
  const totalGeral = rows.reduce((s, r) => s + r.valor_total, 0);

  // Percentual de share e contribuição HHI
  const credoresComShare = privados.map((r) => {
    const share = totalPrivado > 0 ? (r.valor_total / totalPrivado) * 100 : 0;
    return {
      ...r,
      share_pct: Math.round(share * 10) / 10,
      hhi_contribution: Math.round(share * share * 10) / 10,
    };
  });

  const hhi = Math.round(credoresComShare.reduce((s, r) => s + r.hhi_contribution, 0));

  // Alertas
  const alertas = [];
  if (hhi > 2500) {
    alertas.push({ nivel: 'alto', mensagem: `HHI ${hhi} — mercado altamente concentrado (>2500)` });
  } else if (hhi > 1500) {
    alertas.push({ nivel: 'medio', mensagem: `HHI ${hhi} — concentração moderada (1500-2500)` });
  }
  const top1 = credoresComShare[0];
  if (top1 && top1.share_pct > 25) {
    alertas.push({
      nivel: 'alto',
      mensagem: `${top1.credor_nome} detém ${top1.share_pct}% dos contratos privados em ${exercicio}`,
    });
  }

  // Credores que aparecem só neste ano (possível oportunismo)
  const exclusivos = credoresComShare.filter(
    (r) => r.primeiro_ano === exercicio && r.ultimo_ano === exercicio
  );

  return {
    exercicio,
    total_geral: totalGeral,
    total_sem_cnpj: semCnpj?.total || 0,
    total_privado: totalPrivado,
    pct_privado: totalGeral > 0 ? Math.round((totalPrivado / totalGeral) * 100) : 0,
    n_credores: rows.length,
    n_credores_privados: privados.length,
    hhi,
    classificacao_hhi: hhi > 2500 ? 'alta' : hhi > 1500 ? 'moderada' : 'baixa',
    alertas,
    top_credores: credoresComShare.slice(0, 20),
    credores_exclusivos_ano: exclusivos.slice(0, 10),
  };
}

/**
 * Concentração comparada entre todos os exercícios disponíveis.
 */
function getConcentracaoHistorico() {
  // Mesma regra de volume da evolução e do painel (ano quase vazio não entra no histórico).
  const exercicios = listarAnosSignificativos().reverse();

  return exercicios.map((ano) => {
    const c = getConcentracaoCredores(ano);
    return {
      exercicio: ano,
      hhi: c.hhi,
      classificacao: c.classificacao_hhi,
      n_credores_privados: c.n_credores_privados,
      top_credor_nome: c.top_credores[0]?.credor_nome || null,
      top_credor_share: c.top_credores[0]?.share_pct || 0,
      total_privado: c.total_privado,
    };
  });
}

// ---------------------------------------------------------------------------
// B2 — Detecção de anomalias / empenhos atípicos
// ---------------------------------------------------------------------------

/**
 * Estatísticas por funcao + exercicio para calcular outliers.
 * SQLite não tem STDDEV nativo — calcula via fórmula VAR = E[X²] - E[X]².
 */
function getEstatisticasPorFuncao(exercicio) {
  return db.prepare(`
    SELECT
      funcao,
      COUNT(*)             AS n,
      ROUND(AVG(valor), 2) AS media,
      ROUND(
        SQRT(MAX(0, AVG(valor * valor) - AVG(valor) * AVG(valor))),
        2
      )                    AS stddev,
      MIN(valor)           AS minimo,
      MAX(valor)           AS maximo,
      ROUND(SUM(valor), 2) AS total
    FROM transparencia_despesas
    WHERE exercicio_orcamento = ? AND funcao IS NOT NULL AND valor > 0 AND ${ORDINARIO}
    GROUP BY funcao
    HAVING COUNT(*) >= 5
    ORDER BY total DESC
  `).all(exercicio);
}

/**
 * Retorna empenhos atípicos (> média + 2.5σ da sua funcao) para um exercício.
 * Também detecta possível fracionamento: mesmo credor, mesma semana, >3 empenhos.
 */
function getEmpenhoAtipicos(exercicio) {
  // 1. Outliers por valor estatístico
  const stats = getEstatisticasPorFuncao(exercicio);
  const statsMap = new Map(stats.map((s) => [s.funcao, s]));

  const candidatos = db.prepare(`
    SELECT
      td.id, td.exercicio_orcamento, td.empenho, td.tipo,
      td.data_empenho, td.credor_nome, td.credor_cnpj,
      td.valor, td.funcao, td.subfuncao, td.historico,
      td.documento_id,
      d.titulo AS documento_titulo
    FROM transparencia_despesas td
    LEFT JOIN documentos d ON d.id = td.documento_id
    WHERE td.exercicio_orcamento = ? AND td.funcao IS NOT NULL AND td.valor > 0 AND ${ORDINARIO_TD}
    ORDER BY td.valor DESC
    LIMIT 500
  `).all(exercicio);

  const outliers = [];
  for (const emp of candidatos) {
    const s = statsMap.get(emp.funcao);
    if (!s || s.stddev === 0) {continue;}
    const zscore = (emp.valor - s.media) / s.stddev;
    if (zscore >= 2.5) {
      outliers.push({
        ...emp,
        zscore: Math.round(zscore * 10) / 10,
        media_funcao: s.media,
        stddev_funcao: s.stddev,
        tipo_alerta: 'valor_atipico',
      });
    }
  }

  // 2. Possível fracionamento: mesmo credor, mesma semana, ≥3 empenhos < limiar de dispensa
  // Limiar de dispensa por regime/ano (periodo-inteligencia); ano sem valor conferido vem marcado.
  // Exclui folha de pagamento (muitos empenhos individuais por natureza)
  const limiar = limiarDispensa(exercicio);
  const LIMIAR_DISPENSA = limiar.valor;
  const fracionamento = db.prepare(`
    SELECT
      credor_cnpj, credor_nome,
      strftime('%Y-%W', data_empenho) AS semana,
      COUNT(*)              AS n_empenhos,
      ROUND(SUM(valor), 2)  AS valor_semana,
      MIN(data_empenho)     AS inicio,
      MAX(data_empenho)     AS fim,
      GROUP_CONCAT(empenho, ', ') AS empenhos_lista
    FROM transparencia_despesas
    WHERE exercicio_orcamento = ?
      AND ${ORDINARIO}
      AND credor_cnpj IS NOT NULL
      AND valor > 0
      AND valor < ?
      AND data_empenho IS NOT NULL
      AND UPPER(credor_nome) NOT LIKE '%FOLHA%PAGAMENTO%'
      AND UPPER(credor_nome) NOT LIKE '%PAGAMENTO%FOLHA%'
      AND UPPER(credor_nome) NOT LIKE '%13%SALARIO%'
      AND UPPER(credor_nome) NOT LIKE '%INSS%'
      AND UPPER(credor_nome) NOT LIKE '%FUNDO DE PREVIDÊNCIA%'
      AND UPPER(credor_nome) NOT LIKE '%CEMIG%'
      AND UPPER(credor_nome) NOT LIKE '%ENERGIA%MINAS%'
      AND UPPER(credor_nome) NOT LIKE '%SEGURADORA%'
      AND UPPER(credor_nome) NOT LIKE '%SEGUROS%'
    GROUP BY credor_cnpj, strftime('%Y-%W', data_empenho)
    HAVING COUNT(*) >= 3 AND SUM(valor) > ?
    ORDER BY valor_semana DESC
    LIMIT 20
  `).all(exercicio, LIMIAR_DISPENSA, LIMIAR_DISPENSA);

  return {
    exercicio,
    outliers_valor: outliers.slice(0, 20),
    possivel_fracionamento: fracionamento.map((r) => ({
      ...r,
      tipo_alerta: 'possivel_fracionamento',
      mensagem: `${r.n_empenhos} empenhos na semana ${r.semana} totalizam R$ ${(r.valor_semana).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} — abaixo do limiar individual mas acima coletivamente`,
    })),
    limiar_dispensa: LIMIAR_DISPENSA,
    limiar_dispensa_fonte: limiar.fonte,
    limiar_dispensa_extrapolado: limiar.extrapolado,
    total_outliers: outliers.length,
    total_fracionamento: fracionamento.length,
  };
}

// ---------------------------------------------------------------------------
// B3 — Evolução por área funcional entre exercícios
// ---------------------------------------------------------------------------

/**
 * Evolução anual de gastos por funcao, com crescimento YoY.
 * Retorna séries temporais por área de governo.
 */
function getEvolucaoFuncoes({ anosMin, anosMax, anoAtual = new Date().getFullYear() } = {}) {
  if (anosMin === undefined || anosMax === undefined) {
    const janela = janelaAnos({
      anosDisponiveis: listarAnosSignificativos(),
      anoMin: config.inteligenciaAnoMin,
    });
    if (!janela) {
      return {
        sem_dados: true,
        anos_range: null,
        total_por_ano: [],
        por_funcao: [],
        ano_ref: null,
        ano_anterior: null,
        ano_parcial: null,
        yoy_indisponivel: true,
      };
    }
    anosMin = anosMin ?? janela.anosMin;
    anosMax = anosMax ?? janela.anosMax;
  }

  const porFuncaoAno = db.prepare(`
    SELECT
      funcao,
      exercicio_orcamento       AS ano,
      COUNT(*)                  AS n_empenhos,
      ROUND(SUM(valor), 2)      AS valor_total,
      COUNT(DISTINCT credor_cnpj) AS n_credores
    FROM transparencia_despesas
    WHERE funcao IS NOT NULL
      AND ${ORDINARIO}
      AND exercicio_orcamento BETWEEN ? AND ?
    GROUP BY funcao, exercicio_orcamento
    ORDER BY funcao, exercicio_orcamento
  `).all(anosMin, anosMax);

  // Agrupar por funcao
  const porFuncao = new Map();
  for (const row of porFuncaoAno) {
    if (!porFuncao.has(row.funcao)) {
      porFuncao.set(row.funcao, { funcao: row.funcao, anos: {} });
    }
    porFuncao.get(row.funcao).anos[row.ano] = {
      valor_total: row.valor_total,
      n_empenhos: row.n_empenhos,
      n_credores: row.n_credores,
    };
  }

  // Calcular crescimento YoY para cada funcao (comparando último ano completo)
  const { ano_ref: anoRef, ano_anterior: anoAnterior, ano_parcial: anoParcial } = anosReferenciaYoY({
    anosMax,
    anoAtual,
  });
  // Sem os dois anos dentro da janela não há crescimento calculável (não mostra "2025→2026" vazio).
  const yoyIndisponivel = anoAnterior < anosMin || anoRef > anosMax;

  const resultado = [...porFuncao.values()]
    .map((f) => {
      const valRef = f.anos[anoRef]?.valor_total || 0;
      const valAnt = f.anos[anoAnterior]?.valor_total || 0;
      const crescimento_yoy = valAnt > 0 ? Math.round(((valRef - valAnt) / valAnt) * 100) : null;
      const total_periodo = Object.values(f.anos).reduce((s, a) => s + a.valor_total, 0);
      return { ...f, crescimento_yoy, total_periodo };
    })
    .sort((a, b) => b.total_periodo - a.total_periodo);

  // Total geral por ano
  const totalPorAno = db.prepare(`
    SELECT exercicio_orcamento AS ano, ROUND(SUM(valor), 2) AS total
    FROM transparencia_despesas
    WHERE exercicio_orcamento BETWEEN ? AND ? AND ${ORDINARIO}
    GROUP BY exercicio_orcamento ORDER BY ano
  `).all(anosMin, anosMax);

  return {
    anos_range: { min: anosMin, max: anosMax },
    ano_ref: anoRef,
    ano_anterior: anoAnterior,
    ano_parcial: anoParcial,
    yoy_indisponivel: yoyIndisponivel,
    total_por_ano: totalPorAno,
    por_funcao: resultado,
  };
}

// ---------------------------------------------------------------------------
// B4 — Ranking de credores por área de governo (funcao)
// ---------------------------------------------------------------------------

/**
 * Para cada funcao, retorna os top credores privados e sua % da área.
 * @param {number} exercicio
 * @param {number} topN — número de credores por área
 */
function getRankingPorFuncao(exercicio, topN = 5) {
  // Total por funcao
  const totaisFuncao = db.prepare(`
    SELECT funcao, ROUND(SUM(valor), 2) AS total_funcao, COUNT(DISTINCT credor_cnpj) AS n_credores
    FROM transparencia_despesas
    WHERE exercicio_orcamento = ? AND funcao IS NOT NULL AND ${ORDINARIO}
    GROUP BY funcao
    ORDER BY total_funcao DESC
  `).all(exercicio);

  // Top credores por funcao (excluindo entidades gov)
  const credoresPorFuncao = db.prepare(`
    SELECT funcao, credor_cnpj, credor_nome,
      ROUND(SUM(valor), 2)  AS valor_total,
      COUNT(*)              AS n_empenhos
    FROM transparencia_despesas
    WHERE exercicio_orcamento = ?
      AND ${ORDINARIO}
      AND funcao IS NOT NULL
      AND credor_cnpj IS NOT NULL
    GROUP BY funcao, credor_cnpj
    ORDER BY funcao, valor_total DESC
  `).all(exercicio);

  // Agrupar por funcao
  const byFuncao = new Map();
  for (const tf of totaisFuncao) {
    byFuncao.set(tf.funcao, { ...tf, credores: [] });
  }
  for (const c of credoresPorFuncao) {
    const f = byFuncao.get(c.funcao);
    if (!f || isEntidadeGov(c.credor_nome, c.credor_cnpj)) {continue;}
    if (f.credores.length < topN) {
      f.credores.push({
        ...c,
        share_pct: Math.round((c.valor_total / f.total_funcao) * 1000) / 10,
      });
    }
  }

  return {
    exercicio,
    funcoes: [...byFuncao.values()].filter((f) => f.total_funcao > 0),
  };
}

// ---------------------------------------------------------------------------
// Painel geral de inteligência — single call para o frontend
// ---------------------------------------------------------------------------

/**
 * Agrega todos os dados de inteligência em uma resposta única.
 * Exercício padrão = último ano com dados significativos.
 */
function getPainelInteligencia(exercicio) {
  const anosSignificativos = listarAnosSignificativos();
  const anoAlvo = exercicio || anosSignificativos[anosSignificativos.length - 1] || null;

  const anosDisponiveis = db
    .prepare(
      `SELECT DISTINCT exercicio_orcamento AS ano FROM transparencia_despesas
       GROUP BY exercicio_orcamento HAVING COUNT(*) > ${MIN_EMPENHOS_ANO_SIGNIFICATIVO}
       ORDER BY exercicio_orcamento DESC`
    )
    .all()
    .map((r) => r.ano);

  // Sem nenhum ano com dados: não inventa exercício (antes caía em 2025).
  if (!anoAlvo) {
    return {
      exercicio: null,
      sem_dados: true,
      anos_disponiveis: anosDisponiveis,
      concentracao: null,
      concentracao_historico: [],
      anomalias: null,
      evolucao: null,
      ranking_por_funcao: null,
    };
  }

  return {
    exercicio: anoAlvo,
    anos_disponiveis: anosDisponiveis,
    concentracao: getConcentracaoCredores(anoAlvo),
    concentracao_historico: getConcentracaoHistorico(),
    anomalias: getEmpenhoAtipicos(anoAlvo),
    evolucao: getEvolucaoFuncoes(),
    ranking_por_funcao: getRankingPorFuncao(anoAlvo),
  };
}

module.exports = {
  getConcentracaoCredores,
  getConcentracaoHistorico,
  getEmpenhoAtipicos,
  getEvolucaoFuncoes,
  getRankingPorFuncao,
  getPainelInteligencia,
  getExercicioPadrao,
};
