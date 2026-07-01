'use strict';

const { slug } = require('../tipos');

const JANELAS_MESES = [3, 6, 12];

function dataBaseFato(fato) {
  return fato.periodo_inicio || fato.data_evento || fato.documento_data_publicacao || fato.data_publicacao || null;
}

function anoFato(fato) {
  const anoDoc = Number(fato.ano);
  if (Number.isInteger(anoDoc) && anoDoc > 1900) {
    return anoDoc;
  }
  const data = dataBaseFato(fato);
  const m = String(data || '').match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
}

function addMeses(data, meses) {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d.toISOString().slice(0, 10);
}

function ordenarPorData(fatos) {
  return [...fatos].sort((a, b) => String(dataBaseFato(a) || '').localeCompare(String(dataBaseFato(b) || '')));
}

function somaQuantidade(fatos) {
  return fatos.reduce((sum, fato) => sum + (Number(fato.quantidade) || 0), 0);
}

function dedupeQuantidadePorDocumento(fatos) {
  const porDoc = new Map();
  for (const fato of fatos) {
    const atual = porDoc.get(fato.documento_id);
    const quantidade = Number(fato.quantidade) || 0;
    const atualQuantidade = Number(atual?.quantidade) || 0;
    const melhor =
      !atual ||
      quantidade > atualQuantidade ||
      (quantidade === atualQuantidade && fato.anexo_id && !atual.anexo_id);
    if (melhor) {
      porDoc.set(fato.documento_id, fato);
    }
  }
  return [...porDoc.values()];
}

function documentos(fatos) {
  const porDoc = new Map();
  for (const fato of fatos) {
    if (!porDoc.has(fato.documento_id)) {
      porDoc.set(fato.documento_id, {
        documento_id: fato.documento_id,
        papel: 'evidencia',
        trecho_fonte: fato.trecho_fonte || fato.descricao,
      });
    }
  }
  return [...porDoc.values()];
}

function evidencias(fatos) {
  return fatos.map((fato) => ({
    documento_id: fato.documento_id,
    anexo_id: fato.anexo_id || null,
    fato_id: fato.id,
    papel: 'fato',
    trecho_fonte: fato.trecho_fonte || fato.descricao,
    metadados: {
      tipo: fato.tipo,
      subtipo: fato.subtipo,
      quantidade: fato.quantidade ?? null,
      unidade: fato.unidade || null,
      valor: fato.valor ?? null,
    },
  }));
}

function periodo(fatos) {
  const datas = fatos.map(dataBaseFato).filter(Boolean).sort();
  return {
    inicio: datas[0] || null,
    fim: datas[datas.length - 1] || null,
    ultima: datas[datas.length - 1] || null,
  };
}

function melhorJanelaArvores(fatos, meses, threshold) {
  const ordenados = ordenarPorData(fatos).filter((fato) => dataBaseFato(fato));
  let melhor = null;

  for (let i = 0; i < ordenados.length; i += 1) {
    const inicio = dataBaseFato(ordenados[i]);
    const fim = addMeses(inicio, meses);
    const janelaBruta = ordenados.filter((fato) => {
      const data = dataBaseFato(fato);
      return data >= inicio && data <= fim;
    });
    const janela = dedupeQuantidadePorDocumento(janelaBruta);
    const total = somaQuantidade(janela);
    if (total >= threshold && (!melhor || total > melhor.total)) {
      melhor = { meses, inicio, fim, fatos: janela, total };
    }
  }

  return melhor;
}

function alertaArvoresAno(fatos, ano, threshold) {
  const fatosUnicos = dedupeQuantidadePorDocumento(fatos);
  const total = somaQuantidade(fatosUnicos);
  if (total < threshold) {
    return null;
  }

  const p = periodo(fatosUnicos);
  const docs = documentos(fatosUnicos);
  const janelas = JANELAS_MESES
    .map((meses) => melhorJanelaArvores(fatosUnicos, meses, threshold))
    .filter(Boolean)
    .map((janela) => ({
      meses: janela.meses,
      inicio: janela.inicio,
      fim: janela.fim,
      total_quantidade: janela.total,
      documentos_ids: documentos(janela.fatos).map((d) => d.documento_id),
    }));

  return {
    tipo: 'tematico',
    categoria: 'Meio ambiente',
    subcategoria: 'Supressao de arvores',
    severidade: total >= threshold * 1.5 ? 'critico' : 'atencao',
    titulo: `Supressao de arvores em ${ano}`,
    narrativa:
      `Os documentos analisados indicam ${total} arvores em fatos de supressao/corte no ano de ${ano}. ` +
      'A contagem vem dos trechos extraidos de documentos e anexos oficiais vinculados abaixo.',
    chave_unica: `fato|meio-ambiente|supressao-arvores|ano|${ano}`,
    documentos_ids: docs.map((d) => d.documento_id),
    periodo_inicio: p.inicio,
    periodo_fim: p.fim,
    ultima_publicacao_documento: p.ultima,
    valor_periodo_label: `Total factual em ${ano}`,
    valor_total: total,
    questionamentos: [
      'Ha laudo tecnico, autorizacao ambiental ou compensacao vinculada aos processos?',
      'Os documentos expõem localizacao, especies, porte das arvores e criterio de selecao?',
    ],
    confianca: mediaConfianca(fatosUnicos),
    metadados: {
      tipo_fato: 'meio_ambiente.supressao_arvores',
      unidade: 'arvores',
      total_quantidade: total,
      janela: 'ano',
      count: docs.length,
      discovery_kind: 'investigacao_factual',
      investigacao_tipo: 'supressao_arvores',
      janelas,
    },
    documentos: docs,
    evidencias: evidencias(fatosUnicos),
  };
}

function alertaRecorrencia(chave, fatos, minDocs) {
  const docs = documentos(fatos);
  if (docs.length < minDocs) {
    return null;
  }
  const [tipo, subtipo, ano] = chave.split('|');
  const p = periodo(fatos);
  const label = `${tipo}.${subtipo}`;
  return {
    tipo: 'tematico',
    categoria: label,
    subcategoria: subtipo,
    severidade: docs.length >= minDocs * 2 ? 'atencao' : 'info',
    titulo: `${label}: ${docs.length} documentos em ${ano}`,
    narrativa:
      `A camada factual encontrou ${docs.length} documentos com fatos do tipo ${label} em ${ano}. ` +
      'Use os vinculos abaixo para revisar os processos e anexos de origem.',
    chave_unica: `fato|${slug(tipo)}|${slug(subtipo)}|recorrencia|${ano}`,
    documentos_ids: docs.map((d) => d.documento_id),
    periodo_inicio: p.inicio,
    periodo_fim: p.fim,
    ultima_publicacao_documento: p.ultima,
    questionamentos: [],
    confianca: mediaConfianca(fatos),
    metadados: { tipo_fato: label, janela: 'ano', count: docs.length },
    documentos: docs,
    evidencias: evidencias(fatos),
  };
}

function mediaConfianca(fatos) {
  const vals = fatos.map((f) => f.confianca).filter((v) => typeof v === 'number');
  if (!vals.length) {
    return null;
  }
  return Number((vals.reduce((sum, v) => sum + v, 0) / vals.length).toFixed(2));
}

function detectarFatosAgregados(fatos, {
  thresholdArvores = 60,
  minDocsRecorrencia = 3,
} = {}) {
  const alertas = [];
  const arvores = fatos.filter((f) => f.tipo === 'meio_ambiente' && f.subtipo === 'supressao_arvores');
  const arvoresPorAno = new Map();
  for (const fato of arvores) {
    const ano = anoFato(fato);
    if (!ano) {
      continue;
    }
    const lista = arvoresPorAno.get(ano) || [];
    lista.push(fato);
    arvoresPorAno.set(ano, lista);
  }
  for (const [ano, lista] of arvoresPorAno.entries()) {
    const alerta = alertaArvoresAno(lista, ano, thresholdArvores);
    if (alerta) {
      alertas.push(alerta);
    }
  }

  const recorrencias = new Map();
  for (const fato of fatos) {
    const ano = anoFato(fato);
    if (!ano || (fato.tipo === 'meio_ambiente' && fato.subtipo === 'supressao_arvores')) {
      continue;
    }
    const chave = `${fato.tipo}|${fato.subtipo || 'geral'}|${ano}`;
    const lista = recorrencias.get(chave) || [];
    lista.push(fato);
    recorrencias.set(chave, lista);
  }
  for (const [chave, lista] of recorrencias.entries()) {
    const alerta = alertaRecorrencia(chave, lista, minDocsRecorrencia);
    if (alerta) {
      alertas.push(alerta);
    }
  }

  return alertas;
}

module.exports = {
  detectarFatosAgregados,
  dataBaseFato,
  anoFato,
  dedupeQuantidadePorDocumento,
  melhorJanelaArvores,
};
