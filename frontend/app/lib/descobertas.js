// Apresentação das "Descobertas" (antes "Alertas"). Reenquadra a severidade
// técnica do banco (critico/atencao/info) num tom de curiosidade/insight, sem
// sensacionalismo — a maioria dos padrões é normal e válida.

export const NIVEL_LABEL = {
  critico: 'Merece atenção',
  atencao: 'Vale conferir',
  info: 'Curiosidade',
};

// Sem vermelho de "pânico": âmbar para o mais notável, azul/neutro para o resto.
export const NIVEL_CLASSE = {
  critico: 'badge-warning',
  atencao: 'badge-info',
  info: 'badge',
};

export function nivelLabel(severidade) {
  return NIVEL_LABEL[severidade] || 'Curiosidade';
}

export function nivelClasse(severidade) {
  return NIVEL_CLASSE[severidade] || 'badge';
}

// `qualidade_motivos` guarda códigos internos (gate factual/editorial,
// pipeline de IA) direto no banco -- exibir o código cru na tela é "nome de
// variável" pro usuário, não texto de interface. Mapeia pro texto que
// explica o que aconteceu; código sem mapa ainda aparece (melhor que sumir
// silenciosamente), mas isso é sinal de que falta entrada aqui.
export const QUALIDADE_MOTIVO_LABEL = {
  LEGACY_NO_QUALITY_GATE: 'Gerado antes do gate de qualidade atual',
  SUPERSEDED_BY_REBUILD: 'Substituído por reconstrução mais recente',
  NO_FIXED_SUBJECT: 'Não identifica um sujeito fixo (documento/credor/processo)',
  GENERIC_EVIDENCE: 'Evidência genérica demais pra sustentar o achado',
  SOURCE_NOT_TRACEABLE: 'Fonte não rastreável até um documento',
  DOCUMENT_COUNT_MISMATCH: 'Contagem de documentos não bate com a evidência',
  METRIC_NOT_REPRODUCIBLE: 'Métrica citada não é reproduzível a partir dos dados',
  RECURRENCE_NOT_PROVEN: 'Recorrência alegada não está comprovada',
  MIXED_SUBJECTS: 'Mistura mais de um assunto/sujeito no mesmo achado',
  INSUFFICIENT_SAMPLE: 'Amostra pequena demais pra sustentar a comparação',
  COMPARISON_NOT_COMPARABLE: 'Compara itens que não são comparáveis entre si',
  EDITORIAL_GENERIC_TITLE: 'Título genérico demais',
  EDITORIAL_QUESTION_METRIC_MISMATCH: 'Pergunta não corresponde à métrica citada',
  EDITORIAL_NO_DIRECT_ANSWER: 'Sem resposta direta pra pergunta levantada',
  EDITORIAL_NO_REASON: 'Sem justificativa clara do porquê chama atenção',
  EDITORIAL_NARRATIVE_LENGTH: 'Narrativa curta ou longa demais',
  EDITORIAL_UNKNOWN_DOCUMENT: 'Referencia documento que não foi encontrado',
  EDITORIAL_NUMBER_NOT_GROUNDED: 'Número citado sem base nos fatos extraídos',
  EDITORIAL_CONTRADICTS_FACTS: 'Narrativa contradiz os fatos extraídos',
  CONFIDENCE_BELOW_MIN: 'Confiança da IA abaixo do mínimo aceito',
  AUTOMATIC_PUBLICATION_DISABLED: 'Publicação automática desativada (exige revisão manual)',
  AI_SUMMARY_DISABLED: 'Geração de resumo por IA está desativada',
  AI_PROVIDER_ERROR: 'Provedor de IA falhou ao processar (ex: limite de requisições) — tente novamente',
};

export function qualidadeMotivoLabel(codigo) {
  return QUALIDADE_MOTIVO_LABEL[codigo] || codigo;
}
