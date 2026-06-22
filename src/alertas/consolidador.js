'use strict';

const { maiorSeveridade, slug } = require('./tipos');

const TIPOS_TEMATICOS = new Set(['repeticao_tematica', 'valor_relevante', 'anomalia_temporal']);

function mediaConfianca(docs) {
  const vals = docs.map((d) => d.resumo?.confianca).filter((v) => typeof v === 'number');
  if (!vals.length) {
    return null;
  }
  return Number((vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2));
}

function ultimaPublicacao(docs) {
  return docs.map((d) => d.data_publicacao).filter(Boolean).sort().slice(-1)[0] || null;
}

// Consolida sinais em alertas candidatos:
//  - temáticos: 1 por (categoria, ano), combinando repetição/valor/anomalia;
//  - processo: 1 por documento com risco alto.
// Anexa questionamentos (de sinais 'questionamento') aos documentos envolvidos.
function consolidarSinais(sinais, docsById) {
  const alertas = [];

  const questPorDoc = new Map();
  for (const s of sinais) {
    if (s.tipo === 'questionamento') {
      questPorDoc.set(s.documentos[0], s.questionamentos || []);
    }
  }

  // ── Temáticos ──
  const porChave = new Map();
  for (const s of sinais) {
    if (!TIPOS_TEMATICOS.has(s.tipo)) {
      continue;
    }
    const chave = `${s.categoria}|${s.ano ?? 'sem-ano'}`;
    if (!porChave.has(chave)) {
      porChave.set(chave, []);
    }
    porChave.get(chave).push(s);
  }

  for (const [, grupoSinais] of porChave) {
    const categoria = grupoSinais[0].categoria;
    const ano = grupoSinais[0].ano ?? null;
    const docIds = [...new Set(grupoSinais.flatMap((s) => s.documentos))];
    const docs = docIds.map((id) => docsById.get(id)).filter(Boolean);
    if (!docs.length) {
      continue;
    }
    const severidade = grupoSinais.reduce((m, s) => maiorSeveridade(m, s.severidade), 'info');
    const sinalValor = grupoSinais.find((s) => s.tipo === 'valor_relevante');
    const datas = docs.map((d) => d.data_publicacao).filter(Boolean).sort();
    const questionamentos = [...new Set(docs.flatMap((d) => questPorDoc.get(d.id) || []))].slice(0, 8);

    alertas.push({
      tipo: 'tematico',
      categoria,
      severidade,
      titulo: `${categoria} — ${docs.length} ${docs.length === 1 ? 'processo' : 'processos'} em ${ano ?? 's/ ano'}`,
      chave_unica: `tematico|${slug(categoria)}|${ano ?? 'sem-ano'}`,
      documentos_ids: docIds,
      valor_total: sinalValor ? sinalValor.valor : null,
      valor_periodo_label: sinalValor ? `Estimado em ${ano ?? 's/ ano'}` : null,
      periodo_inicio: datas[0] || null,
      periodo_fim: datas[datas.length - 1] || null,
      ultima_publicacao_documento: ultimaPublicacao(docs),
      questionamentos,
      confianca: mediaConfianca(docs),
      metadados: {
        sinais: grupoSinais.map((s) => s.tipo),
        motivos: grupoSinais.map((s) => s.motivo).filter(Boolean),
        count: docs.length,
      },
      documentos: docs.map((d) => ({ documento_id: d.id, papel: 'relacionado' })),
    });
  }

  // ── Processos (risco alto) ──
  for (const s of sinais) {
    if (s.tipo !== 'risco_alto') {
      continue;
    }
    const id = s.documentos[0];
    const doc = docsById.get(id);
    if (!doc) {
      continue;
    }
    alertas.push({
      tipo: 'processo',
      categoria: doc.categoria || null,
      severidade: 'critico',
      titulo: `Risco alto: ${(doc.titulo || `documento ${id}`).slice(0, 90)}`,
      chave_unica: `processo|risco|${id}`,
      documentos_ids: [id],
      valor_total: Number(doc.valor) > 0 ? Number(doc.valor) : null,
      valor_periodo_label: Number(doc.valor) > 0 ? `Estimado em ${doc.ano ?? 's/ ano'}` : null,
      periodo_inicio: doc.data_publicacao || null,
      periodo_fim: doc.data_publicacao || null,
      ultima_publicacao_documento: doc.data_publicacao || null,
      questionamentos: questPorDoc.get(id) || [],
      confianca: doc.resumo?.confianca ?? null,
      metadados: { motivo: s.motivo, trechos: s.trechos || [] },
      documentos: [{ documento_id: id, papel: 'origem', trecho_fonte: s.motivo }],
    });
  }

  return alertas;
}

module.exports = { consolidarSinais };
