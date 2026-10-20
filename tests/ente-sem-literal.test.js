'use strict';

/**
 * Guarda da Fase 3 (docs/MAPA_GENERICO_VS_RITAPOLIS.md, seção 2.1): a identidade do município
 * (CNPJ, UF, código IBGE) mora na configuração. CNPJ literal em código de produção é erro de teste.
 * Exceções são explícitas e justificadas abaixo; para adicionar uma, escreva o motivo.
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const PASTAS = ['src', 'scripts', 'frontend/app', 'frontend/lib'];
const IGNORAR_DIRS = new Set(['node_modules', '.next', '.next-dev', '__fixtures__', 'coverage']);
const EXTENSOES = new Set(['.js', '.mjs', '.cjs', '.jsx']);

// Onde a configuração do ente mora de verdade (valores padrão de Ritápolis).
const CONFIGURACAO = new Set(['src/config.js', 'frontend/lib/ente.js']);

// Exceções conhecidas, com motivo.
const EXCECOES = {
  'src/parsers/licitacao-resultados-itens.js':
    'regex do cabeçalho impresso nos PDFs de Ritápolis (endereço, CEP, telefone e CNPJ juntos); ' +
    'heurística de layout do documento, não identidade. Gerar a partir do ente é trabalho da Fase 3 (passo 4)',
  'src/parsers/licitacao-produtos.js':
    'mesmo cabeçalho impresso dos PDFs de Ritápolis, em variante própria (sem o número de página ' +
    'final); consolidar com o de licitacao-resultados-itens.js é trabalho da Fase 3 (passo 4)',
  'scripts/resolver-lacunas-produtos-mapeadas.js':
    'correção histórica com CNPJs de FORNECEDORES (dados de produção), não do ente',
};

const CNPJ_FORMATADO = /\b\d{2}\\?\.\d{3}\\?\.\d{3}\\?\/\d{4}-\d{2}\b/g;
const CNPJ_CONTINUO = /(?<![\d.])\d{14}(?![\d.])/g;
const UF_LITERAL = /\buf\s*[:=]\s*'[A-Z]{2}'/g;
const IBGE_LITERAL = /(?<![\d.,])31\d{5}(?!\d)/g;
const CNPJ_ZERADO = /^0+$/;

/** Devolve os literais de identidade do ente encontrados em um trecho de código. */
function encontrarLiterais(conteudo) {
  const achados = [];
  const cnpjs = [
    ...(conteudo.match(CNPJ_FORMATADO) ?? []),
    ...(conteudo.match(CNPJ_CONTINUO) ?? []),
  ].filter(c => !CNPJ_ZERADO.test(c.replace(/\D/g, '')));
  achados.push(...cnpjs.map(valor => ({ tipo: 'cnpj', valor })));
  achados.push(...(conteudo.match(UF_LITERAL) ?? []).map(valor => ({ tipo: 'uf', valor })));
  achados.push(...(conteudo.match(IBGE_LITERAL) ?? []).map(valor => ({ tipo: 'ibge', valor })));
  return achados;
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

describe('encontrarLiterais (o detector da guarda)', () => {
  it.each([
    ["const X = '18.557.553/0001-05';", 'cnpj'],
    ["const X = '18557553000105';", 'cnpj'],
    ['/CNPJ:\\s*18\\.557\\.553\\/0001-05/', 'cnpj'],
    ["fn({ uf: 'MG' })", 'uf'],
    ["function f(uf = 'SP') {}", 'uf'],
    ["const ibge = '3156106';", 'ibge'],
  ])('pega %s', (codigo, tipo) => {
    expect(encontrarLiterais(codigo).map(a => a.tipo)).toContain(tipo);
  });

  it.each([
    'const cnpj = config.cnpjPrefeitura;',
    'const uf = ente.uf;',
    '// formato "00.000.000/0000-00"',
    'const ts = 20261019123456789;',
    "const valor = 'R$ 1.234.567,89';",
    "const x = '2026-10-19T12:00:00Z';",
  ])('não acusa código legítimo: %s', codigo => {
    expect(encontrarLiterais(codigo)).toEqual([]);
  });
});

describe('identidade do ente fora da configuração', () => {
  const arquivos = PASTAS.flatMap(listarArquivos);

  it('varre arquivos de verdade (a guarda não está vazia)', () => {
    expect(arquivos.length).toBeGreaterThan(50);
    expect(arquivos).toContain('src/config.js');
  });

  it('não há CNPJ, UF nem código IBGE literal fora da configuração e das exceções', () => {
    const violacoes = arquivos
      .filter(arquivo => !CONFIGURACAO.has(arquivo) && !(arquivo in EXCECOES))
      .flatMap(arquivo =>
        encontrarLiterais(fs.readFileSync(path.join(RAIZ, arquivo), 'utf8')).map(
          a => `${arquivo}: ${a.tipo} ${a.valor}`
        )
      );

    expect(violacoes).toEqual([]);
  });

  it('toda exceção ainda existe e ainda precisa existir (sem exceção morta)', () => {
    for (const arquivo of Object.keys(EXCECOES)) {
      const caminho = path.join(RAIZ, arquivo);
      expect({ arquivo, existe: fs.existsSync(caminho) }).toEqual({ arquivo, existe: true });
      expect({
        arquivo,
        temLiteral: encontrarLiterais(fs.readFileSync(caminho, 'utf8')).length > 0,
      }).toEqual({ arquivo, temLiteral: true });
    }
  });
});

describe('nome da cidade nos prompts de IA', () => {
  it('src/ai não escreve o nome do município à mão (vem do ente)', () => {
    const NOME = /rit(a|á)polis/i;
    const violacoes = listarArquivos('src/ai').filter(arquivo =>
      NOME.test(fs.readFileSync(path.join(RAIZ, arquivo), 'utf8'))
    );

    expect(violacoes).toEqual([]);
  });
});

describe('frontend/lib/ente.js espelha o padrão do backend', () => {
  it('CNPJ da Prefeitura e código IBGE iguais aos padrões de src/config.js', () => {
    const guardado = {};
    for (const chave of ['CNPJ_PREFEITURA', 'IBGE_CODE']) {
      guardado[chave] = process.env[chave];
      delete process.env[chave];
    }
    try {
      let config;
      jest.isolateModules(() => {
        config = require('../src/config');
      });
      const espelho = require('../frontend/lib/ente');

      expect(espelho.CNPJ_PREFEITURA).toBe(config.cnpjPrefeitura);
      expect(espelho.IBGE_CODE).toBe(config.ibgeCode);
    } finally {
      for (const [chave, valor] of Object.entries(guardado)) {
        if (valor !== undefined) {
          process.env[chave] = valor;
        }
      }
    }
  });
});
