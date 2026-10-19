'use strict';

const { mapearDocumento, mapearAnexo, TEXTO_MINIMO } = require('./fontes-indexacao');

const docBase = {
  id: 12,
  fonte: 'site_prefeitura',
  tipo: 'edital',
  numero: 'PP-001/2025',
  ano: 2025,
  titulo: 'Pregão eletrônico para merenda',
  texto_completo: 'Objeto: aquisição de gêneros alimentícios. '.repeat(5),
  url_origem: 'https://prefeitura.example/licitacoes',
  url_pdf: 'https://prefeitura.example/arquivos/edital.pdf',
  data_publicacao: '2025-03-10',
};

describe('mapearDocumento', () => {
  it('docId prefixado, origem = arquivo (pdf), metadados de filtro e texto com identificação', () => {
    const m = mapearDocumento(docBase);

    expect(m.docId).toBe('documento:12');
    expect(m.url_origem).toBe('https://prefeitura.example/arquivos/edital.pdf');
    expect(m.origemGenerica).toBe(false);
    expect(m.metadados).toMatchObject({
      ano: 2025,
      tipo: 'edital',
      fonte: 'site_prefeitura',
      documento_id: 12,
    });
    expect(m.texto).toContain('Pregão eletrônico para merenda');
    expect(m.texto).toContain('PP-001/2025');
    expect(m.texto).toContain('aquisição de gêneros alimentícios');
  });

  it('sem arquivo próprio, a origem é a listagem oficial e é marcada como genérica (§11.3)', () => {
    const m = mapearDocumento({ ...docBase, url_pdf: null });

    expect(m.url_origem).toBe('https://prefeitura.example/licitacoes');
    expect(m.origemGenerica).toBe(true);
  });

  it('texto vazio ou curto demais não é indexável (devolve null)', () => {
    expect(mapearDocumento({ ...docBase, texto_completo: '' })).toBeNull();
    expect(
      mapearDocumento({ ...docBase, texto_completo: 'x'.repeat(TEXTO_MINIMO - 1) })
    ).toBeNull();
  });

  it('sem nenhuma URL de origem não indexa (nunca sem fonte)', () => {
    expect(mapearDocumento({ ...docBase, url_pdf: null, url_origem: '' })).toBeNull();
  });

  it('mascara CPF no texto indexado', () => {
    const m = mapearDocumento({
      ...docBase,
      texto_completo: `${docBase.texto_completo} Responsável CPF 123.456.789-09.`,
    });

    expect(m.texto).not.toMatch(/123\.456\.789-09/);
  });

  it('metadados sem ano ficam sem a chave ano (não inventa período)', () => {
    const m = mapearDocumento({ ...docBase, ano: null });

    expect(m.metadados).not.toHaveProperty('ano');
  });
});

describe('mapearAnexo', () => {
  const anexo = {
    id: 55,
    documento_id: 12,
    nome: 'Termo de Referência.pdf',
    tipo: 'termo_referencia',
    url: 'https://prefeitura.example/arquivos/tr.pdf',
    texto_completo: 'Especificações técnicas dos itens. '.repeat(5),
    doc_ano: 2025,
    doc_tipo: 'edital',
    doc_fonte: 'site_prefeitura',
    doc_titulo: 'Pregão eletrônico para merenda',
  };

  it('docId de anexo, origem = URL do arquivo, filtros herdados do documento pai', () => {
    const m = mapearAnexo(anexo);

    expect(m.docId).toBe('anexo:55');
    expect(m.url_origem).toBe('https://prefeitura.example/arquivos/tr.pdf');
    expect(m.origemGenerica).toBe(false);
    expect(m.metadados).toMatchObject({
      ano: 2025,
      tipo: 'edital',
      fonte: 'site_prefeitura',
      documento_id: 12,
      anexo_id: 55,
    });
    expect(m.texto).toContain('Termo de Referência.pdf');
    expect(m.texto).toContain('Pregão eletrônico para merenda');
  });

  it('anexo sem texto ou sem URL não é indexável', () => {
    expect(mapearAnexo({ ...anexo, texto_completo: '' })).toBeNull();
    expect(mapearAnexo({ ...anexo, url: '' })).toBeNull();
  });
});
