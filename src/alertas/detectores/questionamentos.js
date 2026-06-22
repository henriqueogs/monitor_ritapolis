'use strict';

// Extrai questionamentos/lacunas já estruturados nos resumos IA (campos `lacunas`
// e `consistencia` com status incompleto/divergente). Heurístico e ancorado na
// fonte — a elaboração em linguagem natural fica na narrativa IA (fase 3).
function detectarQuestionamentos(docs, { maxPorDoc = 5 } = {}) {
  const sinais = [];
  for (const doc of docs) {
    const questionamentos = [];
    for (const lacuna of doc.resumo?.lacunas || []) {
      if (lacuna?.descricao) {
        questionamentos.push(lacuna.descricao);
      }
    }
    for (const item of doc.resumo?.consistencia || []) {
      if (item && /incompleto|divergen/i.test(item.status || '') && item.descricao) {
        questionamentos.push(item.descricao);
      }
    }
    if (!questionamentos.length) {
      continue;
    }
    sinais.push({
      tipo: 'questionamento',
      categoria: doc.categoria || null,
      ano: doc.ano ?? null,
      severidade: 'info',
      documentos: [doc.id],
      questionamentos: [...new Set(questionamentos)].slice(0, maxPorDoc),
    });
  }
  return sinais;
}

module.exports = { detectarQuestionamentos };
