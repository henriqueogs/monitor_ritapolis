'use strict';

/**
 * Deep-links para o portal de transparência da fonte (SH3).
 * Formato validado contra o portal real em 2026-07-02:
 *   Detalhamento_Despesa.php?ID8_DESP={empenho sem hífen}&STR_EXR_EXR={exercício}
 *     &CHAR_ID_EMP=1&LG_OP_DESP={S para Ordem de Pagamento, N demais tipos}
 * Campo inválido ⇒ fallback pra listagem genérica com `especifico: false`,
 * nunca URL malformada (regra de produto §11.3 — rótulo honesto na UI).
 */

const PORTAL_TEMPO_REAL_URL = 'https://pt.ritapolis.mg.gov.br/Tempo_Real_Despesa';
const PORTAL_DETALHE_DESPESA_URL =
  'https://pt.ritapolis.mg.gov.br/Relatorios/Detalhamento_Despesa.php';

// Entidade 1 = Prefeitura — única publicada em pt.ritapolis.mg.gov.br
const CHAR_ID_EMP_PREFEITURA = '1';
const EMPENHO_PATTERN = /^\d{5}-\d{3}$/;
const EXERCICIO_MIN = 1990;
const EXERCICIO_MAX = 2100;

const FALLBACK = Object.freeze({ url: PORTAL_TEMPO_REAL_URL, especifico: false });

function isOrdemDePagamento(tipo) {
  return String(tipo || '')
    .trim()
    .toUpperCase()
    .startsWith('OP');
}

/**
 * @param {{ empenho?: string, exercicio?: number|string, tipo?: string }} dados
 * @returns {{ url: string, especifico: boolean }}
 */
function buildPortalDespesaLink({ empenho, exercicio, tipo } = {}) {
  if (typeof empenho !== 'string' || !EMPENHO_PATTERN.test(empenho)) {return FALLBACK;}

  const ano = Number(exercicio);
  if (!Number.isInteger(ano) || ano < EXERCICIO_MIN || ano > EXERCICIO_MAX) {return FALLBACK;}

  const params = new URLSearchParams({
    ID8_DESP: empenho.replace('-', ''),
    STR_EXR_EXR: String(ano),
    CHAR_ID_EMP: CHAR_ID_EMP_PREFEITURA,
    LG_OP_DESP: isOrdemDePagamento(tipo) ? 'S' : 'N',
  });
  return { url: `${PORTAL_DETALHE_DESPESA_URL}?${params}`, especifico: true };
}

/**
 * Mapper puro: adiciona `portal: { url, especifico }` a cada row de empenho.
 * @param {Array<object>} rows
 * @param {{ exercicioKey?: string }} opcoes — use 'ano' quando a row vem do perfil de credor
 */
function comLinkPortal(rows, { exercicioKey = 'exercicio_orcamento' } = {}) {
  if (!Array.isArray(rows)) {return [];}
  return rows.map((row) => ({
    ...row,
    portal: buildPortalDespesaLink({
      empenho: row?.empenho,
      exercicio: row?.[exercicioKey],
      tipo: row?.tipo,
    }),
  }));
}

module.exports = {
  buildPortalDespesaLink,
  comLinkPortal,
  PORTAL_TEMPO_REAL_URL,
  PORTAL_DETALHE_DESPESA_URL,
};
