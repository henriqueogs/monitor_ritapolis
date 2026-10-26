'use strict';

// CommonJS de propósito (mesmo padrão de lib/perguntar.js): testável pelo Jest da raiz.
//
// Identidade do município para o frontend: ÚNICO lugar do nome, UF, marca, domínios e hosts das
// fontes oficiais. Os valores vêm de ./municipios.json, cópia de municipios/*/municipio.json gerada por
// `npm run municipio:frontend` (o Next não lê fora de frontend/); tests/frontend-municipios.test.js
// falha se a cópia envelhecer. NEXT_PUBLIC_MUNICIPIO escolhe o município no build (padrão: o `padrao` do JSON).
// tests/frontend-ente-central.test.js garante que os pontos centrais (metadados, layout, disclaimers,
// marca, links de fonte) só leem daqui.

const { padrao, municipios } = require('./municipios.json');

const SLUG = process.env.NEXT_PUBLIC_MUNICIPIO || padrao;
const MUNICIPIO = municipios[SLUG];
if (!MUNICIPIO) {
  throw new Error(
    `NEXT_PUBLIC_MUNICIPIO="${SLUG}" não está em frontend/lib/municipios.json (rode npm run municipio:frontend)`
  );
}

const NOME = MUNICIPIO.nome;
const UF = MUNICIPIO.uf;
const UF_NOME = MUNICIPIO.ufNome;
const CNPJ_PREFEITURA = MUNICIPIO.cnpjPrefeitura;
const IBGE_CODE = MUNICIPIO.ibge;

const semAcento = texto => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const NOME_CHAVE = semAcento(NOME).toLowerCase();

const MARCA = MUNICIPIO.marca;
const DOMINIO_SITE = MUNICIPIO.dominioSite;
const SITE_URL = `https://${DOMINIO_SITE}`;

// Fontes oficiais (hosts). Os IDs de página do CMS ficam em source-links.js: são da fonte, não do ente.
const DOMINIO_PREFEITURA = MUNICIPIO.dominioPrefeitura;
const DOMINIO_CAMARA = MUNICIPIO.dominioCamara;
const HOSTS_PREFEITURA = [DOMINIO_PREFEITURA, `www.${DOMINIO_PREFEITURA}`];
const ORIGEM_PREFEITURA = `https://${DOMINIO_PREFEITURA}`;
const ORIGENS_PREFEITURA = HOSTS_PREFEITURA.map(host => `https://${host}`);
// Portal da Transparência: origem própria, porque cada fornecedor usa um endereço (municipio.json).
const PORTAL_TRANSPARENCIA = MUNICIPIO.portalTransparencia;
const HOST_PORTAL_TRANSPARENCIA = new URL(PORTAL_TRANSPARENCIA).hostname;
const PORTAL_TRANSPARENCIA_DESPESAS = `${PORTAL_TRANSPARENCIA}/Tempo_Real_Despesa`;
const HOST_SAPL = `sapl.${DOMINIO_CAMARA}`;
const HOST_CAMARA_PT = `pt.${DOMINIO_CAMARA}`;
const HOST_SGC = `sgc.${DOMINIO_CAMARA}`;
const ORIGEM_SGC = `https://${HOST_SGC}`;

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
  ORIGENS_PREFEITURA,
  PORTAL_TRANSPARENCIA,
  HOST_PORTAL_TRANSPARENCIA,
  PORTAL_TRANSPARENCIA_DESPESAS,
  HOST_SAPL,
  HOST_CAMARA_PT,
  HOST_SGC,
  ORIGEM_SGC,
  ente,
};
