const ColetorBase = require('./base');
const https = require('https');
const cheerio = require('cheerio');
const { detectPayload, findModuleLinks, parseHtmlTable, resolveSh3Href } = require('./sh3');
const { extractPdfText } = require('../parsers/pdf');
const { parseLicitacao } = require('../parsers/licitacao');
const { decodeHttpBody, normalizeText } = require('../utils/text');

const BASE_URL = 'https://pt.ritapolis.mg.leg.br/';
const DISCOVERY_KEYWORDS = [
  'licit',
  'contrat',
  'ata',
  'aditivo',
  'legis',
  'portaria',
  'decreto',
  'resolu',
  'lei'
];

function inferTipoFromLabel(text) {
  const source = normalizeText(String(text || '')).toLowerCase();
  if (/licit/.test(source)) {return 'edital';}
  if (/contrat|aditivo|ata/.test(source)) {return 'contrato';}
  if (/portaria/.test(source)) {return 'portaria';}
  if (/decreto/.test(source)) {return 'decreto';}
  if (/resolu/.test(source)) {return 'resolucao';}
  if (/\blei\b|legis/.test(source)) {return 'lei';}
  return 'documento_publico';
}

function inferNumero(source) {
  const joined = normalizeText(Array.isArray(source) ? source.join(' ') : String(source || ''));
  return joined.match(/(\d{1,4}\/20\d{2})/)?.[1] || joined.match(/n[º°o]?\s*([\d./-]+)/i)?.[1] || null;
}

function inferDate(source) {
  const joined = normalizeText(Array.isArray(source) ? source.join(' ') : String(source || ''));
  const match = joined.match(/(\d{2}\/\d{2}\/\d{4})/);
  if (!match) {return null;}
  const [day, month, year] = match[1].split('/');
  return `${year}-${month}-${day}`;
}

// Referência a legislação externa (federal ou de órgão de controle) — citada nas
// páginas da Câmara, mas NÃO é um documento da Câmara municipal. Ex.: "Lei Federal
// nº 12.527", "Portaria TCU nº 275", "Lei Complementar Federal nº 101".
function isLegislacaoExterna(titulo) {
  const s = normalizeText(String(titulo || ''));
  return /\bfederal\b/i.test(s) || /\bT\.?\s?C\.?\s?[UE]\b/i.test(s);
}

// Página institucional / de referência (LAI, "ordem cronológica de pagamentos")
// que NÃO lista documentos — só tem texto explicativo e links de navegação. Não
// deve gerar documentos no acervo.
function isModuloInstitucional(moduloText) {
  const s = normalizeText(String(moduloText || '')).toLowerCase();
  return /acesso [àa] informa|sobre a lei de acesso|ordem cronol[óo]gica de pagamentos/.test(s);
}

// Rejeita linhas de UI (filtros, rótulos, links de navegação genéricos)
function isDocumentoValido(titulo, numero, dataPublicacao) {
  if (!titulo || titulo.length < 4) {return false;}
  // Número que é só pontuação não conta como identificador real
  const temNumero = numero && /\d/.test(numero);
  // Rótulos de filtro: "Situação:" ou "Histórico:"
  if (/:\s*$/.test(titulo)) {return false;}
  // Widget seletor de exercício: 3+ anos concatenados ("2026202520242023...")
  if (/(20\d{2}){3,}/.test(titulo)) {return false;}
  // Filtro com opções: "Situação: - Opção1 Opção2"
  if (/:\s*-?\s*([\w\s]{1,20}\s){2,}/.test(titulo) && !temNumero) {return false;}
  // Filtro de ano: "Ano: - 202620252024..." ou campo com anos concatenados
  if (/:\s*-?\s*(\d{4}){2,}/.test(titulo) && !temNumero) {return false;}
  // Título é só um ano isolado (seletor de ano)
  if (!temNumero && !dataPublicacao && /^\d{4}$/.test(titulo.trim())) {return false;}
  // Sem identificador algum (número, data) e título sem dígitos = link de navegação
  if (!temNumero && !dataPublicacao && !/\d/.test(titulo)) {return false;}
  return true;
}

class ColetorCamara extends ColetorBase {
  constructor() {
    super({
      fonte: 'camara',
      httpOptions: {
        httpsAgent: new https.Agent({ rejectUnauthorized: false })
      }
    });
  }

  async discoverModules() {
    const response = await this.buscarComRetry(BASE_URL, { responseType: 'arraybuffer' });
    const html = decodeHttpBody(response.data, response.headers['content-type']);
    return findModuleLinks(BASE_URL, html, DISCOVERY_KEYWORDS);
  }

  async fetchModule(url) {
    const response = await this.buscarComRetry(url, { responseType: 'arraybuffer' });
    const contentType = response.headers['content-type'] || '';
    if (contentType.includes('application/json')) {
      return detectPayload({
        ...response,
        data: JSON.parse(Buffer.from(response.data).toString('utf8'))
      });
    }

    return detectPayload({
      ...response,
      data: decodeHttpBody(response.data, contentType)
    });
  }

  buildDocumentoFromRow(moduleInfo, row, pdfInfo) {
    const titleParts = row.cells?.slice(0, 3) || [];
    const title = titleParts.join(' - ') || moduleInfo.text;
    const tipo = inferTipoFromLabel(`${moduleInfo.text} ${title}`);
    const numero = inferNumero(row.cells);
    const dataPublicacao = inferDate(row.cells);
    const licitacao = pdfInfo?.text ? parseLicitacao(pdfInfo.text) : parseLicitacao(title);

    return {
      fonte: this.fonte,
      tipo,
      numero,
      ano: this.inferirAno({ numero, dataPublicacao }),
      titulo: title,
      resumo: this.resumirTexto(pdfInfo?.text || row.cells?.join(' | ')),
      data_publicacao: dataPublicacao,
      data_abertura: licitacao.data_abertura || null,
      valor_estimado: licitacao.valor_estimado,
      url_origem: moduleInfo.href,
      url_pdf: row.links?.find((link) => /\.pdf(\?|$)/i.test(link.href))?.href || null,
      texto_completo: pdfInfo?.text || null,
      dados_extras: {
        modulo: moduleInfo.text,
        linhas: row.cells,
        links: row.links,
        licitacao
      },
      hash_conteudo: this.calcularHash(
        pdfInfo?.text || JSON.stringify({ title, cells: row.cells, links: row.links })
      ),
      status_coleta: row.links?.some((link) => /\.pdf(\?|$)/i.test(link.href))
        ? pdfInfo?.error
          ? 'erro_pdf'
          : 'ok'
        : 'sem_pdf',
      licitacao_detalhes:
        tipo === 'edital'
          ? {
              modalidade: licitacao.modalidade,
              status: null
            }
          : null
    };
  }

  async processHtmlModule(moduleInfo, html, resultado) {
    // Páginas institucionais (LAI, ordem cronológica) não listam documentos — só
    // texto e links de referência. Não inventar documentos a partir delas.
    if (isModuloInstitucional(moduleInfo.text)) {
      resultado.detalhes.push({
        modulo: moduleInfo.text,
        url: moduleInfo.href,
        aviso: 'modulo_institucional_ignorado'
      });
      return;
    }

    const rows = parseHtmlTable(moduleInfo.href, html).filter((row) => row.cells.length > 1 || row.links.length);
    const $ = cheerio.load(html);
    const fallbackLinks = $('a[href]')
      .map((_, link) => ({
        text: $(link).text().replace(/\s+/g, ' ').trim(),
        href: resolveSh3Href(moduleInfo.href, $(link).attr('href'))
      }))
      .get()
      .filter((item) => item.href)
      .filter((item) => /sapl|lei|decreto|resolu|portaria|norma/i.test(`${item.text} ${item.href}`));

    if (!rows.length && fallbackLinks.length) {
      for (const link of fallbackLinks) {
        const numero = inferNumero(link.text);
        const dataPublicacao = inferDate(link.text);
        if (!isDocumentoValido(link.text, numero, dataPublicacao)) {continue;}
        // Referências a legislação federal/órgão de controle não são documentos da Câmara
        if (isLegislacaoExterna(link.text)) {continue;}
        this.salvarDocumento(
          {
            fonte: this.fonte,
            tipo: inferTipoFromLabel(`${moduleInfo.text} ${link.text}`),
            numero,
            ano: this.inferirAno({ numero, dataPublicacao }),
            titulo: link.text || moduleInfo.text,
            resumo: this.resumirTexto(link.text),
            data_publicacao: dataPublicacao,
            url_origem: moduleInfo.href,
            url_pdf: null,
            texto_completo: null,
            dados_extras: {
              modulo: moduleInfo.text,
              link_externo: link.href
            },
            hash_conteudo: this.calcularHash(`${moduleInfo.href}|${link.href}|${link.text}`),
            status_coleta: 'sem_pdf'
          },
          resultado
        );
      }
      return;
    }

    if (!rows.length) {
      resultado.detalhes.push({
        modulo: moduleInfo.text,
        url: moduleInfo.href,
        aviso: 'nenhuma_tabela_encontrada'
      });
      return;
    }

    for (const row of rows) {
      try {
        const pdfUrl = row.links.find((link) => /\.pdf(\?|$)/i.test(link.href))?.href;
        let pdfInfo = null;

        if (pdfUrl) {
          const pdfBuffer = await this.baixarBuffer(pdfUrl);
          pdfInfo = await extractPdfText(pdfBuffer);
        }

        const documento = this.buildDocumentoFromRow(moduleInfo, row, pdfInfo);
        if (!isDocumentoValido(documento.titulo, documento.numero, documento.data_publicacao)) {continue;}
        if (isLegislacaoExterna(documento.titulo)) {continue;}
        this.salvarDocumento(documento, resultado);
      } catch (error) {
        this.registrarErroItem(resultado, { modulo: moduleInfo.text, url: moduleInfo.href }, error);
      }
    }
  }

  async processJsonModule(moduleInfo, payload, resultado) {
    const rows = Array.isArray(payload?.dados) ? payload.dados : Array.isArray(payload) ? payload : [];

    if (!rows.length) {
      resultado.detalhes.push({
        modulo: moduleInfo.text,
        url: moduleInfo.href,
        aviso: 'json_sem_dados'
      });
      return;
    }

    for (const row of rows) {
      try {
        const rowText = Object.values(row).filter(Boolean).join(' | ');
        const documento = {
          fonte: this.fonte,
          tipo: inferTipoFromLabel(moduleInfo.text),
          numero: inferNumero(rowText),
          ano: this.inferirAno({ numero: inferNumero(rowText), dataPublicacao: inferDate(rowText) }),
          titulo: row.objeto || row.descricao || rowText.slice(0, 180) || moduleInfo.text,
          resumo: this.resumirTexto(rowText),
          data_publicacao: inferDate(rowText),
          url_origem: moduleInfo.href,
          url_pdf: row.url || row.link || null,
          texto_completo: null,
          dados_extras: {
            modulo: moduleInfo.text,
            bruto: row
          },
          hash_conteudo: this.calcularHash(JSON.stringify(row)),
          status_coleta: row.url || row.link ? 'ok' : 'sem_pdf'
        };
        this.salvarDocumento(documento, resultado);
      } catch (error) {
        this.registrarErroItem(resultado, { modulo: moduleInfo.text, url: moduleInfo.href }, error);
      }
    }
  }

  async executar(resultado) {
    const modules = (await this.discoverModules()).filter(
      (item, index, list) => list.findIndex((other) => other.href === item.href) === index
    );

    for (const moduleInfo of modules) {
      try {
        const payload = await this.fetchModule(moduleInfo.href);
        if (payload.kind === 'json') {
          await this.processJsonModule(moduleInfo, payload.data, resultado);
        } else {
          await this.processHtmlModule(moduleInfo, payload.data, resultado);
        }
      } catch (error) {
        this.registrarErroItem(resultado, { modulo: moduleInfo.text, url: moduleInfo.href }, error);
      }
    }
  }
}

module.exports = ColetorCamara;
module.exports.isDocumentoValido = isDocumentoValido;
module.exports.isLegislacaoExterna = isLegislacaoExterna;
module.exports.isModuloInstitucional = isModuloInstitucional;
