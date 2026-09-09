'use strict';

// Parsing puro (sem I/O) dos endpoints SGC da Câmara usados pelo domínio
// "processo em andamento" (projetos de lei, vereadores, mandatos) --
// diferente de camara-legislacao.js, que cobre "documento já publicado".
//
// Duas formas de resposta confirmadas ao vivo em 09/09/2026:
// - buscarProjetos.php: envelope "001 - {...HTML...}" (mesmo formato de
//   buscarLegislacoes.php -- reusa extrairHtmlDaResposta/paraHttps daqui).
// - buscarVereadoresPelaBusca.php / buscarMandatosDoVereador.php: HTML cru,
//   sem envelope.

const cheerio = require('cheerio');
const { extrairHtmlDaResposta, paraHttps } = require('./camara-legislacao');
const { normalizarTipo, normalizeSpaces } = require('./legislacao-tipos');

// "6968 - Projeto de Lei - 8" -> { intPrjt: 6968, tipoLabel: 'Projeto de Lei', numero: '8' }
// Título de projeto não carrega o exercício (isso vem do campo separado
// "Exercício:"), diferente do título de legislação promulgada.
function parseTituloProjeto(texto) {
  const m = normalizeSpaces(texto).match(/^(\d+)\s*-\s*(.+?)\s*-\s*(\S+)$/);
  if (!m) {
    return null;
  }
  return { intPrjt: Number(m[1]), tipoLabel: m[2].trim(), numero: m[3] };
}

// Rótulos tipo "<b>Exercício: </b>2025" dentro do bloco de um item --
// a fonte não dá classe própria por campo, só <b>Label: </b>valor.
function extrairCampoRotulado(itemHtml, rotulo) {
  const re = new RegExp(`<b>${rotulo}:?\\s*<\\/b>\\s*([^<]*)`, 'i');
  const m = itemHtml.match(re);
  return m ? normalizeSpaces(m[1]) : null;
}

/**
 * @returns {Array<{intPrjt, cOrg, tipo, tipoLabel, numero, exercicio,
 *   autorTexto, ementa, situacao, localizacao, anexoUrl, anexoNome}>}
 */
function parseProjetos(html) {
  const $ = cheerio.load(String(html || ''));
  const registros = [];

  $('.contenedor_resultado_busca').each((_, el) => {
    const item = $(el);
    const itemHtml = item.html() || '';
    const link = item.find('.titulo_item a').first();
    const titulo = parseTituloProjeto(link.text());
    if (!titulo) {
      return;
    }

    const cOrgMatch = String(link.attr('href') || '').match(/C_ORG=([A-Z])/);
    const anexoLink = item.find('a.link_arquivo_item').first();

    registros.push({
      ...titulo,
      cOrg: cOrgMatch ? cOrgMatch[1] : 'P',
      tipo: normalizarTipo(titulo.tipoLabel),
      exercicio: Number(extrairCampoRotulado(itemHtml, 'Exerc[íi]cio')) || null,
      autorTexto: extrairCampoRotulado(itemHtml, 'Autor\\(es\\)'),
      ementa: extrairCampoRotulado(itemHtml, 'Ementa'),
      situacao: extrairCampoRotulado(itemHtml, 'Situa[çc][ãa]o'),
      localizacao: extrairCampoRotulado(itemHtml, 'Localiza[çc][ãa]o'),
      anexoUrl: anexoLink.length ? paraHttps(anexoLink.attr('href') || null) : null,
      anexoNome: anexoLink.length ? normalizeSpaces(anexoLink.find('.nome_arquivo_item').text()) : null,
    });
  });

  return registros;
}

// "<div class='nome_vereador' ...>Bruno Amaral Santos</div>" pareado por
// posição com o INT_PES no onClick do mesmo bloco.
function parseVereadores(html) {
  const $ = cheerio.load(String(html || ''));
  const registros = [];

  $('.contenedor_vereador').each((_, el) => {
    const item = $(el);
    const nomeEl = item.find('.nome_vereador').first();
    const nome = normalizeSpaces(nomeEl.text());
    const onClick = String(nomeEl.attr('onclick') || '');
    const m = onClick.match(/INT_PES=(\d+)/);
    if (!nome || !m) {
      return;
    }
    registros.push({ intPes: Number(m[1]), nome });
  });

  return registros;
}

// "<table> <tr><td>- 2025 a 2028 (PSDB) </td></tr> ... </table>" -- pode ter
// varios <tr>, um por mandato (ex.: vereador que trocou de partido).
function parseMandatos(html) {
  const texto = String(html || '');
  const matches = [...texto.matchAll(/(\d{4})\s+a\s+(\d{4})\s*\(([^)]+)\)/g)];
  return matches.map(m => ({
    periodoInicio: Number(m[1]),
    periodoFim: Number(m[2]),
    partido: m[3].trim(),
  }));
}

module.exports = {
  parseTituloProjeto,
  parseProjetos,
  parseVereadores,
  parseMandatos,
  extrairHtmlDaResposta,
};
