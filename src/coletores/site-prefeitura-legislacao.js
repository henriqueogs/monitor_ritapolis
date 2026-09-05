'use strict';

// Legislação municipal (decretos, leis, portarias, resoluções...) — módulo de
// busca próprio do site da Prefeitura (`/ws_consulta/wsBuscarLeis.php`),
// completamente separado do fluxo de "cadastro genérico" usado por
// editais/emendas (site-prefeitura.js). Achado: 5.370 itens no site, 0
// coletados até agora — o coletor de editais nunca apontou pra cá.
//
// Escopo inicial: só o mandato atual (EXR_LEI_INI = ano de início do mandato)
// — mesmo critério usado pro plano de reformulação de alertas. 730 itens em
// 05/09/2026, bem menor que o histórico completo (5.370).

const cheerio = require('cheerio');
const ColetorBase = require('./base');
const { getDocumentoByUrlPdfRaw } = require('../db');
const { extractOfficialFileText, inferFileExtension } = require('../parsers/document-file');
const { decodeHttpBody, normalizeText } = require('../utils/text');
const { naoFutura } = require('../utils/datas');
const { mandatoInicio } = require('../utils/mandato');

const BASE_URL = 'https://ritapolis.mg.gov.br';
const SEARCH_URL = `${BASE_URL}/ws_consulta/wsBuscarLeis.php`;
const REGISTROS_POR_PAGINA = 50;

const MESES = {
  janeiro: '01', fevereiro: '02', março: '03', marco: '03', abril: '04',
  maio: '05', junho: '06', julho: '07', agosto: '08', setembro: '09',
  outubro: '10', novembro: '11', dezembro: '12',
};

// Tipo da fonte (rótulo em português, ex: "Lei Complementar") -> nosso `tipo`
// normalizado (snake_case), consistente com o resto do banco.
const TIPO_MAP = {
  'decreto': 'decreto',
  'lei ordinaria': 'lei_ordinaria',
  'lei complementar': 'lei_complementar',
  'portaria': 'portaria',
  'resolucao': 'resolucao',
  'instrucao normativa': 'instrucao_normativa',
  'lei organica': 'lei_organica',
  'atas': 'ata',
  'regimento interno': 'regimento_interno',
  'estatuto': 'estatuto',
  'ata de comissao': 'ata_comissao',
  'projeto de lei': 'projeto_lei',
  'lei': 'lei',
  'deliberacao': 'deliberacao',
  'decreto legislativo': 'decreto_legislativo',
  'portaria do legislativo': 'portaria_legislativo',
  'projeto de lei complementar': 'projeto_lei_complementar',
  'oficio': 'oficio',
};

function normalizeSpaces(value) {
  return normalizeText(String(value || '')).replace(/\s+/g, ' ').trim();
}

function chaveTipo(rotulo) {
  return normalizeSpaces(rotulo)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function normalizarTipo(rotulo) {
  return TIPO_MAP[chaveTipo(rotulo)] || 'documento_publico';
}

// "PORTARIA 432 DE 05 DE JANEIRO DE 2026.pdf" -> "2026-01-05". A listagem de
// resultado não traz a data de publicação como coluna própria; o nome do
// arquivo é a fonte mais confiável disponível sem abrir cada PDF.
function extrairDataDoNomeArquivo(nome) {
  const m = String(nome || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .match(/(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/i);
  if (!m) {return null;}
  const mes = MESES[m[2]];
  if (!mes) {return null;}
  return `${m[3]}-${mes}-${String(m[1]).padStart(2, '0')}`;
}

// "Portaria nº 432   2025" -> { tipoLabel: 'Portaria', numero: '432', exercicio: 2025 }
function parseLinhaMetadados(tds) {
  if (!tds[0]) {return null;}
  const m = String(tds[0]).match(/^(.+?)\s+n[ºo°]\s*(\d+)\s+(\d{4})$/i);
  if (!m) {return null;}
  return {
    tipoLabel: normalizeSpaces(m[1]),
    numero: m[2],
    exercicio: Number(m[3]),
    autor: normalizeSpaces(tds[1] || ''),
    ementa: normalizeSpaces(tds[2] || ''),
  };
}

// HTML de resposta do wsBuscarLeis.php: tabela mal-formada (TRs sem
// fechamento correto), mas o cheerio corrige a arvore igual um navegador —
// cada item vira 2 <tr> irmãos: metadados (4 td) seguido do <tr> com o link
// do PDF (class="cliqueaqui"). Pareamos por posição.
function parseRegistrosLeis(html) {
  const $ = cheerio.load(html);
  const linhas = $('tr').toArray();
  const registros = [];

  for (let i = 0; i < linhas.length; i += 1) {
    const tds = $(linhas[i])
      .find('> td')
      .map((_, td) => normalizeSpaces($(td).text()))
      .get();
    const meta = parseLinhaMetadados(tds);
    if (!meta) {continue;}

    const proxima = linhas[i + 1];
    const link = proxima ? $(proxima).find('a.cliqueaqui').first() : null;
    const href = link?.attr('href') || null;
    const anexoNome = link ? normalizeSpaces(link.text()) : null;

    registros.push({
      ...meta,
      tipo: normalizarTipo(meta.tipoLabel),
      anexoUrl: href ? `${BASE_URL}${href}` : null,
      anexoNome,
      dataPublicacao: naoFutura(extrairDataDoNomeArquivo(anexoNome)),
    });
  }

  return registros;
}

function getTotalItens(html) {
  const m = String(html || '').match(/(\d+)\s+itens encontrados/i);
  return m ? Number(m[1]) : 0;
}

class ColetorLegislacaoPrefeitura extends ColetorBase {
  constructor() {
    super({ fonte: 'site_prefeitura' });
  }

  async buscarPagina(exercicioInicial, pagina) {
    const payload = new URLSearchParams({
      INT_TAG: '',
      STR_COPL_LEI: '',
      INT_VER: '',
      D_PUBL_LEI_INI: '',
      D_PUBL_LEI_FIM: '',
      STR_BSC: '',
      INT_NUM_LEI: '',
      STR_TIT_LEI: '',
      INT_TP_LEI: '',
      STR_PAL_CHAVE: '',
      D_FIM_LEI: '',
      DESC_ASSN: '',
      INT_PAG: String(pagina),
      STR_ORDER: 'D_PUBL_LEI DESC',
      INT_NUM_REG_PAG: String(REGISTROS_POR_PAGINA),
      EXR_LEI_INI: String(exercicioInicial),
    }).toString();

    const response = await this.postComRetry(`${SEARCH_URL}?DataHora=${Date.now()}`, payload, {
      responseType: 'arraybuffer',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return decodeHttpBody(response.data, response.headers['content-type']);
  }

  // Coleta todas as páginas a partir do exercício informado (default: início
  // do mandato atual). `maxRegistros` é defensivo (testes/uso pontual).
  async collectRecords({ exercicioInicial, maxRegistros = Infinity } = {}) {
    const anoInicio = exercicioInicial || mandatoInicio(new Date().getFullYear());
    const primeiraHtml = await this.buscarPagina(anoInicio, 0);
    const total = getTotalItens(primeiraHtml);
    const totalPaginas = Math.ceil(total / REGISTROS_POR_PAGINA) || 1;

    let registros = parseRegistrosLeis(primeiraHtml);
    for (let pagina = 1; pagina < totalPaginas && registros.length < maxRegistros; pagina += 1) {
      const html = await this.buscarPagina(anoInicio, pagina);
      registros = registros.concat(parseRegistrosLeis(html));
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
        url_origem: `${BASE_URL}/?Meio=Leis`,
        url_pdf: pdfUrl,
        texto_completo: textoBase || (item.ementa?.length > 200 ? item.ementa : null),
        dados_extras: {
          modulo: 'legislacao_municipal',
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

module.exports = ColetorLegislacaoPrefeitura;
module.exports.parseRegistrosLeis = parseRegistrosLeis;
module.exports.parseLinhaMetadados = parseLinhaMetadados;
module.exports.normalizarTipo = normalizarTipo;
module.exports.extrairDataDoNomeArquivo = extrairDataDoNomeArquivo;
module.exports.getTotalItens = getTotalItens;
