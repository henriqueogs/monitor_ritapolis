'use strict';

/**
 * Fase 3, passo 3 (docs/MAPA_GENERICO_VS_RITAPOLIS.md): os pontos CENTRAIS do frontend (metadados de
 * página, layout, disclaimers, marca e links de fonte) lêem a identidade do município de
 * frontend/lib/ente.js. Os textos renderizados com o ente padrão não mudam (testes "dourados" abaixo);
 * trocar o ente muda os textos; e a guarda impede que o nome da cidade volte a ser escrito à mão
 * nesses arquivos. Textos de página (títulos de seções, SEO de cada tela) ficam para depois.
 */

const fs = require('fs');
const path = require('path');
const ente = require('../frontend/lib/ente');
const {
  PUBLIC_PAGES,
  publicPages,
  buildContentMetadata,
  buildPageMetadata,
} = require('../frontend/lib/page-metadata');
const { textosDoSite } = require('../frontend/lib/site-metadata');

const RAIZ = path.resolve(__dirname, '..');

const OUTRO = {
  nome: 'Cidade Exemplo',
  nomeChave: 'cidade exemplo',
  uf: 'SP',
  ufNome: 'São Paulo',
  marca: 'Exemplo.com',
};

describe('frontend/lib/ente.js: valores e derivados do ente padrão', () => {
  it('nome, UF, marca e domínios de Ritápolis', () => {
    expect(ente).toMatchObject({
      NOME: 'Ritápolis',
      UF: 'MG',
      UF_NOME: 'Minas Gerais',
      MARCA: 'Ritápolis.com',
      DOMINIO_SITE: 'ritapolis.com',
      SITE_URL: 'https://ritapolis.com',
      DOMINIO_PREFEITURA: 'ritapolis.mg.gov.br',
      DOMINIO_CAMARA: 'ritapolis.mg.leg.br',
      NOME_CHAVE: 'ritapolis',
    });
  });

  it('hosts da Prefeitura incluem o domínio e o www', () => {
    expect(ente.HOSTS_PREFEITURA).toEqual(['ritapolis.mg.gov.br', 'www.ritapolis.mg.gov.br']);
  });

  it('o objeto ente agrupa os mesmos valores (usado para parametrizar os textos)', () => {
    expect(ente.ente).toMatchObject({
      nome: 'Ritápolis',
      uf: 'MG',
      ufNome: 'Minas Gerais',
      marca: 'Ritápolis.com',
      nomeChave: 'ritapolis',
    });
  });
});

describe('metadados de página: texto idêntico com o ente padrão (dourado)', () => {
  it('as 6 páginas públicas', () => {
    expect(PUBLIC_PAGES).toEqual({
      '/': {
        title: 'Ritápolis, MG: gastos públicos, licitações e leis',
        description:
          'Consulte gastos públicos, licitações, leis e documentos de Ritápolis, Minas Gerais. Projeto independente, com links para as fontes oficiais.',
      },
      '/licitacoes': {
        title: 'Licitações de Ritápolis, MG: editais e contratos',
        description:
          'Pesquise licitações de Ritápolis, consulte editais e contratos e acompanhe documentos dos processos com acesso à fonte oficial.',
      },
      '/transparencia': {
        title: 'Gastos públicos de Ritápolis, MG',
        description:
          'Acompanhe despesas, empenhos e pagamentos de Ritápolis por período. Consulte fornecedores e confira os dados nas fontes oficiais.',
      },
      '/legislacao': {
        title: 'Legislação de Ritápolis, MG: leis e decretos',
        description:
          'Pesquise leis, decretos, portarias e documentos da legislação municipal de Ritápolis, com links para as publicações oficiais.',
      },
      '/sobre': {
        title: 'Sobre o Ritápolis.com: transparência municipal',
        description:
          'Conheça o projeto independente Ritápolis.com, suas fontes de dados públicos, metodologia e limites da organização de documentos com IA.',
      },
      '/analises': {
        title: 'Análises e resumos da Prefeitura e Câmara de Ritápolis',
        description:
          'Leia análises e resumos dos documentos da Prefeitura e Câmara Municipal de Ritápolis. Confira os dados, as fontes oficiais e os limites de cada leitura.',
      },
    });
  });

  it('metadado de conteúdo: acrescenta a cidade ao título e usa o resumo padrão', () => {
    const m = buildContentMetadata(
      { path: '/documento/1', title: 'Decreto 3/2025', description: '' },
      { siteUrl: 'https://ritapolis.com', brand: 'Ritápolis.com' }
    );

    expect(m.title.absolute).toBe('Decreto 3/2025 — Ritápolis, MG — Ritápolis.com');
    expect(m.description).toBe('Decreto 3/2025');
    const vazio = buildContentMetadata(
      { path: '/documento/2', title: '', description: '' },
      { siteUrl: 'https://ritapolis.com', brand: 'Ritápolis.com' }
    );
    expect(vazio.description).toBe('Documento público de Ritápolis, com acesso à fonte oficial.');
  });

  it('título que já cita a cidade (com ou sem acento) não repete o sufixo', () => {
    const m = buildContentMetadata(
      { path: '/documento/3', title: 'Lei de Ritapolis sobre X', description: 'd' },
      { siteUrl: 'https://ritapolis.com', brand: 'Ritápolis.com' }
    );

    expect(m.title.absolute).toBe('Lei de Ritapolis sobre X — Ritápolis.com');
  });
});

describe('metadados de página: o ente parametriza os textos', () => {
  it('publicPages(outro ente) não cita Ritápolis e usa cidade/UF/marca do outro', () => {
    const paginas = publicPages(OUTRO);
    const todos = JSON.stringify(paginas);

    expect(todos).not.toMatch(/rit[aá]polis/i);
    expect(paginas['/'].title).toBe('Cidade Exemplo, SP: gastos públicos, licitações e leis');
    expect(paginas['/'].description).toContain('Cidade Exemplo, São Paulo');
    expect(paginas['/sobre'].title).toBe('Sobre o Exemplo.com: transparência municipal');
  });

  it('buildContentMetadata com outro ente: sufixo e resumo padrão do outro município', () => {
    const m = buildContentMetadata(
      { path: '/documento/9', title: 'Decreto 1', description: '' },
      { siteUrl: 'https://exemplo.com', brand: 'Exemplo.com' },
      OUTRO
    );
    const vazio = buildContentMetadata(
      { path: '/documento/10', title: '', description: '' },
      { siteUrl: 'https://exemplo.com', brand: 'Exemplo.com' },
      OUTRO
    );

    expect(m.title.absolute).toBe('Decreto 1 — Cidade Exemplo, SP — Exemplo.com');
    expect(vazio.description).toBe(
      'Documento público de Cidade Exemplo, com acesso à fonte oficial.'
    );
  });

  it('buildPageMetadata continua funcionando para as páginas do ente padrão', () => {
    const m = buildPageMetadata('/licitacoes', {
      siteUrl: 'https://ritapolis.com',
      brand: 'Ritápolis.com',
    });

    expect(m.title.absolute).toBe(
      'Licitações de Ritápolis, MG: editais e contratos — Ritápolis.com'
    );
  });
});

describe('textos do layout (textosDoSite)', () => {
  it('ente padrão: textos idênticos aos do layout anterior (dourado)', () => {
    expect(textosDoSite()).toEqual({
      descricao:
        'Licitações, gastos, empenhos e documentos oficiais de Ritápolis, Minas Gerais — organizados com IA e sempre com link pra fonte oficial.',
      descricaoOpenGraph:
        'Licitações, gastos, empenhos e documentos oficiais de Ritápolis/MG, com fonte em cada dado.',
      descricaoJsonLd: 'A cidade de Ritápolis/MG em dados abertos.',
      nomeAlternativo: 'Ritápolis',
    });
  });

  it('outro ente muda tudo e não cita Ritápolis', () => {
    const t = textosDoSite(OUTRO);

    expect(JSON.stringify(t)).not.toMatch(/rit[aá]polis/i);
    expect(t.descricaoJsonLd).toBe('A cidade de Cidade Exemplo/SP em dados abertos.');
    expect(t.nomeAlternativo).toBe('Cidade Exemplo');
  });
});

describe('guarda: o nome da cidade não é escrito à mão nos pontos centrais', () => {
  const CENTRAIS = [
    'frontend/lib/page-metadata.js',
    'frontend/lib/site-metadata.js',
    'frontend/app/layout.js',
    'frontend/app/lib/disclaimer.js',
    'frontend/app/lib/brand.js',
    'frontend/app/lib/source-links.js',
  ];
  const NOME = /rit(a|á)polis/i;

  it.each(CENTRAIS)('%s não contém o nome da cidade nem domínios dela', arquivo => {
    const conteudo = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
    const linhas = conteudo
      .split('\n')
      .map((texto, i) => ({ texto, n: i + 1 }))
      .filter(l => NOME.test(l.texto));

    expect(linhas.map(l => `${arquivo}:${l.n}: ${l.texto.trim().slice(0, 80)}`)).toEqual([]);
  });

  it('frontend/lib/ente.js é o lugar do nome (a guarda não está olhando o arquivo errado)', () => {
    const conteudo = fs.readFileSync(path.join(RAIZ, 'frontend/lib/ente.js'), 'utf8');

    expect(NOME.test(conteudo)).toBe(true);
  });
});
