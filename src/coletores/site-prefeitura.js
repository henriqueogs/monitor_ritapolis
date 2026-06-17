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
const PREFEITURA_AREAS = [
  {
    id: 'editais',
    titulo: 'Editais',
    fallbackTitle: 'Editais',
    pageId: 6668,
    publicUrl: `${BASE_URL}/pagina/6668/editais`,
    technicalUrl: `${BASE_URL}/ws_consulta/Pagina.php?INT_PAG=6668`,
    tipo: 'editais'
  },
  {
    id: 'editais_2',
    titulo: 'Editais 2',
    fallbackTitle: 'Editais 2',
    pageId: 9656,
    publicUrl: `${BASE_URL}/pagina/9656/Editais%202`,
    technicalUrl: `${BASE_URL}/ws_consulta/Pagina.php?INT_PAG=9656`,
    tipo: 'editais'
  },
  {
    id: 'emendas_estaduais',
    titulo: 'Emendas Parlamentares Estaduais',
    fallbackTitle: 'Emendas Estaduais',
    pageId: 21642,
    publicUrl: `${BASE_URL}/pagina/21642/emendas-parlamentares-estaduais`,
    technicalUrl: `${BASE_URL}/ws_consulta/Pagina.php?INT_PAG=21642`,
    tipo: 'emendas'
  },
  {
    id: 'emendas_federais',
    titulo: 'Emendas Parlamentares Federais',
    fallbackTitle: 'Emendas Federais',
    pageId: 21947,
    publicUrl: `${BASE_URL}/pagina/21947/emendas-parlamentares-federais`,
    technicalUrl: `${BASE_URL}/ws_consulta/Pagina.php?INT_PAG=21947`,
    tipo: 'emendas'
  },
  {
    id: 'assistencia_social',
    titulo: 'Assistência Social',
    fallbackTitle: 'Assistência Social',
    pageId: 18204,
    publicUrl: `${BASE_URL}/pagina/18204/assistencia-social`,
    technicalUrl: `${BASE_URL}/ws_consulta/Pagina.php?INT_PAG=18204`,
    tipo: 'documentos_sociais'
  }
];

function normalizeSpaces(value) {
  return normalizeText(String(value || '')).replace(/\s+/g, ' ').trim();
}

function toIsoDate(value) {
  const match = String(value || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) {return null;}
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function inferTipo(title, text, modalidade = '') {
  const mod = String(modalidade || '');
  // Usar apenas título + modalidade para classificação — o texto completo do PDF
  // menciona "lei" em todo documento jurídico ("nos termos da Lei 14.133..."), o que
  // causaria misclassificação de inexigibilidades e outros como tipo 'lei'.
  const headSource = `${title} ${mod}`;
  const fullSource = `${title} ${text}`;

  // Verificar antes de 'edital': publicações de extrato podem conter "dispensa" no corpo
  if (
    /publica[cç][aã]o.*diversa|contratos[/\s]?atas|atas[/\s]?contratos/i.test(mod) ||
    /publica[cç][aã]o.*diversa/i.test(fullSource)
  ) {
    return 'publicacao_extrato';
  }
  // Modalidades de contratação (inclusive inexigibilidade) → edital.
  // Inclui chamamento/chamada pública, credenciamento, concorrência, leilão,
  // tomada de preços, concessão de espaço/uso público e o erro comum "inexibilidade".
  if (
    /(edital|preg[aã]o|dispensa|inexigibilidade|inexibilidade|processo seletivo|concurso|ades[aã]o|chamamento|chamada p[uú]blica|credenciamento|concorr[eê]ncia|leil[aã]o|tomada de pre[cç]o|concess[aã]o)/i.test(
      headSource
    )
  ) {
    return 'edital';
  }
  // Contrato/ata apenas no título (evita falso positivo no corpo do PDF)
  if (/(contrato|aditivo|\bata\b)/i.test(headSource)) {return 'contrato';}
  if (/decreto/i.test(headSource)) {return 'decreto';}
  if (/portaria/i.test(headSource)) {return 'portaria';}
  // "lei" apenas no título (ex: "Lei nº 001/2024") — nunca no corpo do PDF
  if (/\blei\b/i.test(headSource)) {return 'lei';}
  // Emendas parlamentares (estaduais ou federais) — título pode ser "Emenda" ou "Emendas"
  if (/\bemendas?\b/i.test(headSource)) {return 'emenda_parlamentar';}
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
  // Campos de emendas parlamentares e outros tipos não-licitatórios
  const nomeDoc = pickField(fields, ['Nome', 'TITULO', 'Título']);
  const numeroDoc = pickField(fields, ['NÚMERO', 'Número', 'Nº']);

  // Publicação de extrato coletivo: título sintético, nunca usar o Objeto como título
  if (/publica[cç][aã]o.*diversa|contratos[/\s]?atas|atas[/\s]?contratos/i.test(String(modalidade || ''))) {
    const anoMatch = String(processo || objetoBruto || '').match(/\d{4}/);
    const ano = anoMatch ? anoMatch[0] : null;
    return normalizeSpaces(`Publicação de Contratos e Atas${ano ? ` — ${ano}` : ''}`);
  }

  // Para documentos não-licitatórios (emendas, assistência social, etc.)
  // o campo "Nome" ou "TITULO" é o título principal
  if (!processo && !modalidade && nomeDoc) {
    const parts = [nomeDoc, numeroDoc ? `nº ${numeroDoc}` : null].filter(Boolean);
    return normalizeSpaces(parts.join(' '));
  }

  return normalizeSpaces(
    [processo ? `Processo ${processo}` : null, modalidade, objeto || nomeDoc || cadastroTitle]
      .filter(Boolean)
      .join(' - ')
  );
}

class ColetorSitePrefeitura extends ColetorBase {
  constructor() {
    super({ fonte: 'site_prefeitura' });
  }

  async fetchPageShell(pageId) {
    const target = typeof pageId === 'object'
      ? pageId
      : PREFEITURA_AREAS.find((area) => area.pageId === Number(pageId));
    const url = target?.technicalUrl || `${BASE_URL}/ws_consulta/Pagina.php?INT_PAG=${pageId}`;
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
          const valorNode = $(node).find('.valor_generico').first();
          // Preferir href quando há link real (ex: PNCP, YouTube) em vez de só texto
          const linkHref = valorNode.find('a[href]').attr('href') || '';
          const linkText = normalizeSpaces(valorNode.text());
          const isValidHref = linkHref && linkHref !== 'http://' && linkHref.startsWith('http');
          const value = isValidHref ? linkHref : linkText;
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

  async collectRecordsForPage(target, options = {}) {
    const maxRecords = Number.isFinite(Number(options.maxRecords))
      ? Number(options.maxRecords)
      : Infinity;
    const shell = await this.fetchPageShell(target);
    const cadastroIds = this.extractCadastroGenericoIds(shell.html);
    const allRecords = [];

    for (const cadastroId of cadastroIds) {
      const meta = await this.fetchCadastroMeta(cadastroId);
      const firstPageHtml = await this.fetchCadastroPage(cadastroId, 0);
      const totalPages = this.getTotalPages(firstPageHtml);
      allRecords.push(
        ...this.parseRecords(target.publicUrl, meta.title || target.fallbackTitle, firstPageHtml)
      );
      if (allRecords.length >= maxRecords) {
        return allRecords.slice(0, maxRecords);
      }

      for (let pageIndex = 1; pageIndex < totalPages; pageIndex += 1) {
        const pageHtml = await this.fetchCadastroPage(cadastroId, pageIndex);
        allRecords.push(
          ...this.parseRecords(target.publicUrl, meta.title || target.fallbackTitle, pageHtml)
        );
        if (allRecords.length >= maxRecords) {
          return allRecords.slice(0, maxRecords);
        }
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
    const modalidadeRaw = pickField(item.fields, ['Modalidade nº', 'Modalidade n°', 'Modalidade no', 'Modalidade']) || '';
    const tipo = inferTipo(item.titulo, mergedText, modalidadeRaw);
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
        ano: this.inferirAno({ numero, dataPublicacao: item.dataPublicacao, titulo }),
        titulo,
        resumo: this.resumirTexto(mergedText || item.fields.Objeto || titulo),
        data_publicacao: item.dataPublicacao,
        data_abertura: licitacao.data_abertura || null,
        valor_estimado: licitacao.valor_estimado,
        url_origem: item.pageUrl,
        url_pdf: pdfUrl,
        texto_completo: textoBase || (
          !looksLikeMojibake(camposNormalizados?.Objeto) && (camposNormalizados?.Objeto?.length || 0) > 200
            ? camposNormalizados.Objeto
            : null
        ),
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
        status_coleta: pdfUrl
          ? arquivo.error
            ? 'erro_pdf'
            : !textoBase && arquivo.pages > 0
              ? 'imagem'
              : 'ok'
          : 'sem_pdf',
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
    for (const target of PREFEITURA_AREAS) {
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

ColetorSitePrefeitura.TARGET_PAGES = PREFEITURA_AREAS;
ColetorSitePrefeitura.AREAS = PREFEITURA_AREAS;

module.exports = ColetorSitePrefeitura;
module.exports.inferTipo = inferTipo;
