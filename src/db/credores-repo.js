'use strict';

/**
 * Repositório de credores — Monitor Ritápolis.
 * Agrega dados de transparencia_despesas + licitacoes_detalhes para perfis
 * de credores por credor_chave: CNPJ (14 dígitos) pra empresas, 'pf-' + slug
 * do nome pra pessoas físicas (o portal não expõe CPF).
 */

const { db } = require('./index');
const { parseCredorChave } = require('../transparencia/credor-chave');
const { getFinalidadeMeta } = require('../transparencia/finalidade');

const FONTES_EXTERNAS_CREDORES = Object.freeze({
  receita_cnpj: {
    rotulo: 'Receita Federal - CNPJ',
    url: 'https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/dados-abertos/cadastros',
    escopo: 'natureza juridica, situacao cadastral e QSA quando importados',
  },
  consulta_cnpj: {
    rotulo: 'Conecta GOV - Consulta CNPJ',
    url: 'https://www.gov.br/conecta/catalogo/apis/consulta-cnpj',
    escopo: 'consulta pontual de dados cadastrais de CNPJ quando disponivel',
  },
  tse_candidatos: {
    rotulo: 'TSE - candidatos',
    url: 'https://dadosabertos.tse.jus.br/dataset/candidatos-2024',
    escopo: 'cargo disputado, partido e contexto eleitoral por nome',
  },
  tse_prestacao_contas: {
    rotulo: 'TSE - prestacao de contas',
    url: 'https://dadosabertos.tse.jus.br/dataset/prestacao-de-contas-eleitorais-2024',
    escopo: 'fornecedores e despesas de campanha quando importados',
  },
});

function parseJson(valor, fallback) {
  if (!valor) { return fallback; }
  try {
    return JSON.parse(valor);
  } catch {
    return fallback;
  }
}

function ensureCredoresEnriquecimentosSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS credores_enriquecimentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      credor_chave TEXT NOT NULL,
      tipo_credor TEXT NOT NULL,
      fonte TEXT NOT NULL,
      identificador TEXT NOT NULL,
      dados_json TEXT NOT NULL,
      confianca REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ok',
      consultado_em TEXT DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (credor_chave, fonte, identificador)
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_credores_enriq_chave ON credores_enriquecimentos(credor_chave);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_credores_enriq_fonte ON credores_enriquecimentos(fonte);');
}

ensureCredoresEnriquecimentosSchema();

function upsertCredorEnriquecimento({ credor_chave, tipo_credor, fonte, identificador, dados, confianca = 0.8, status = 'ok' }) {
  if (!credor_chave || !tipo_credor || !fonte || !identificador) {
    throw new Error('credor_chave, tipo_credor, fonte e identificador sao obrigatorios');
  }
  db.prepare(`
    INSERT INTO credores_enriquecimentos
      (credor_chave, tipo_credor, fonte, identificador, dados_json, confianca, status, consultado_em, atualizado_em)
    VALUES
      (@credor_chave, @tipo_credor, @fonte, @identificador, @dados_json, @confianca, @status, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (credor_chave, fonte, identificador) DO UPDATE SET
      tipo_credor = excluded.tipo_credor,
      dados_json = excluded.dados_json,
      confianca = excluded.confianca,
      status = excluded.status,
      consultado_em = excluded.consultado_em,
      atualizado_em = CURRENT_TIMESTAMP
  `).run({
    credor_chave,
    tipo_credor,
    fonte,
    identificador,
    dados_json: JSON.stringify(dados || {}),
    confianca,
    status,
  });
}

function listCredorEnriquecimentos(credorChave) {
  return db.prepare(`
    SELECT fonte, identificador, tipo_credor, dados_json, confianca, status, consultado_em, atualizado_em
    FROM credores_enriquecimentos
    WHERE credor_chave = ?
    ORDER BY fonte, consultado_em DESC
  `).all(credorChave).map((row) => ({
    ...row,
    fonte_rotulo: FONTES_EXTERNAS_CREDORES[row.fonte]?.rotulo || row.fonte,
    fonte_url: FONTES_EXTERNAS_CREDORES[row.fonte]?.url || null,
    dados: parseJson(row.dados_json, {}),
    dados_json: undefined,
  }));
}

function montarEnriquecimentoCredor({ tipo, chave, cargo }) {
  const fontes = listCredorEnriquecimentos(chave);
  const receita = fontes.find((row) => row.fonte === 'receita_cnpj') || null;
  const tse = fontes.filter((row) => row.fonte.startsWith('tse_'));

  return {
    fontes,
    receita: receita
      ? {
          natureza_juridica: receita.dados?.natureza_juridica || null,
          situacao_cadastral: receita.dados?.situacao_cadastral || null,
          qsa: Array.isArray(receita.dados?.qsa) ? receita.dados.qsa : [],
          consultado_em: receita.consultado_em,
          confianca: receita.confianca,
          fonte_url: receita.fonte_url,
        }
      : null,
    tse,
    fontes_previstas: Object.entries(FONTES_EXTERNAS_CREDORES).map(([id, meta]) => ({ id, ...meta })),
    limites:
      tipo === 'cnpj'
        ? 'Dados externos so aparecem quando importados para o cache auditavel; empenhos municipais continuam sendo a fonte principal.'
        : `Pessoa fisica sem CPF publico: cargo funcional vem do Portal da Transparencia${cargo ? ` (${cargo})` : ''}; TSE, quando houver, e apenas contexto por nome.`,
  };
}

function parseFinalidadesResumo(valor) {
  if (!valor) { return []; }
  return String(valor)
    .split('|')
    .filter(Boolean)
    .map((item) => {
      const [classe, n, valorTotal] = item.split(':');
      const meta = getFinalidadeMeta(classe);
      return {
        classe,
        rotulo: meta.rotulo,
        tom: meta.tom,
        n: Number(n) || 0,
        valor_total: Number(valorTotal) || 0,
      };
    });
}

function listFinalidadesCredor(credorChave) {
  return db.prepare(`
    SELECT tdc.classe_principal AS classe,
           COUNT(*) AS n,
           ROUND(SUM(td.valor), 2) AS valor_total
    FROM transparencia_despesas td
    JOIN transparencia_despesas_classificacoes tdc ON tdc.despesa_id = td.id
    WHERE td.credor_chave = ?
    GROUP BY tdc.classe_principal
    ORDER BY valor_total DESC
  `).all(credorChave).map((row) => {
    const meta = getFinalidadeMeta(row.classe);
    return {
      classe: row.classe,
      rotulo: meta.rotulo,
      tom: meta.tom,
      n: Number(row.n) || 0,
      valor_total: Number(row.valor_total) || 0,
    };
  });
}

// ── Listagem ──────────────────────────────────────────────────────────────────

/**
 * Lista credores com mais presença no sistema (empenhos reais).
 * Exclui folha de pagamento; inclui pessoas físicas (chave pf-).
 * @param {{ limite, pagina, busca, exercicio, exercicios, finalidade }} opcoes
 */
function listCredores({ limite = 50, pagina = 1, busca, exercicio, exercicios, finalidade } = {}) {
  const offset = (pagina - 1) * limite;
  const filters = [
    "credor_chave IS NOT NULL AND credor_chave != ''",
    "UPPER(credor_nome) NOT LIKE '%FOLHA%PAGAMENTO%'",
    "UPPER(credor_nome) NOT LIKE '%PAGAMENTO%FOLHA%'",
    "UPPER(credor_nome) NOT LIKE '%13%SALARIO%'",
  ];
  const params = [];
  const listaExercicios = (Array.isArray(exercicios) ? exercicios : [])
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);

  if (busca) {
    filters.push("UPPER(credor_nome) LIKE UPPER(?)");
    params.push(`%${busca}%`);
  }
  if (listaExercicios.length) {
    filters.push(`exercicio_orcamento IN (${listaExercicios.map(() => '?').join(', ')})`);
    params.push(...listaExercicios);
  } else if (exercicio) {
    filters.push('exercicio_orcamento = ?');
    params.push(exercicio);
  }
  if (finalidade) {
    filters.push(`EXISTS (
      SELECT 1
      FROM transparencia_despesas_classificacoes tdc_filter
      WHERE tdc_filter.despesa_id = transparencia_despesas.id
        AND tdc_filter.classe_principal = ?
    )`);
    params.push(finalidade);
  }

  const where = `WHERE ${filters.join(' AND ')}`;
  const baseCte = `WITH base AS (SELECT * FROM transparencia_despesas ${where})`;

  const total = db.prepare(`${baseCte} SELECT COUNT(DISTINCT credor_chave) n FROM base`).get(...params).n;

  const dados = db.prepare(`
    ${baseCte}
    SELECT
      credor_chave,
      MAX(credor_cnpj)                    AS credor_cnpj,
      credor_nome,
      COUNT(*)                            AS n_empenhos,
      ROUND(SUM(valor), 2)                AS valor_total,
      COUNT(DISTINCT exercicio_orcamento) AS n_anos,
      MIN(exercicio_orcamento)            AS primeiro_ano,
      MAX(exercicio_orcamento)            AS ultimo_ano,
      COUNT(DISTINCT funcao)              AS n_funcoes,
      (
        SELECT GROUP_CONCAT(classe_principal || ':' || n || ':' || valor, '|')
        FROM (
          SELECT
            tdc.classe_principal,
            COUNT(*) AS n,
            ROUND(SUM(b2.valor), 2) AS valor
          FROM base b2
          JOIN transparencia_despesas_classificacoes tdc ON tdc.despesa_id = b2.id
          WHERE b2.credor_chave = base.credor_chave
          GROUP BY tdc.classe_principal
          ORDER BY valor DESC
          LIMIT 3
        )
      ) AS finalidades_resumo
    FROM base
    GROUP BY credor_chave
    ORDER BY valor_total DESC
    LIMIT ? OFFSET ?
  `).all(...params, limite, offset).map((row) => ({
    ...row,
    finalidades: parseFinalidadesResumo(row.finalidades_resumo),
    finalidades_resumo: undefined,
  }));

  return { total, pagina, limite, dados };
}

// ── Perfil completo ───────────────────────────────────────────────────────────

/**
 * Retorna perfil detalhado de um credor pela credor_chave (aceita também CNPJ
 * formatado). PF não tem seções de licitação (empresa vence licitação, não o
 * servidor que recebe diária).
 */
function getCredorProfile(identificador) {
  const parsed = parseCredorChave(identificador);
  if (!parsed) {return null;}
  const { tipo, chave } = parsed;

  // ── Identidade ──
  const identidade = db.prepare(`
    SELECT credor_cnpj, credor_nome,
      MAX(credor_cargo)                   AS cargo,
      COUNT(*)                            AS n_empenhos,
      ROUND(SUM(valor), 2)                AS valor_total,
      MIN(data_empenho)                   AS primeiro_empenho,
      MAX(data_empenho)                   AS ultimo_empenho,
      MIN(exercicio_orcamento)            AS primeiro_ano,
      MAX(exercicio_orcamento)            AS ultimo_ano,
      COUNT(DISTINCT exercicio_orcamento) AS n_anos,
      COUNT(DISTINCT funcao)              AS n_funcoes
    FROM transparencia_despesas
    WHERE credor_chave = ?
  `).get(chave);

  if (!identidade || !identidade.n_empenhos) {return null;}

  // ── Histórico por ano ──
  const porAno = db.prepare(`
    SELECT
      exercicio_orcamento  AS ano,
      COUNT(*)             AS n_empenhos,
      ROUND(SUM(valor), 2) AS valor_total
    FROM transparencia_despesas
    WHERE credor_chave = ?
    GROUP BY ano ORDER BY ano
  `).all(chave);

  // ── Por área funcional ──
  const porFuncao = db.prepare(`
    SELECT
      funcao,
      COUNT(*)             AS n_empenhos,
      ROUND(SUM(valor), 2) AS valor_total
    FROM transparencia_despesas
    WHERE credor_chave = ? AND funcao IS NOT NULL
    GROUP BY funcao ORDER BY valor_total DESC
  `).all(chave);

  // ── Empenhos recentes ──
  const empenhosRecentes = db.prepare(`
    SELECT
      td.empenho, td.data_empenho, td.valor, td.funcao, td.historico, td.tipo,
      td.exercicio_orcamento AS ano,
      d.titulo               AS documento_titulo,
      d.id                   AS documento_id
    FROM transparencia_despesas td
    LEFT JOIN documentos d ON d.id = td.documento_id
    WHERE td.credor_chave = ?
    ORDER BY td.data_empenho DESC, td.valor DESC
    LIMIT 20
  `).all(chave);

  // Normalização de CNPJ em SQL — as colunas guardam formatos mistos
  const cnpjNorm = (col) => `REPLACE(REPLACE(REPLACE(REPLACE(${col}, '.', ''), '/', ''), '-', ''), ' ', '')`;

  // ── Licitações ganhas + perfil consolidado: só fazem sentido pra CNPJ ──
  const licitacoesGanhas = tipo === 'cnpj'
    ? db.prepare(`
        SELECT
          ld.documento_id, ld.vencedor_nome, ld.vencedor_cnpj,
          d.valor_estimado, ld.valor_final, ld.data_homologacao, ld.modalidade,
          d.titulo, d.ano, d.numero
        FROM licitacoes_detalhes ld
        JOIN documentos d ON d.id = ld.documento_id
        WHERE ${cnpjNorm('ld.vencedor_cnpj')} = ?
        ORDER BY d.ano DESC, ld.data_homologacao DESC
        LIMIT 20
      `).all(chave)
    : [];

  const perfil = tipo === 'cnpj'
    ? db.prepare(`
        SELECT nome_canonico, total_valor_vencedor, total_valor_produtos, total_valor_pago,
               n_vitorias, n_itens_produtos, n_licitacoes_vencedor, anos_ativos
        FROM fornecedores_perfil WHERE ${cnpjNorm('cnpj')} = ?
      `).get(chave)
    : null;

  // ── Tendência (crescimento último ano vs penúltimo) ──
  const ultimoAno = porAno[porAno.length - 1];
  const penultimoAno = porAno[porAno.length - 2];
  const crescimento_yoy = penultimoAno?.valor_total > 0
    ? Math.round(((ultimoAno?.valor_total - penultimoAno.valor_total) / penultimoAno.valor_total) * 100)
    : null;

  return {
    tipo: tipo === 'cnpj' ? 'pj' : 'pf',
    chave,
    cnpj: tipo === 'cnpj' ? chave : null,
    cargo: identidade.cargo || null,
    nome: identidade.credor_nome,
    nome_canonico: perfil?.nome_canonico || identidade.credor_nome,
    resumo: {
      n_empenhos: identidade.n_empenhos,
      valor_total: identidade.valor_total,
      n_anos: identidade.n_anos,
      primeiro_ano: identidade.primeiro_ano,
      ultimo_ano: identidade.ultimo_ano,
      n_funcoes: identidade.n_funcoes,
      primeiro_empenho: identidade.primeiro_empenho,
      ultimo_empenho: identidade.ultimo_empenho,
      crescimento_yoy,
      // Licitado vs pago: valor homologado em licitações vencidas (quando há perfil)
      total_licitado: perfil?.total_valor_vencedor || 0,
      total_pago: identidade.valor_total,
      n_licitacoes_vencidas: perfil?.n_licitacoes_vencedor || licitacoesGanhas.length,
    },
    por_ano: porAno,
    finalidades: listFinalidadesCredor(chave),
    por_funcao: porFuncao,
    empenhos_recentes: empenhosRecentes,
    licitacoes_ganhas: licitacoesGanhas,
    perfil_consolidado: perfil || null,
    enriquecimento: montarEnriquecimentoCredor({ tipo, chave, cargo: identidade.cargo || null }),
  };
}

/**
 * CNPJs de credores que precisam de enriquecimento cadastral (fonte
 * receita_cnpj): nunca consultados, com falha anterior, ou defasados além de
 * maxIdadeDias. Ordena pelos mais ativos (mais empenhos) para priorizar ROI.
 */
function listCnpjsParaEnriquecer({ limite = 100, maxIdadeDias = 90, force = false } = {}) {
  return db.prepare(`
    SELECT td.credor_cnpj AS cnpj,
           td.credor_cnpj AS chave,
           MAX(td.credor_nome) AS nome,
           COUNT(*) AS n
    FROM transparencia_despesas td
    LEFT JOIN credores_enriquecimentos ce
      ON ce.credor_chave = td.credor_cnpj AND ce.fonte = 'receita_cnpj'
    WHERE td.credor_cnpj IS NOT NULL
      AND LENGTH(td.credor_cnpj) = 14
      AND (
        ? = 1
        OR ce.id IS NULL
        OR ce.status != 'ok'
        OR julianday('now') - julianday(ce.consultado_em) > ?
      )
    GROUP BY td.credor_cnpj
    ORDER BY n DESC
    LIMIT ?
  `).all(force ? 1 : 0, Number(maxIdadeDias), Number(limite));
}

module.exports = {
  listCredores,
  getCredorProfile,
  upsertCredorEnriquecimento,
  listCredorEnriquecimentos,
  listCnpjsParaEnriquecer,
  FONTES_EXTERNAS_CREDORES,
};
