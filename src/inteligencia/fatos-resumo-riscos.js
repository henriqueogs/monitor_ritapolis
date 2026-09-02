'use strict';

/**
 * Extrai fatos investigativos a partir dos `riscos_ou_alertas` já presentes
 * nos resumos de IA (documentos_resumos_ai) — não re-analisa o texto bruto,
 * reaproveita a leitura que a IA já fez pra cada documento (custo zero
 * adicional: 1.829 riscos já sentados em 805 documentos, nunca usados).
 *
 * Diferença de traceabilidade em relação ao fatos-extractor.js: um risco não
 * carrega um `trecho_fonte` literal do PDF (o schema de riscos_ou_alertas só
 * tem nivel/descricao/motivo — prosa da IA, não citação). Por isso o `motivo`
 * vira o "trecho" aqui, mas fica marcado em metadados.fonte_dado pra quem for
 * gerar a narrativa/gate saber que é leitura da IA, não citação literal —
 * o documento em si sempre tem url_origem/url_pdf (gate factual já garante
 * isso), então a rastreabilidade fica no nível do documento, não da frase.
 */

const { buildFato, periodoDocumento } = require('./fatos-extractor');

const REGRA = { tipo: 'riscos_resumo', subtipo: 'risco_alto' };

// Só 'alto' por enquanto — 714 ocorrências é volume suficiente pra validar a
// abordagem sem afogar a fila editorial; médio/baixo ficam pra depois se
// isso se provar útil (ver [[project_descobertas_ia_autonoma_visao]]).
const NIVEL_ALVO = 'alto';

function extrairFatosRiscoAlto({ documento, resumo }) {
  const riscos = resumo?.resumo_json?.riscos_ou_alertas;
  if (!Array.isArray(riscos) || !riscos.length) {
    return [];
  }

  const periodo = periodoDocumento(documento);
  const fatos = [];

  riscos.forEach((risco, indice) => {
    if (risco?.nivel !== NIVEL_ALVO || !risco.descricao) {
      return;
    }
    fatos.push(
      buildFato({
        documento,
        regra: REGRA,
        descricao: risco.descricao,
        trecho: risco.motivo || risco.descricao,
        origem: `resumo_ai:v1:${resumo.id}:${indice}`,
        periodo,
        confianca: 0.72,
        metadados: {
          nivel: risco.nivel,
          motivo: risco.motivo || null,
          fonte_dado: 'resumo_ai_riscos',
          resumo_ai_id: resumo.id,
        },
      })
    );
  });

  return fatos;
}

module.exports = { extrairFatosRiscoAlto, REGRA, NIVEL_ALVO };
