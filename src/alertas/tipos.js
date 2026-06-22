'use strict';

// Tipos e helpers compartilhados do domínio de alertas. Sem efeitos colaterais.
//
// "Documento enriquecido" (entrada dos detectores) — montado pelo orquestrador:
//   { id, titulo, categoria, ano, data_publicacao, valor, grupo_id, url_origem,
//     resumo: { alertas:[{nivel,descricao,fonte}], lacunas:[{campo,descricao}],
//               consistencia:[{status,campo,descricao}], confianca } | null }
//
// "Sinal" (saída dos detectores):
//   { tipo, categoria, ano, severidade, documentos:[id], motivo?, valor?,
//     questionamentos?, trechos? }

const SEVERIDADE = { INFO: 'info', ATENCAO: 'atencao', CRITICO: 'critico' };
const ORDEM_SEVERIDADE = { info: 0, atencao: 1, critico: 2 };

function maiorSeveridade(a, b) {
  return (ORDEM_SEVERIDADE[b] ?? 0) > (ORDEM_SEVERIDADE[a] ?? 0) ? b : a;
}

function slug(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function formatBRL(valor) {
  const n = Number(valor) || 0;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
}

module.exports = { SEVERIDADE, ORDEM_SEVERIDADE, maiorSeveridade, slug, formatBRL };
