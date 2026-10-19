'use strict';

/**
 * Job que popula o índice vetorial a partir dos documentos e anexos reais.
 * Lê em páginas (cursor), mapeia para itens indexáveis (origem rastreável, CPF mascarado) e
 * delega ao indexador incremental. O orçamento (documentos, tokens estimados, tempo) vira o
 * `limite`/`limiteTokens` do indexador: com o orçamento esgotado o indexador só classifica o que
 * é ignorado (hash igual) e o que fica pendente (mudou), sem embedar. Assim `pendentes` conta só
 * trabalho real e `completo` só é falso quando ainda há o que indexar.
 * O tempo conta a partir da primeira página que de fato indexou: varrer páginas já indexadas
 * (leitura + hash, sem rede) não consome o orçamento — senão a varredura inicial impediria o
 * progresso das execuções seguintes. O cursor não é persistido: cada execução relê desde o início.
 * `removerAusentes` só age numa passada completa e nunca com leitura vazia; `simular` só conta.
 */

const { indexarIncremental, removerAusentes: removerAusentesDoIndice } = require('./indexador');
const { mapearDocumento, mapearAnexo } = require('./fontes-indexacao');

const PAGINA_PADRAO = 10;
const PAGINA_MAXIMA = 100; // texto_completo de cada linha vai para a RAM (VM de 954 MB)
const FONTES = [
  { nome: 'documentos', listar: 'listarDocumentosParaIndexar', mapear: mapearDocumento },
  { nome: 'anexos', listar: 'listarAnexosParaIndexar', mapear: mapearAnexo },
];

const dormirPadrao = ms => new Promise(resolve => setTimeout(resolve, ms));
const zerado = () => ({ indexados: 0, ignorados: 0, descartados: 0 });

function validarPagina(tamanhoPagina) {
  if (!Number.isInteger(tamanhoPagina) || tamanhoPagina < 1 || tamanhoPagina > PAGINA_MAXIMA) {
    throw new RangeError(
      `tamanhoPagina inválido: ${tamanhoPagina} (inteiro de 1 a ${PAGINA_MAXIMA})`
    );
  }
}

/** Quanto ainda cabe no orçamento agora; 0 significa "só classificar, não embedar". */
function calcularRestante({ orcamento, resumo, trabalho, agora }) {
  const { maxDocumentos = Infinity, maxTokens = Infinity, maxMs = Infinity } = orcamento;
  const esgotadoPorTempo = trabalho.inicio !== null && agora() - trabalho.inicio >= maxMs;
  const documentos = esgotadoPorTempo ? 0 : Math.max(0, maxDocumentos - resumo.indexados);
  const tokens = Math.max(0, maxTokens - resumo.tokens_estimados);
  return { documentos, tokens };
}

async function processarPagina({ itens, ctx, resumo, porFonte, trabalho }) {
  const { orcamento, agora, ...indexacao } = ctx;
  const antes = agora();
  const restante = calcularRestante({ orcamento, resumo, trabalho, agora: () => antes });
  const r = await indexarIncremental({
    ...indexacao,
    documentos: itens,
    limite: restante.documentos,
    limiteTokens: restante.tokens,
  });
  if (r.indexados > 0 && trabalho.inicio === null) {
    trabalho.inicio = antes;
  }
  resumo.indexados += r.indexados;
  resumo.ignorados += r.ignorados;
  resumo.pendentes += r.pendentes;
  resumo.chunks += r.chunks;
  resumo.tokens_estimados += r.tokens_estimados;
  porFonte.indexados += r.indexados;
  porFonte.ignorados += r.ignorados;
  return r;
}

async function percorrerFonte({ fonte, ctx, resumo, porFonte, trabalho, vistos }) {
  const { leitor, tamanhoPagina, logger, pausaEntreLotesMs, dormir } = ctx;
  let cursor = 0;
  for (;;) {
    const linhas = leitor[fonte.listar]({ afterId: cursor, limite: tamanhoPagina });
    if (!linhas.length) {
      return true;
    }
    cursor = linhas[linhas.length - 1].id;
    const itens = linhas.map(fonte.mapear).filter(Boolean);
    resumo.descartados += linhas.length - itens.length;
    porFonte.descartados += linhas.length - itens.length;
    itens.forEach(i => vistos.push({ docId: i.docId }));

    const r = await processarPagina({ itens, ctx, resumo, porFonte, trabalho });
    logger.info('ia.indexar: página', { fonte: fonte.nome, cursor, indexados: r.indexados });
    if (r.pendentes > 0) {
      return false;
    }
    if (pausaEntreLotesMs > 0 && r.indexados > 0) {
      await dormir(pausaEntreLotesMs);
    }
  }
}

async function removerSeCompleto({ vistos, store, estado, logger }) {
  if (!vistos.length) {
    logger.warn('ia.indexar: leitura vazia; remoção de ausentes ignorada por segurança');
    return 0;
  }
  return removerAusentesDoIndice({ documentos: vistos, store, estado });
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
  validarPagina(tamanhoPagina);
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
  const trabalho = { inicio: null };
  const ctx = {
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
  };

  for (const fonte of FONTES) {
    const porFonte = zerado();
    resumo.por_fonte[fonte.nome] = porFonte;
    const terminou = await percorrerFonte({ fonte, ctx, resumo, porFonte, trabalho, vistos });
    if (!terminou) {
      resumo.completo = false;
      break;
    }
  }

  if (removerAusentes && resumo.completo && !simular) {
    resumo.removidos = await removerSeCompleto({ vistos, store, estado, logger });
  }
  const { por_fonte: porFonteResumo, ...sem } = resumo;
  logger.info('ia.indexar: fim', { ...sem, fontes: Object.keys(porFonteResumo) });
  return resumo;
}

module.exports = { rodarJobIndexacao };
