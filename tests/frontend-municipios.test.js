'use strict';

/**
 * O frontend (Next, raiz `frontend/` na Vercel) não enxerga `municipios/` fora da sua pasta, então lê
 * uma cópia gerada: frontend/lib/municipios.json. Este teste garante que a cópia não envelhece e que
 * NEXT_PUBLIC_MUNICIPIO escolhe o município no build (ADR 0007).
 */

const fs = require('fs');
const path = require('path');
const { exportarMunicipios, SLUG_PADRAO } = require('../src/municipio');

const COPIA = path.resolve(__dirname, '..', 'frontend', 'lib', 'municipios.json');

function carregarEnteFrontend(slug) {
  const guardado = process.env.NEXT_PUBLIC_MUNICIPIO;
  if (slug === undefined) {
    delete process.env.NEXT_PUBLIC_MUNICIPIO;
  } else {
    process.env.NEXT_PUBLIC_MUNICIPIO = slug;
  }
  try {
    let modulo;
    jest.isolateModules(() => {
      modulo = require('../frontend/lib/ente');
    });
    return modulo;
  } finally {
    if (guardado === undefined) {
      delete process.env.NEXT_PUBLIC_MUNICIPIO;
    } else {
      process.env.NEXT_PUBLIC_MUNICIPIO = guardado;
    }
  }
}

describe('frontend/lib/municipios.json (cópia de municipios/ para o frontend)', () => {
  it('está igual a municipios/*/municipio.json (rode `npm run municipio:frontend` se falhar)', () => {
    const copia = JSON.parse(fs.readFileSync(COPIA, 'utf8'));

    expect(copia).toEqual({ padrao: SLUG_PADRAO, municipios: exportarMunicipios() });
  });
});

describe('frontend/lib/ente.js escolhe o município por NEXT_PUBLIC_MUNICIPIO', () => {
  it('sem a variável, é o município padrão (ritapolis)', () => {
    const ente = carregarEnteFrontend();

    expect(ente.NOME).toBe('Ritápolis');
  });

  it('NEXT_PUBLIC_MUNICIPIO=_exemplo troca nome, UF, marca e domínios', () => {
    const ente = carregarEnteFrontend('_exemplo');
    const exemplo = exportarMunicipios()._exemplo;

    expect(ente).toMatchObject({
      NOME: exemplo.nome,
      UF: exemplo.uf,
      UF_NOME: exemplo.ufNome,
      CNPJ_PREFEITURA: exemplo.cnpjPrefeitura,
      IBGE_CODE: exemplo.ibge,
      MARCA: exemplo.marca,
      DOMINIO_SITE: exemplo.dominioSite,
      SITE_URL: `https://${exemplo.dominioSite}`,
      DOMINIO_PREFEITURA: exemplo.dominioPrefeitura,
      DOMINIO_CAMARA: exemplo.dominioCamara,
    });
    expect(ente.ente).toMatchObject({ nome: exemplo.nome, uf: exemplo.uf, marca: exemplo.marca });
  });

  it('município inexistente derruba o carregamento com o slug no erro', () => {
    expect(() => carregarEnteFrontend('nao-existe')).toThrow(/nao-existe/);
  });
});
