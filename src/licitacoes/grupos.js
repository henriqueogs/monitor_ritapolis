const { normalizeProcessoChave } = require('./processo');

const PAPEL_LABELS = {
  edital: 'Edital',
  republicacao: 'Republicacao',
  ata: 'Ata',
  contrato: 'Contrato',
  homologacao: 'Homologacao',
  publicacao: 'Publicacao'
};

function inferPapel(documento, modelo = {}) {
  const titulo = String(documento?.titulo || '').toLowerCase();
  const resumo = String(documento?.resumo || '').toLowerCase();
  const texto = `${titulo} ${resumo}`;

  if (/(republic|retific|republica)/i.test(texto)) {return 'republicacao';}
  if (/(homolog)/i.test(texto)) {return 'homologacao';}
  if (modelo.tem_contrato || /contrato/i.test(texto)) {return 'contrato';}
  if (/\bata\b|resultado|classifica/i.test(texto)) {return 'ata';}
  if (
    modelo.tem_edital ||
    /edital|preg[aã]o|dispensa|concorr[eê]ncia|chamamento|credenciamento|ades[aã]o/i.test(texto)
  ) {
    return 'edital';
  }
  if (modelo.tem_ata) {return 'ata';}

  return 'publicacao';
}

function papelLabel(papel) {
  return PAPEL_LABELS[papel] || PAPEL_LABELS.publicacao;
}

function pickDocumentoCanonico(itens) {
  const ordenados = [...itens].sort((a, b) => {
    const peso = (item) => {
      if (item.papel === 'edital') {return 0;}
      if (item.papel === 'publicacao') {return 1;}
      if (item.papel === 'republicacao') {return 3;}
      return 2;
    };

    const diff = peso(a) - peso(b);
    if (diff !== 0) {return diff;}

    const dataA = a.data_publicacao || a.data_abertura || '';
    const dataB = b.data_publicacao || b.data_abertura || '';
    return String(dataA).localeCompare(String(dataB));
  });

  return ordenados[0]?.documento_id || itens[0]?.documento_id || null;
}

function buildGrupoKey(documento, modelo = {}) {
  const processo = modelo.processo || documento?.numero;
  const ano = Number(documento?.ano);
  const chave = normalizeProcessoChave(processo);

  if (!chave || !Number.isFinite(ano)) {return null;}

  return {
    processo_chave: chave,
    ano,
    processo_exibicao: processo || null
  };
}

function agruparDocumentosLicitacao(documentos) {
  const mapa = new Map();

  documentos.forEach((item) => {
    const key = buildGrupoKey(item.documento, item.modelo);
    if (!key) {return;}

    const id = `${key.processo_chave}|${key.ano}`;
    const atual = mapa.get(id) || {
      ...key,
      documentos: []
    };

    const papel = inferPapel(item.documento, item.modelo);
    atual.documentos.push({
      documento_id: item.documento.id,
      papel,
      papel_nome: papelLabel(papel),
      titulo: item.documento.titulo,
      data_publicacao: item.documento.data_publicacao,
      data_abertura: item.documento.data_abertura,
      fonte: item.documento.fonte,
      modelo: item.modelo
    });

    mapa.set(id, atual);
  });

  return Array.from(mapa.values()).map((grupo) => {
    const documentoCanonicoId = pickDocumentoCanonico(grupo.documentos);
    const canonico =
      grupo.documentos.find((item) => item.documento_id === documentoCanonicoId) ||
      grupo.documentos[0];

    return {
      ...grupo,
      titulo_resumo: canonico?.titulo || grupo.processo_exibicao,
      documento_canonico_id: documentoCanonicoId,
      total_documentos: grupo.documentos.length
    };
  });
}

module.exports = {
  PAPEL_LABELS,
  agruparDocumentosLicitacao,
  buildGrupoKey,
  inferPapel,
  papelLabel,
  pickDocumentoCanonico
};
