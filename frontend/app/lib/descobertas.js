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
