'use strict';

// Emite um sinal de processo para cada documento cujo resumo IA traz alerta de
// nível 'alto'. Severidade crítica — vira alerta por processo.
function detectarRiscoAlto(docs) {
  const sinais = [];
  for (const doc of docs) {
    const altos = (doc.resumo?.alertas || []).filter(
      (a) => a && String(a.nivel).toLowerCase() === 'alto' && a.descricao
    );
    if (!altos.length) {
      continue;
    }
    sinais.push({
      tipo: 'risco_alto',
      categoria: doc.categoria || null,
      ano: doc.ano ?? null,
      severidade: 'critico',
      documentos: [doc.id],
      motivo: altos[0].descricao,
      trechos: altos.map((a) => a.descricao),
    });
  }
  return sinais;
}

module.exports = { detectarRiscoAlto };
