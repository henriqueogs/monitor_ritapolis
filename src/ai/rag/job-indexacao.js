'use strict';

/**
 * Job que popula o índice vetorial a partir dos documentos e anexos reais.
 * Lê em páginas (cursor), mapeia para itens indexáveis (origem rastreável, CPF mascarado) e
 * delega ao indexador incremental. Orçamento por execução: documentos, tokens estimados e tempo,
 * checados ANTES de cada página (estouro máximo = uma página). Retomável pelo estado de indexação.
 * `removerAusentes` só age numa passada completa; `simular` só conta (dry-run, sem embedar/gravar).
 */

const { indexarIncremental, removerAusentes: removerAusentesDoIndice } = require('./indexador');
const { mapearDocumento, mapearAnexo } = require('./fontes-indexacao');

const PAGINA_PADRAO = 10;
const FONTES = [
  { nome: 'documentos', listar: 'listarDocumentosParaIndexar', mapear: mapearDocumento },
  { nome: 'anexos', listar: 'listarAnexosParaIndexar', mapear: mapearAnexo },
];

const dormirPadrao = ms => new Promise(resolve => setTimeout(resolve, ms));
const zerado = () => ({ indexados: 0, ignorados: 0, descartados: 0 });

function orcamentoEsgotado({ orcamento, resumo, inicio, agora }) {
  const { maxDocumentos = Infinity, maxTokens = Infinity, maxMs = Infinity } = orcamento;
  return (
    resumo.indexados >= maxDocumentos ||
    resumo.tokens_estimados >= maxTokens ||
    agora() - inicio >= maxMs
  );
}

async function processarPagina({ itens, estadoJob, args }) {
  const { orcamento = {}, ...indexacao } = args;
  const restante = (orcamento.maxDocumentos ?? Infinity) - estadoJob.resumo.indexados;
  const r = await indexarIncremental({ ...indexacao, documentos: itens, limite: restante });
  const { resumo, porFonte } = estadoJob;
  resumo.indexados += r.indexados;
  resumo.ignorados += r.ignorados;
  resumo.pendentes += r.pendentes;
  resumo.chunks += r.chunks;
  resumo.tokens_estimados += r.tokens_estimados;
  porFonte.indexados += r.indexados;
  porFonte.ignorados += r.ignorados;
  return r;
}

async function percorrerFonte({ fonte, estadoJob, vistos, args }) {
  const { leitor, tamanhoPagina, logger, pausaEntreLotesMs, dormir, agora, inicio } = args;
  let cursor = 0;
  for (;;) {
    const linhas = leitor[fonte.listar]({ afterId: cursor, limite: tamanhoPagina });
    if (!linhas.length) {
      return true;
    }
    cursor = linhas[linhas.length - 1].id;
    const itens = linhas.map(fonte.mapear).filter(Boolean);
    estadoJob.resumo.descartados += linhas.length - itens.length;
    estadoJob.porFonte.descartados += linhas.length - itens.length;
    itens.forEach(i => vistos.push({ docId: i.docId }));

    if (
      orcamentoEsgotado({
        orcamento: args.orcamento ?? {},
        resumo: estadoJob.resumo,
        inicio,
        agora,
      })
    ) {
      estadoJob.resumo.pendentes += itens.length;
      return false;
    }
    const r = await processarPagina({ itens, estadoJob, args });
    logger.info('ia.indexar: página', { fonte: fonte.nome, cursor, indexados: r.indexados });
    if (r.pendentes > 0) {
      return false;
    }
    if (pausaEntreLotesMs > 0 && r.indexados > 0) {
      await dormir(pausaEntreLotesMs);
    }
  }
}

async function rodarJobIndexacao({
  leitor,
  provider,
  store,
  estado,
  logger,
  orcamento = {},
  tamanhoPagina = PAGINA_PADRAO,
  pausaEntreLotesMs = 0,
  dormir = dormirPadrao,
  agora = Date.now,
  simular = false,
  removerAusentes = false,
  chunker,
  versaoChunker,
}) {
  const resumo = {
    ...zerado(),
    pendentes: 0,
    chunks: 0,
    tokens_estimados: 0,
    removidos: 0,
    completo: true,
    simulado: simular,
    por_fonte: {},
  };
  const vistos = [];
  const args = {
    leitor,
    provider,
    store,
    estado,
    logger,
    orcamento,
    tamanhoPagina,
    pausaEntreLotesMs,
    dormir,
    agora,
    simular,
    chunker,
    versaoChunker,
    inicio: agora(),
  };

  for (const fonte of FONTES) {
    const porFonte = zerado();
    resumo.por_fonte[fonte.nome] = porFonte;
    const terminou = await percorrerFonte({ fonte, estadoJob: { resumo, porFonte }, vistos, args });
    if (!terminou) {
      resumo.completo = false;
      break;
    }
  }

  if (removerAusentes && resumo.completo && !simular) {
    resumo.removidos = await removerAusentesDoIndice({ documentos: vistos, store, estado });
  }
  logger.info('ia.indexar: fim', { ...resumo, por_fonte: undefined });
  return resumo;
}

module.exports = { rodarJobIndexacao };
