'use strict';

// Fragmentos SQL dos upserts de licitacoes_detalhes (texto, IA, coleta).
//
// Invariante (fiscal-valores 28/10): origem, origem_detalhe, trecho_fonte e confianca descrevem
// o valor_final gravado. Cada escritor troca a procedência com a MESMA condição com que grava o
// valor; sem valor na linha, a procedência descreve o que houver (vencedor, data).

const LD = 'licitacoes_detalhes';

// Linha de resultado do PNCP (src/db/pncp-resultados-repo.js): nenhum outro escritor mexe nela.
const SEM_RESULTADO_PNCP = `IFNULL(${LD}.origem_detalhe, '') NOT LIKE 'pncp_resultados%'`;

const COLUNAS_PROCEDENCIA = ['origem', 'origem_detalhe', 'trecho_fonte', 'confianca'];

// Rastro de scripts/aplicar-gate-valores.js: sobrevive à troca de procedência do valor.
const MARCA_GATE = 'valor_final_invalidado(';
const RASTRO_GATE = `CASE WHEN INSTR(IFNULL(${LD}.origem_detalhe, ''), '${MARCA_GATE}') > 0
  THEN SUBSTR(${LD}.origem_detalhe, INSTR(${LD}.origem_detalhe, '${MARCA_GATE}')) END`;

function comRastroGate(novoDetalhe) {
  return `NULLIF(TRIM(IFNULL(${novoDetalhe}, '') || IFNULL(' | ' || ${RASTRO_GATE}, ''), ' |'), '')`;
}

/**
 * SET de valor_final e das colunas de procedência.
 * @param {object} opcoes
 * @param {string} opcoes.gravaValor condição SQL em que o escritor grava valor_final
 * @param {string} opcoes.semValor condição SQL (linha sem valor) em que a procedência pode ser completada
 * @param {(coluna: string) => string} opcoes.novo expressão SQL do valor novo de cada coluna
 */
function sqlValorComProcedencia({ gravaValor, semValor, novo }) {
  const valor = `valor_final = CASE WHEN ${gravaValor} THEN ${novo('valor_final')} ELSE ${LD}.valor_final END`;
  const procedencia = COLUNAS_PROCEDENCIA.map(
    (coluna) =>
      `${coluna} = CASE WHEN ${gravaValor}
          THEN ${coluna === 'origem_detalhe' ? comRastroGate(novo(coluna)) : novo(coluna)}
        WHEN ${semValor} THEN COALESCE(${novo(coluna)}, ${LD}.${coluna})
        ELSE ${LD}.${coluna} END`
  );
  return [valor, ...procedencia].join(',\n');
}

module.exports = {
  SEM_RESULTADO_PNCP,
  sqlValorComProcedencia,
};
