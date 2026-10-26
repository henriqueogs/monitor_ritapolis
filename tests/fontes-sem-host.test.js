'use strict';

/**
 * Guarda do repositório-modelo (ADR 0007, item 3 do roteiro): os endereços das fontes oficiais e do
 * site público moram em municipios/<slug>/municipio.json. Domínio de um município real escrito à mão
 * no código de produção é erro de teste: o backend lê de src/fontes.js e o frontend de
 * frontend/lib/ente.js. O município fictício `_exemplo` fica de fora (domínios `.invalid`).
 */

const fs = require('fs');
const path = require('path');
const { exportarMunicipios } = require('../src/municipio');
const { SLUG_EXEMPLO } = require('../src/demo/documentos-exemplo');

const RAIZ = path.resolve(__dirname, '..');
const PASTAS = ['src', 'scripts', 'frontend/app', 'frontend/lib'];
const ARQUIVOS_SOLTOS = ['frontend/next.config.js', 'frontend/proxy.js'];
const IGNORAR_DIRS = new Set(['node_modules', '.next', '.next-dev', '__fixtures__', 'coverage']);
const EXTENSOES = new Set(['.js', '.mjs', '.cjs', '.jsx']);
const CAMPOS_DOMINIO = ['dominioSite', 'dominioPrefeitura', 'dominioCamara'];

function dominiosReais() {
  return Object.entries(exportarMunicipios())
    .filter(([slug]) => slug !== SLUG_EXEMPLO)
    .flatMap(([, municipio]) => [
      ...CAMPOS_DOMINIO.map(campo => municipio[campo]),
      new URL(municipio.portalTransparencia).hostname,
    ]);
}

function listarArquivos(pasta) {
  const absoluta = path.join(RAIZ, pasta);
  if (!fs.existsSync(absoluta)) {
    return [];
  }
  return fs.readdirSync(absoluta, { withFileTypes: true }).flatMap(entrada => {
    const relativo = `${pasta}/${entrada.name}`;
    if (entrada.isDirectory()) {
      return IGNORAR_DIRS.has(entrada.name) ? [] : listarArquivos(relativo);
    }
    const ehCodigo = EXTENSOES.has(path.extname(entrada.name));
    const ehTeste = /\.(test|spec)\.[cm]?js$/.test(entrada.name);
    return ehCodigo && !ehTeste ? [relativo] : [];
  });
}

/** Domínios proibidos que aparecem no conteúdo (comparação sem maiúsculas). */
function encontrarDominios(conteudo, dominios) {
  const texto = conteudo.toLowerCase();
  return dominios.filter(dominio => texto.includes(dominio.toLowerCase()));
}

describe('encontrarDominios (o detector da guarda)', () => {
  it('pega o domínio dentro de uma URL', () => {
    expect(
      encontrarDominios("const U = 'https://pt.cidade.mg.gov.br/x';", ['cidade.mg.gov.br'])
    ).toEqual(['cidade.mg.gov.br']);
  });

  it('não pega texto sem o domínio', () => {
    expect(
      encontrarDominios("const U = fontes.portalTransparencia + '/x';", ['cidade.mg.gov.br'])
    ).toEqual([]);
  });
});

describe('domínios das fontes só na configuração', () => {
  it('a lista de domínios proibidos vem dos municípios reais', () => {
    expect(dominiosReais()).toEqual(
      expect.arrayContaining(['ritapolis.com', 'ritapolis.mg.gov.br', 'ritapolis.mg.leg.br'])
    );
  });

  it('nenhum arquivo de produção escreve à mão o domínio de um município real', () => {
    const dominios = dominiosReais();
    const arquivos = [...PASTAS.flatMap(listarArquivos), ...ARQUIVOS_SOLTOS];

    const violacoes = arquivos
      .filter(relativo => fs.existsSync(path.join(RAIZ, relativo)))
      .map(relativo => ({
        arquivo: relativo,
        dominios: encontrarDominios(fs.readFileSync(path.join(RAIZ, relativo), 'utf8'), dominios),
      }))
      .filter(({ dominios: achados }) => achados.length > 0);

    expect(violacoes).toEqual([]);
  });
});
