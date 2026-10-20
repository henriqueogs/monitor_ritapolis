'use strict';

// CommonJS de propósito (mesmo padrão de lib/perguntar.js): testável pelo Jest da raiz.
//
// Identidade do município para o frontend: ÚNICO lugar do nome, UF, marca, domínios e hosts das
// fontes oficiais. O frontend não importa código do backend; tests/ente-sem-literal.test.js garante
// que CNPJ e IBGE não divergem dos padrões de src/config.js, e tests/frontend-ente-central.test.js
// que os pontos centrais (metadados, layout, disclaimers, marca, links de fonte) só leem daqui.
// Trocar de município = trocar este arquivo e as variáveis do backend.

const NOME = 'Ritápolis';
const UF = 'MG';
const UF_NOME = 'Minas Gerais';
const CNPJ_PREFEITURA = '18557553000105';
const IBGE_CODE = '3156106';

const semAcento = texto => texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
const NOME_CHAVE = semAcento(NOME).toLowerCase();

// Marca = nome + ".com"; o domínio do site é o nome sem acento.
const MARCA = `${NOME}.com`;
const DOMINIO_SITE = `${NOME_CHAVE}.com`;
const SITE_URL = `https://${DOMINIO_SITE}`;

// Fontes oficiais (hosts). Os IDs de página do CMS ficam em source-links.js: são da fonte, não do ente.
const DOMINIO_PREFEITURA = `${NOME_CHAVE}.mg.gov.br`;
const DOMINIO_CAMARA = `${NOME_CHAVE}.mg.leg.br`;
const HOSTS_PREFEITURA = [DOMINIO_PREFEITURA, `www.${DOMINIO_PREFEITURA}`];
const ORIGEM_PREFEITURA = `https://${DOMINIO_PREFEITURA}`;
const HOST_SAPL = `sapl.${DOMINIO_CAMARA}`;
const HOST_CAMARA_PT = `pt.${DOMINIO_CAMARA}`;

// Forma agrupada, usada para parametrizar textos (funções puras recebem o ente como argumento).
const ente = Object.freeze({
  nome: NOME,
  nomeChave: NOME_CHAVE,
  uf: UF,
  ufNome: UF_NOME,
  marca: MARCA,
});

module.exports = {
  NOME,
  NOME_CHAVE,
  UF,
  UF_NOME,
  CNPJ_PREFEITURA,
  IBGE_CODE,
  MARCA,
  DOMINIO_SITE,
  SITE_URL,
  DOMINIO_PREFEITURA,
  DOMINIO_CAMARA,
  HOSTS_PREFEITURA,
  ORIGEM_PREFEITURA,
  HOST_SAPL,
  HOST_CAMARA_PT,
  ente,
};
