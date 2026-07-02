'use strict';

/**
 * Classificação cidadã da categoria econômica (código contábil da despesa).
 * Formato da fonte: "3.3.90.14.00 - DIÁRIAS - CIVIL" — classificamos pelo
 * elemento de despesa (4 primeiros pares de dígitos) com longest-prefix match
 * e fallback por grupo, garantindo 100% de cobertura sem inventar dado.
 */

const GRUPOS = {
  CUSTEIO: 'custeio',
  INVESTIMENTO: 'investimento',
  PESSOAL: 'pessoal',
  FINANCEIRO: 'financeiro',
  EXTRA: 'extra',
};

// Ordem não importa — o match é pelo prefixo mais longo.
const CATEGORIAS = [
  { slug: 'diarias', rotulo: 'Diárias', grupo: GRUPOS.CUSTEIO, prefixos: ['3.3.90.14'] },
  { slug: 'material', rotulo: 'Material de consumo', grupo: GRUPOS.CUSTEIO, prefixos: ['3.3.90.30'] },
  {
    slug: 'distribuicao-gratuita',
    rotulo: 'Distribuição gratuita',
    grupo: GRUPOS.CUSTEIO,
    prefixos: ['3.3.90.32'],
  },
  { slug: 'passagens', rotulo: 'Passagens e locomoção', grupo: GRUPOS.CUSTEIO, prefixos: ['3.3.90.33'] },
  {
    slug: 'servicos-pf',
    rotulo: 'Serviços de pessoa física',
    grupo: GRUPOS.CUSTEIO,
    prefixos: ['3.3.90.36'],
  },
  {
    slug: 'servicos-pj',
    rotulo: 'Serviços de empresas',
    grupo: GRUPOS.CUSTEIO,
    prefixos: ['3.3.90.39', '3.3.93.39'],
  },
  { slug: 'obras', rotulo: 'Obras e instalações', grupo: GRUPOS.INVESTIMENTO, prefixos: ['4.4.90.51', '4.4.93.51'] },
  { slug: 'equipamentos', rotulo: 'Equipamentos', grupo: GRUPOS.INVESTIMENTO, prefixos: ['4.4.90.52', '4.4.93.52'] },
  { slug: 'subvencoes', rotulo: 'Subvenções a entidades', grupo: GRUPOS.CUSTEIO, prefixos: ['3.3.50'] },
  { slug: 'pessoal', rotulo: 'Pessoal', grupo: GRUPOS.PESSOAL, prefixos: ['3.1'] },
  {
    slug: 'encargos',
    rotulo: 'Encargos sociais',
    grupo: GRUPOS.PESSOAL,
    prefixos: ['3.1.91', '3.1.90.13', '3.3.90.47'],
  },
  {
    slug: 'sentencas-judiciais',
    rotulo: 'Sentenças judiciais',
    grupo: GRUPOS.CUSTEIO,
    prefixos: ['3.3.90.91'],
  },
  {
    slug: 'auxilios-pf',
    rotulo: 'Auxílios a pessoas físicas',
    grupo: GRUPOS.CUSTEIO,
    prefixos: ['3.3.90.48'],
  },
  { slug: 'divida', rotulo: 'Dívida pública', grupo: GRUPOS.FINANCEIRO, prefixos: ['3.2', '4.6'] },
  { slug: 'extra-orcamentario', rotulo: 'Extra-orçamentário', grupo: GRUPOS.EXTRA, prefixos: ['8'] },
  // Fallbacks por grupo de natureza — pegam o que os elementos acima não pegam
  { slug: 'outros-custeios', rotulo: 'Outros gastos correntes', grupo: GRUPOS.CUSTEIO, prefixos: ['3.3', '3'] },
  { slug: 'outros-investimentos', rotulo: 'Outros investimentos', grupo: GRUPOS.INVESTIMENTO, prefixos: ['4'] },
];

const CATEGORIA_OUTROS = Object.freeze({ slug: 'outros', rotulo: 'Outros', grupo: GRUPOS.CUSTEIO });

// Índice prefixo → categoria, ordenado do prefixo mais longo pro mais curto.
const INDICE_PREFIXOS = CATEGORIAS.flatMap((cat) =>
  cat.prefixos.map((prefixo) => ({ prefixo, cat }))
).sort((a, b) => b.prefixo.length - a.prefixo.length);

/**
 * "3.3.50.43.00 - SUBVENÇÕES SOCIAIS" → "3.3.50.43" (elemento de despesa).
 */
function extrairCodigo(categoriaEconomica) {
  if (!categoriaEconomica) {return null;}
  const match = String(categoriaEconomica).match(/^\s*(\d+(?:\.\d+)*)/);
  if (!match) {return null;}
  const pares = match[1].split('.');
  const ELEMENTO_PARES = 4;
  return pares.slice(0, ELEMENTO_PARES).join('.');
}

/**
 * @returns {{ slug: string, rotulo: string, grupo: string }}
 */
function classificarCategoria(categoriaEconomica) {
  const codigo = extrairCodigo(categoriaEconomica);
  if (!codigo) {return { ...CATEGORIA_OUTROS };}

  for (const { prefixo, cat } of INDICE_PREFIXOS) {
    if (codigo === prefixo || codigo.startsWith(`${prefixo}.`)) {
      return { slug: cat.slug, rotulo: cat.rotulo, grupo: cat.grupo };
    }
  }
  return { ...CATEGORIA_OUTROS };
}

/**
 * Slug → prefixos de código (usado como dado pelo filtro SQL da lista).
 * @returns {string[]|null}
 */
function slugParaPrefixos(slug) {
  const cat = CATEGORIAS.find((c) => c.slug === slug);
  return cat ? [...cat.prefixos] : null;
}

module.exports = {
  extrairCodigo,
  classificarCategoria,
  slugParaPrefixos,
  CATEGORIAS,
  CATEGORIA_OUTROS,
};
