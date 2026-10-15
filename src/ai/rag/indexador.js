'use strict';

/**
 * Indexador incremental (Fase 1): leva documentos ao índice vetorial reembedando só o que mudou.
 * Hash por documento = modelo + dims + texto + metadados + origem; igual → ignora (zero chamadas).
 * Ordem segura por documento: embeda tudo → troca os chunks → grava o hash. Falha antes da troca
 * deixa o índice anterior intacto; falha depois dela só repete o documento na próxima execução.
 * `limite` dá orçamento por execução (retomável pelo estado); `removerAusentes` espelha a fonte.
 */

const { createHash } = require('node:crypto');
const { TIPOS_EMBEDDING } = require('../ports/embedding-provider');
const { splitTextIntoChunks } = require('../chunk-text');

const CHUNK_PADRAO = Object.freeze({
  chunkSizeChars: 1200,
  chunkOverlapChars: 150,
  maxChunksPerDocument: 200,
});
const TAMANHO_LOTE = 64;

const chunkerPadrao = texto => splitTextIntoChunks(texto, CHUNK_PADRAO);

function hashDocumento(doc, provider) {
  const base = JSON.stringify([
    provider.model,
    provider.dims,
    doc.texto,
    doc.metadados ?? {},
    doc.url_origem,
    Boolean(doc.origemGenerica),
  ]);
  return createHash('sha256').update(base).digest('hex');
}

function validarDocumento(doc) {
  if (typeof doc.url_origem !== 'string' || !doc.url_origem.trim()) {
    throw new TypeError(`url_origem é obrigatória (§11.3) no documento ${doc.docId}`);
  }
}

async function embedarEmLotes(provider, textos) {
  const vetores = [];
  for (let i = 0; i < textos.length; i += TAMANHO_LOTE) {
    const lote = textos.slice(i, i + TAMANHO_LOTE);
    vetores.push(...(await provider.embed(lote, { tipo: TIPOS_EMBEDDING.PASSAGE })));
  }
  return vetores;
}

async function reindexarDocumento({ doc, hash, provider, store, estado, chunker }) {
  const textos = chunker(doc.texto);
  const vetores = textos.length ? await embedarEmLotes(provider, textos) : [];
  await store.deleteByDoc(doc.docId);
  await store.upsert(
    textos.map((texto, ordem) => ({
      id: `${doc.docId}#${ordem}`,
      docId: doc.docId,
      texto,
      metadados: doc.metadados ?? {},
      url_origem: doc.url_origem,
      origemGenerica: doc.origemGenerica,
      vetor: vetores[ordem],
    }))
  );
  await estado.gravar(doc.docId, hash);
  return textos.length;
}

async function removerAusentes({ documentos, store, estado }) {
  const atuais = new Set(documentos.map(d => d.docId));
  const ausentes = (await estado.listarDocIds()).filter(id => !atuais.has(id));
  for (const docId of ausentes) {
    await store.deleteByDoc(docId);
    await estado.remover(docId);
  }
  return ausentes.length;
}

async function indexarIncremental({
  documentos,
  provider,
  store,
  estado,
  chunker = chunkerPadrao,
  limite = Infinity,
  removerAusentes: espelhar = false,
}) {
  documentos.forEach(validarDocumento);
  const resumo = { indexados: 0, ignorados: 0, removidos: 0, chunks: 0, pendentes: 0 };
  for (const doc of documentos) {
    const hash = hashDocumento(doc, provider);
    if ((await estado.obter(doc.docId)) === hash) {
      resumo.ignorados += 1;
    } else if (resumo.indexados >= limite) {
      resumo.pendentes += 1;
    } else {
      resumo.chunks += await reindexarDocumento({ doc, hash, provider, store, estado, chunker });
      resumo.indexados += 1;
    }
  }
  if (espelhar) {
    resumo.removidos = await removerAusentes({ documentos, store, estado });
  }
  return resumo;
}

module.exports = { indexarIncremental, hashDocumento, CHUNK_PADRAO };
