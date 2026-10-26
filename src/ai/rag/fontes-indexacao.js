'use strict';

/**
 * Domínio: transforma linhas do banco (documentos e anexos) em documentos indexáveis para o RAG.
 * Puro, sem banco. Cada item carrega a origem rastreável (§11.3): arquivo próprio quando existe;
 * senão a listagem oficial, marcada como `origemGenerica` para a UI rotular com honestidade.
 * Texto sem conteúdo útil ou sem nenhuma URL de origem não é indexado (devolve null).
 */

const { mascararCpf } = require('./privacidade');

const TEXTO_MINIMO = 80;
// O indexador aceita até 200 chunks por documento (passo de ~1050 caracteres): acima disso o
// chunker lançaria. Textos maiores são truncados (o início identifica o objeto do documento).
const TEXTO_MAXIMO = 200000;
const PREFIXO = Object.freeze({ DOCUMENTO: 'documento', ANEXO: 'anexo' });

const urlHttp = valor => {
  const url = String(valor ?? '').trim();
  return /^https?:\/\//i.test(url) ? url : null;
};

const temTextoUtil = texto => String(texto ?? '').trim().length >= TEXTO_MINIMO;

function montarTexto(cabecalho, corpo) {
  const juntos = [...cabecalho.filter(Boolean), String(corpo).trim()].join('\n');
  return mascararCpf(juntos).slice(0, TEXTO_MAXIMO);
}

function semVazios(metadados) {
  return Object.fromEntries(
    Object.entries(metadados).filter(([, v]) => v !== null && v !== undefined && v !== '')
  );
}

function mapearDocumento(linha) {
  if (!temTextoUtil(linha.texto_completo)) {
    return null;
  }
  const arquivo = urlHttp(linha.url_pdf);
  const origem = arquivo ?? urlHttp(linha.url_origem);
  if (!origem) {
    return null;
  }
  return {
    docId: `${PREFIXO.DOCUMENTO}:${linha.id}`,
    texto: montarTexto([linha.titulo, linha.numero], linha.texto_completo),
    url_origem: origem,
    origemGenerica: !arquivo,
    metadados: semVazios({
      ano: linha.ano,
      tipo: linha.tipo,
      fonte: linha.fonte,
      documento_id: linha.id,
    }),
  };
}

function mapearAnexo(linha) {
  const origem = urlHttp(linha.url);
  if (!origem || !temTextoUtil(linha.texto_completo)) {
    return null;
  }
  return {
    docId: `${PREFIXO.ANEXO}:${linha.id}`,
    texto: montarTexto([linha.nome, linha.doc_titulo], linha.texto_completo),
    url_origem: origem,
    origemGenerica: false,
    metadados: semVazios({
      ano: linha.doc_ano,
      tipo: linha.doc_tipo,
      fonte: linha.doc_fonte,
      documento_id: linha.documento_id,
      anexo_id: linha.id,
    }),
  };
}

module.exports = { mapearDocumento, mapearAnexo, TEXTO_MINIMO, TEXTO_MAXIMO, PREFIXO };
