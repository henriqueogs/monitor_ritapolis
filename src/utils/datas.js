'use strict';

// Inferência do ano de referência de um documento a partir dos sinais
// disponíveis. Usado tanto na coleta (preencher `ano`) quanto no backfill de
// registros antigos, evitando o grupo "Sem ano" quando o ano está no título,
// número ou nas datas.

const ANO_MIN = 2000;

function anoValido(n) {
  const atual = new Date().getFullYear();
  return Number.isInteger(n) && n >= ANO_MIN && n <= atual + 1;
}

function anoDeData(iso) {
  const m = String(iso || '').match(/^(\d{4})-\d{2}-\d{2}/);
  return m ? Number(m[1]) : null;
}

/**
 * Deriva o ano (ou null) na ordem de confiança:
 *   1. data_publicacao / data_abertura (ISO) → ano da data.
 *   2. ano de 4 dígitos (19xx/20xx) em numero/titulo → o maior plausível
 *      (o ano do próprio documento costuma ser o mais recente citado).
 *   3. padrão "NNNN/AA" (Processo 0064/24) → 20AA.
 */
function extrairAno({ dataPublicacao = null, dataAbertura = null, numero = null, titulo = null } = {}) {
  for (const data of [dataPublicacao, dataAbertura]) {
    const ano = anoDeData(data);
    if (anoValido(ano)) {
      return ano;
    }
  }

  const texto = `${numero || ''} ${titulo || ''}`;

  const anos4 = (texto.match(/\b(?:19|20)\d{2}\b/g) || []).map(Number).filter(anoValido);
  if (anos4.length) {
    return Math.max(...anos4);
  }

  const m2 = texto.match(/\b\d{1,4}\/(\d{2})\b/);
  if (m2) {
    const ano = 2000 + Number(m2[1]);
    if (anoValido(ano)) {
      return ano;
    }
  }

  return null;
}

module.exports = { extrairAno, anoValido, anoDeData };
