const cheerio = require('cheerio');
const ColetorBase = require('./base');
const { getDocumentoByUrlPdfRaw } = require('../db');
const { extractOfficialFileText, inferFileExtension } = require('../parsers/document-file');
const { parseLicitacao } = require('../parsers/licitacao');
const { parseDecreto } = require('../parsers/decreto');
const {
  decodeHttpBody,
  normalizeText,
  looksLikeMojibake,
  deepHasMojibake,
  deepRepairStrings
} = require('../utils/text');

const BASE_URL = 'https://ritapolis.mg.gov.br';
const TARGET_PAGES = [
  { pageId: 6668, fallbackTitle: 'Editais' },
  { pageId: 9656, fallbackTitle: 'Editais 2' }
];

function normalizeSpaces(value) {
  return normalizeText(String(value || '')).replace(/\s+/g, ' ').trim();
}

function toIsoDate(value) {
  const match = String(value || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function inferTipo(title, text) {
  const source = `${title} ${text}`.toLowerCase();
  if (/(edital|preg[aã]o|dispensa|processo seletivo|concurso)/i.test(source)) return 'edital';
  if (/decreto/i.test(source)) return 'decreto';
  if (/portaria/i.test(source)) return 'portaria';
  if (/\blei\b/i.test(source)) return 'lei';
  return 'documento_publico';
}

function inferNumero(text) {
  const source = String(text || '');
  return (
    source.match(/processo\s+n[º°o]?\s*([\d./-]+)/i)?.[1] ||
    source.match(/(?:modalidade|preg[aã]o|dispensa|concorr[êe]ncia)[^\n]*?([\d./-]{3,})/i)?.[1] ||
    source.match(/(\d{1,4}\/20\d{2})/)?.[1] ||
    null
  );
}

function pickField(fields, names) {
  return names.map((name) => fields[name]).find(Boolean) || null;
}

function buildTitulo(fields, cadastroTitle) {
  const processo = pickField(fields, ['Processo nº', 'Processo n°', 'Processo no', 'Processo']);
  const modalidade = pickField(fields, ['Modalidade nº', 'Modalidade n°', 'Modalidade no', 'Modalidade']);
  const objetoBruto = pickField(fields, ['Objeto']);
  const objeto = looksLikeMojibake(objetoBruto) ? null : objetoBruto;

  return normalizeSpaces(
    [processo ? `Processo ${processo}` : null, modalidade, objeto || cadastroTitle]
      .filter(Boolean)
      .join(' - ')
  );
}

class ColetorSitePrefeitura extends ColetorBase {
  constructor() {
    super({ fonte: 'site_prefeitura' });
  }

  async fetchPageShell(pageId) {
    const url = `${BASE_URL}/ws_consulta/Pagina.php?INT_PAG=${pageId}`;
    const response = await this.buscarComRetry(url, { responseType: 'arraybuffer' });
    return {
      url,
      html: decodeHttpBody(response.data, response.headers['content-type'])
    };
  }

  extractCadastroGenericoIds(html) {
    return [...String(html || '').matchAll(/obterCadastroGenerico\((\d+),\s*(?:false|true)\)/gi)]
      .map((match) => Number(match[1]))
      .filter((value, index, list) => list.indexOf(value) === index);
  }

  async fetchCadastroMeta(cadastroId) {
    const url = `${BASE_URL}/ws_consulta/Cadastro_Generico.php?INT_CAD_GEN=${cadastroId}`;
    const response = await this.buscarComRetry(url, { responseType: 'arraybuffer' });
    const html = decodeHttpBody(response.data, response.headers['content-type']);
    const $ = cheerio.load(html);
    return {
      title: normalizeSpaces($('#cadastro_generico_titulo').text()),
      updatedAt: normalizeSpaces($('#cadastro_generico_ultima_atualizacao strong').text())
    };
  }

  async fetchCadastroPage(cadastroId, pageIndex = 0) {
    const url = `${BASE_URL}/ws_consulta/Conteudo_Generico.php?DataHora=${Date.now()}`;
    const payload = new URLSearchParams({
      INT_CAD_GEN: String(cadastroId),
      STR_BSC_CAD_GEN: '',
      LG_ADM: 'false',
      INT_PAG: String(pageIndex)
    }).toString();
    const response = await this.postComRetry(url, payload, {
      responseType: 'arraybuffer',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    return decodeHttpBody(response.data, response.headers['content-type']);
  }

  getTotalPages(html) {
    const $ = cheerio.load(html);
    const options = $('#paginador_cadastro_generico select option');
    return options.length || 1;
  }

  parseRecords(pageUrl, cadastroTitle, html) {
    const $ = cheerio.load(html);
    const records = [];

    $('#contenedor_registro_generico').each((_, block) => {
      const fields = {};

      $(block)
        .find('.informacao_generica')
        .each((__, node) => {
          const label = normalizeSpaces($(node).find('.titulo_generico').first().text()).replace(/:$/, '');
          const value = normalizeSpaces($(node).find('.valor_generico').first().text());
          if (label) {
            fields[label] = value;
          }
        });

      const attachments = [];
      $(block)
        .find('.cadgen-arquivo-item')
        .each((__, node) => {
          const nameNode = $(node).find('#nome_arquivo_registro_generico');
          const onclick = nameNode.attr('onclick') || '';
          const match = onclick.match(/obterArquivoCadastroGenerico\((\d+)\)/i);
          const fileId = match?.[1];
          attachments.push({
            nome: normalizeSpaces(nameNode.text()) || 'arquivo.pdf',
            datahora: normalizeSpaces($(node).find('#datahora_arquivo_registro_generico').text()),
            fileId,
            url: fileId
              ? `${BASE_URL}/Obter_Arquivo_Cadastro_Generico.php?INT_ARQ=${fileId}&LG_ADM=false`
              : null
          });
        });

      const processo = pickField(fields, ['Processo nº', 'Processo n°', 'Processo no', 'Processo']);
      const modalidade = pickField(fields, ['Modalidade nº', 'Modalidade n°', 'Modalidade no', 'Modalidade']);
      const titulo = buildTitulo(fields, cadastroTitle);

      records.push({
        pageUrl,
        cadastroTitle,
        fields,
        attachments,
        titulo,
        numero: processo || inferNumero(`${modalidade || ''} ${titulo}`),
        dataPublicacao: toIsoDate(fields.Data || null)
      });
    });

    return records;
  }

  async collectRecordsForPage(target) {
    const shell = await this.fetchPageShell(target.pageId);
    const cadastroIds = this.extractCadastroGenericoIds(shell.html);
    const allRecords = [];

    for (const cadastroId of cadastroIds) {
      const meta = await this.fetchCadastroMeta(cadastroId);
      const firstPageHtml = await this.fetchCadastroPage(cadastroId, 0);
      const totalPages = this.getTotalPages(firstPageHtml);
      allRecords.push(
        ...this.parseRecords(shell.url, meta.title || target.fallbackTitle, firstPageHtml)
      );

      for (let pageIndex = 1; pageIndex < totalPages; pageIndex += 1) {
        const pageHtml = await this.fetchCadastroPage(cadastroId, pageIndex);
        allRecords.push(
          ...this.parseRecords(shell.url, meta.title || target.fallbackTitle, pageHtml)
        );
      }
    }

    return allRecords;
  }

  async processarRegistro(item, resultado) {
    const attachment = item.attachments.find((itemAttachment) => itemAttachment.url) || null;
    const pdfUrl = attachment?.url || null;
    const tipoArquivo = inferFileExtension({
      filename: attachment?.nome,
      url: attachment?.url
    }) || 'pdf';
    const existing = pdfUrl ? getDocumentoByUrlPdfRaw(pdfUrl) : null;
    let arquivo = { text: '', pages: 0, info: {}, error: null };
    let hashSource = JSON.stringify(item.fields);
    let textoBase = '';

    const existingCorrompido =
      !!existing &&
      (
        looksLikeMojibake(existing.titulo) ||
        looksLikeMojibake(existing.resumo) ||
        looksLikeMojibake(existing.texto_completo) ||
        deepHasMojibake(existing.dados_extras)
      );

    if (existing?.texto_completo && !existingCorrompido) {
      textoBase = existing.texto_completo;
      hashSource = existing.hash_conteudo || hashSource;
    } else if (pdfUrl) {
      const pdfBuffer = await this.baixarBuffer(pdfUrl);
      hashSource = pdfBuffer;
      arquivo = await extractOfficialFileText(pdfBuffer, {
        filename: attachment?.nome,
        url: attachment?.url
      });
      textoBase = arquivo.text || '';
    }

    const mergedText = textoBase || `${item.titulo}\n${item.fields.Objeto || ''}`;
    const licitacao = parseLicitacao(mergedText);
    const decreto = parseDecreto(mergedText);
    const tipo = inferTipo(item.titulo, mergedText);
    const numero = item.numero || inferNumero(`${item.titulo}\n${mergedText}`);
    const camposNormalizados = deepRepairStrings({ ...item.fields });

    if (looksLikeMojibake(camposNormalizados.Objeto) && licitacao.objeto) {
      camposNormalizados.Objeto = normalizeSpaces(licitacao.objeto);
    }

    const tituloReconstruido = buildTitulo(camposNormalizados, item.cadastroTitle);
    const titulo =
      tituloReconstruido && (looksLikeMojibake(item.titulo) || !item.titulo)
        ? tituloReconstruido
        : item.titulo || tituloReconstruido;

    this.salvarDocumento(
      {
        fonte: this.fonte,
        tipo,
        numero,
        ano: this.inferirAno({ numero, dataPublicacao: item.dataPublicacao }),
        titulo,
        resumo: this.resumirTexto(mergedText || item.fields.Objeto || titulo),
        data_publicacao: item.dataPublicacao,
        data_abertura: licitacao.data_abertura || null,
        valor_estimado: licitacao.valor_estimado,
        url_origem: item.pageUrl,
        url_pdf: pdfUrl,
        texto_completo: textoBase || null,
        dados_extras: {
          cadastro_titulo: item.cadastroTitle,
          campos: camposNormalizados,
          anexos: item.attachments,
          licitacao,
          decreto,
          parser_pdf: {
            paginas: arquivo.pages,
            erro: arquivo.error || null,
            engine: arquivo.info?.parser || null,
            tipo_arquivo: arquivo.info?.tipo_arquivo || tipoArquivo
          }
        },
        hash_conteudo:
          typeof hashSource === 'string' && existing?.hash_conteudo
            ? existing.hash_conteudo
            : this.calcularHash(hashSource),
        status_coleta: pdfUrl ? (arquivo.error ? 'erro_pdf' : 'ok') : 'sem_pdf',
        licitacao_detalhes:
          tipo === 'edital'
            ? {
                modalidade:
                  licitacao.modalidade ||
                  pickField(camposNormalizados, ['Modalidade nº', 'Modalidade n°', 'Modalidade no', 'Modalidade']) ||
                  null,
                status: null
              }
            : null
      },
      resultado
    );
  }

  async executar(resultado) {
    for (const target of TARGET_PAGES) {
      const records = await this.collectRecordsForPage(target);

      for (const record of records) {
        try {
          await this.processarRegistro(record, resultado);
        } catch (error) {
          this.registrarErroItem(resultado, { pageId: target.pageId, titulo: record.titulo }, error);
        }
      }
    }
  }
}

ColetorSitePrefeitura.TARGET_PAGES = TARGET_PAGES;

module.exports = ColetorSitePrefeitura;
