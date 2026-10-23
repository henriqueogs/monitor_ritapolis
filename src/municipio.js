'use strict';

/**
 * Configuração do município em arquivo: `municipios/<slug>/municipio.json` descreve quem é o ente
 * (nome, UF, IBGE, CNPJs). É o ponto de partida do repositório-modelo (ADR 0007): uma instalação
 * nova escolhe o município pela variável `MUNICIPIO` e não edita código.
 *
 * Este módulo só lê e confere a forma do arquivo. A validação dos valores (CNPJ com 14 dígitos,
 * IBGE com 7, UF com 2 letras) continua em `src/ente.js`, que é por onde o código de produção lê.
 * Não depende de `src/config.js` (é o config que lê daqui), para não criar ciclo.
 */

const fs = require('fs');
const path = require('path');

const RAIZ_MUNICIPIOS = path.resolve(__dirname, '..', 'municipios');
const ARQUIVO = 'municipio.json';
const SLUG_PADRAO = 'ritapolis';
const SLUG_VALIDO = /^[a-z0-9_-]+$/;

// Espelho de `required` em municipios/municipio.schema.json (um teste garante que não divergem).
const CAMPOS_OBRIGATORIOS = Object.freeze([
  'slug',
  'nome',
  'uf',
  'ufNome',
  'ibge',
  'cnpjPrefeitura',
  'cnpjCamara',
  'marca',
  'dominioSite',
  'dominioPrefeitura',
  'dominioCamara',
]);

function exigirSlug(slug) {
  if (!SLUG_VALIDO.test(String(slug ?? ''))) {
    throw new Error(
      `slug de município inválido: "${slug}" (use letras minúsculas, números, - ou _)`
    );
  }
  return slug;
}

function lerJson(caminho) {
  if (!fs.existsSync(caminho)) {
    throw new Error(`município não encontrado: ${caminho}`);
  }
  try {
    return JSON.parse(fs.readFileSync(caminho, 'utf8'));
  } catch (err) {
    throw new Error(`municipio.json inválido em ${caminho}: ${err.message}`, { cause: err });
  }
}

function conferirForma(dados, { slug, caminho }) {
  const faltando = CAMPOS_OBRIGATORIOS.filter(campo => !(campo in dados));
  if (faltando.length > 0) {
    throw new Error(`${caminho}: faltam campos obrigatórios: ${faltando.join(', ')}`);
  }
  if (dados.slug !== slug) {
    throw new Error(`${caminho}: slug "${dados.slug}" diferente da pasta "${slug}"`);
  }
}

/** Lê e confere `municipios/<slug>/municipio.json`. Erro de arquivo ou de forma derruba a carga. */
function lerMunicipio({ slug = SLUG_PADRAO, raiz = RAIZ_MUNICIPIOS } = {}) {
  exigirSlug(slug);
  const caminho = path.join(raiz, slug, ARQUIVO);
  const dados = lerJson(caminho);
  conferirForma(dados, { slug, caminho });
  return Object.freeze({ ...dados });
}

/** Slugs das pastas de `municipios/` que têm `municipio.json`. */
function listarMunicipios({ raiz = RAIZ_MUNICIPIOS } = {}) {
  return fs
    .readdirSync(raiz, { withFileTypes: true })
    .filter(entrada => entrada.isDirectory())
    .map(entrada => entrada.name)
    .filter(nome => fs.existsSync(path.join(raiz, nome, ARQUIVO)))
    .sort();
}

/**
 * Todos os municípios por slug, sem o campo `$schema`: é a cópia que o frontend lê
 * (frontend/lib/municipios.json, gerada por `npm run municipio:frontend`).
 */
function exportarMunicipios({ raiz = RAIZ_MUNICIPIOS } = {}) {
  return Object.fromEntries(
    listarMunicipios({ raiz }).map(slug => {
      const { $schema: _schema, ...dados } = lerMunicipio({ slug, raiz });
      return [slug, dados];
    })
  );
}

module.exports = {
  lerMunicipio,
  listarMunicipios,
  exportarMunicipios,
  SLUG_PADRAO,
  RAIZ_MUNICIPIOS,
  CAMPOS_OBRIGATORIOS,
};
