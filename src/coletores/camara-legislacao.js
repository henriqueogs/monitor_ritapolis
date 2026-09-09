'use strict';

// Legislação promulgada pela Câmara Municipal (leis, decretos, portarias,
// resoluções, atas...) — módulo SGC próprio (`/ws_consulta/sgc/
// buscarLegislacoes.php`), completamente diferente do fluxo "thread"
// (sessão+token) do Portal da Transparência: aqui é POST direto, sem
// sessão nem cookie. Achado ao vivo: arquivo histórico completo desde 1963.
//
// Reaproveita a tabela `documentos` (fonte='camara') e a mesma taxonomia de
// tipo já usada pela legislação da Prefeitura (legislacao-tipos.js) — não é
// um domínio novo, é a mesma vitrine de "atos oficiais" com uma segunda
// fonte.

const cheerio = require('cheerio');
const ColetorBase = require('./base');
const { getDocumentoByUrlPdfRaw } = require('../db');
const { extractOfficialFileText, inferFileExtension } = require('../parsers/document-file');
const { naoFutura } = require('../utils/datas');
const { normalizarTipo, normalizeSpaces } = require('./legislacao-tipos');

const BASE_URL = 'https://ritapolis.mg.leg.br';
const SEARCH_URL = `${BASE_URL}/ws_consulta/sgc/buscarLegislacoes.php`;

/**
 * A resposta chega como "001 - {JSON com um campo HTML}" quando bem
 * sucedida — mesmo prefixo "NNN - " usado no fluxo thread do Portal da
 * Transparência, mas aqui sem sessão: é só o formato de envelope do
 * framework da fonte (SH3/SGC), não indica um passo de autenticação.
 * @returns {string|null} o HTML de dentro do envelope, ou null se a
 *   resposta não seguir o formato esperado (busca vazia, erro).
 */
function extrairHtmlDaResposta(texto) {
  const bruto = String(texto || '');
  if (!bruto.startsWith('001 - ')) {
    return null;
  }
  try {
    return JSON.parse(bruto.slice(6)).HTML || null;
  } catch {
    return null;
  }
}

// "Lei Ordinária - 1 / 1963" -> { tipoLabel: 'Lei Ordinária', numero: '1', exercicio: 1963 }
function parseTituloItem(texto) {
  const m = normalizeSpaces(texto).match(/^(.+?)\s*-\s*(\S+)\s*\/\s*(\d{4})$/);
  if (!m) {return null;}
  return { tipoLabel: m[1].trim(), numero: m[2], exercicio: Number(m[3]) };
}

function parseDataPublicacao(texto) {
  const m = String(texto || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) {return null;}
  return naoFutura(`${m[3]}-${m[2]}-${m[1]}`);
}

function autorOuNulo(texto) {
  const limpo = normalizeSpaces(texto);
  if (!limpo || /^n[ãa]o informado$/i.test(limpo)) {return null;}
  return limpo;
}

// A fonte gera os links de anexo em http:// mesmo o site inteiro sendo
// https:// -- confirmado ao vivo que o mesmo host responde igual (200,
// cert valido) em https. `assertSafeUrl` (src/http/safe-network.js) exige
// https pra URL externa, sem essa troca o download falha sempre.
function paraHttps(url) {
  return url ? url.replace(/^http:\/\//i, 'https://') : url;
}

/**
 * Parseia o HTML (já extraído do envelope JSON) de uma página de
 * `buscarLegislacoes.php` — uma `<DIV class='item_busca'>` por registro.
 * @returns {Array<{tipoLabel, tipo, numero, exercicio, autor, ementa,
 *   dataPublicacao, anexoUrl, anexoNome}>}
 */
function parseRegistrosLegislacao(html) {
  const $ = cheerio.load(String(html || ''));
  const registros = [];

  $('.item_busca').each((_, el) => {
    const item = $(el);
    const titulo = parseTituloItem(item.find('.titulo_item').first().text());
    if (!titulo) {return;}

    const ementa = normalizeSpaces(item.find('.texto_item_descricao').first().text());
    const autor = autorOuNulo(item.find('.texto_item_autores').first().text());
    const dataPublicacao = parseDataPublicacao(item.find('.publicacao_item_unica').first().text());

    const link = item.find('a.link_arquivo_item').first();
    const href = paraHttps(link.attr('href') || null);
    const anexoNome = link.length ? normalizeSpaces(link.find('.nome_arquivo_item').text()) : null;

    registros.push({
      ...titulo,
      tipo: normalizarTipo(titulo.tipoLabel),
      autor,
      ementa,
      dataPublicacao,
      anexoUrl: href,
      anexoNome,
    });
  });

  return registros;
}

class ColetorCamaraLegislacao extends ColetorBase {
  constructor() {
    super({ fonte: 'camara' });
  }

  async buscarPagina(pagina) {
    const payload = new URLSearchParams({
      INT_PAG: String(pagina),
      INT_TP_LEGS: '', INT_NUM_LEGS: '', INT_EXRC_LEGS: '', D_CAD: '',
      NM_PES: '', DESC_LEGS: '', TXT_LEGS: '', INT_LEGS_NOV: '', INT_LEGS_ORIG: '',
      ORDER_BY: '',
    }).toString();

    const response = await this.postComRetry(`${SEARCH_URL}?DataHora=${Date.now()}`, payload, {
      responseType: 'text',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return extrairHtmlDaResposta(response.data);
  }

  /**
   * A fonte não expõe um total de itens nem um tamanho de página fixo
   * (achado ao vivo: 7 itens/página aqui, bem diferente do 50 usado pela
   * legislação da Prefeitura) — então a única condição de parada confiável
   * é uma página vir vazia, nunca "voltou menos que N".
   */
  async collectRecords({ maxPaginas = 2000, maxRegistros = Infinity } = {}) {
    let registros = [];
    for (let pagina = 1; pagina <= maxPaginas && registros.length < maxRegistros; pagina += 1) {
      const html = await this.buscarPagina(pagina);
      const daPagina = parseRegistrosLegislacao(html);
      if (!daPagina.length) {break;}
      registros = registros.concat(daPagina);
    }
    return registros.slice(0, maxRegistros);
  }

  async processarRegistro(item, resultado) {
    const pdfUrl = item.anexoUrl;
    const existing = pdfUrl ? getDocumentoByUrlPdfRaw(pdfUrl) : null;
    let arquivo = { text: '', pages: 0, info: {}, error: null };
    let textoBase = '';
    let hashSource = `${item.tipoLabel}|${item.numero}|${item.exercicio}|${item.ementa}`;

    if (existing?.texto_completo) {
      textoBase = existing.texto_completo;
      hashSource = existing.hash_conteudo || hashSource;
    } else if (pdfUrl) {
      const pdfBuffer = await this.baixarBuffer(pdfUrl);
      hashSource = pdfBuffer;
      arquivo = await extractOfficialFileText(pdfBuffer, { filename: item.anexoNome, url: pdfUrl });
      textoBase = arquivo.text || '';
    }

    const titulo = normalizeSpaces(
      `${item.tipoLabel} nº ${item.numero}/${item.exercicio}${item.ementa ? ` - ${item.ementa}` : ''}`
    );

    this.salvarDocumento(
      {
        fonte: this.fonte,
        tipo: item.tipo,
        numero: item.numero,
        ano: item.exercicio,
        titulo,
        resumo: this.resumirTexto(textoBase || item.ementa || titulo),
        data_publicacao: item.dataPublicacao,
        data_abertura: null,
        valor_estimado: null,
        url_origem: `${BASE_URL}/m/Legislacao`,
        url_pdf: pdfUrl,
        texto_completo: textoBase || (item.ementa?.length > 200 ? item.ementa : null),
        dados_extras: {
          modulo: 'legislacao_camara',
          tipo_label: item.tipoLabel,
          autor: item.autor,
          ementa: item.ementa,
          anexo_nome: item.anexoNome,
          parser_pdf: {
            paginas: arquivo.pages,
            erro: arquivo.error || null,
            engine: arquivo.info?.parser || null,
            tipo_arquivo: arquivo.info?.tipo_arquivo || inferFileExtension({ filename: item.anexoNome, url: pdfUrl }) || 'pdf',
          },
        },
        hash_conteudo:
          typeof hashSource === 'string' && existing?.hash_conteudo
            ? existing.hash_conteudo
            : this.calcularHash(hashSource),
        status_coleta: pdfUrl ? (arquivo.error ? 'erro_pdf' : !textoBase && arquivo.pages > 0 ? 'imagem' : 'ok') : 'sem_pdf',
        licitacao_detalhes: null,
      },
      resultado
    );
  }

  async executar(resultado) {
    const registros = await this.collectRecords();
    for (const item of registros) {
      try {
        await this.processarRegistro(item, resultado);
      } catch (error) {
        this.registrarErroItem(resultado, { tipo: item.tipoLabel, numero: item.numero, exercicio: item.exercicio }, error);
      }
    }
  }
}

module.exports = ColetorCamaraLegislacao;
module.exports.parseRegistrosLegislacao = parseRegistrosLegislacao;
module.exports.parseTituloItem = parseTituloItem;
module.exports.extrairHtmlDaResposta = extrairHtmlDaResposta;
module.exports.paraHttps = paraHttps;
