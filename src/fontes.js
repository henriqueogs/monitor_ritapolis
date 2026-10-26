'use strict';

/**
 * Endereços das fontes oficiais (site da Prefeitura, site da Câmara, Portal da Transparência) e do
 * site público, montados a partir de municipios/<slug>/municipio.json (ADR 0007). Fonte única para
 * coletores, deep-links e a API: tests/fontes-sem-host.test.js falha se o domínio de um município
 * real for escrito à mão no código de produção.
 *
 * Os caminhos dentro de cada fonte (/ws_consulta/..., /Tempo_Real_Despesa) continuam nos coletores:
 * são do fornecedor do sistema, não do município.
 */

const config = require('./config');

const DOMINIO_VALIDO = /^[a-z0-9.-]+$/;
const PORTAL_VALIDO = /^https:\/\/[a-z0-9.-]+$/;

function exigirDominio(campo, valor) {
  const dominio = String(valor ?? '').trim();
  if (!DOMINIO_VALIDO.test(dominio)) {
    throw new Error(
      `${campo} inválido: esperado só o domínio (ex.: cidade.mg.gov.br), recebido "${valor}"`
    );
  }
  return dominio;
}

function exigirPortal(valor) {
  const portal = String(valor ?? '')
    .trim()
    .replace(/\/+$/, '');
  if (!PORTAL_VALIDO.test(portal)) {
    throw new Error(
      `portalTransparencia inválido: esperado https://dominio sem caminho, recebido "${valor}"`
    );
  }
  return portal;
}

const comWww = dominio => [dominio, `www.${dominio}`];

/** Função pura: domínios do município → origens https das fontes. Valor inválido derruba. */
function montarFontes(cfg) {
  const dominioSite = exigirDominio('dominioSite', cfg.dominioSite);
  const dominioPrefeitura = exigirDominio('dominioPrefeitura', cfg.dominioPrefeitura);
  const dominioCamara = exigirDominio('dominioCamara', cfg.dominioCamara);
  return Object.freeze({
    site: `https://${dominioSite}`,
    hostsSite: Object.freeze(comWww(dominioSite)),
    sitePrefeitura: `https://${dominioPrefeitura}`,
    hostsPrefeitura: Object.freeze(comWww(dominioPrefeitura)),
    siteCamara: `https://${dominioCamara}`,
    portalTransparencia: exigirPortal(cfg.portalTransparencia),
  });
}

const fontes = montarFontes(config);

module.exports = { montarFontes, fontes };
