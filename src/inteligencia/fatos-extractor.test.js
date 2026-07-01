'use strict';

const { extrairFatosTexto, resumirAnexoLocal } = require('./fatos-extractor');

describe('fatos-extractor', () => {
  it('extrai quantidade de supressão de árvores no texto', () => {
    const documento = { id: 12, ano: 2026, titulo: 'Supressão de árvores', data_publicacao: '2026-02-10' };
    const fatos = extrairFatosTexto({
      documento,
      texto: 'Contratação para prestação de serviços de supressão de 10 árvores em vias públicas.',
      origem: 'teste',
    });

    expect(fatos).toEqual(expect.arrayContaining([
      expect.objectContaining({
        documento_id: 12,
        tipo: 'meio_ambiente',
        subtipo: 'supressao_arvores',
        quantidade: 10,
        unidade: 'arvores',
      }),
    ]));
  });

  it('gera resumo local de anexo com aviso e fatos relevantes', () => {
    const anexo = {
      id: 1,
      nome: 'Termo de referência.pdf',
      tipo: 'termo_referencia',
      status_extracao: 'ok',
      texto_completo: 'Termo de referência para supressão de 10 árvores localizadas em área urbana.',
      paginas: 2,
    };
    const resumo = resumirAnexoLocal({
      anexo,
      fatos: [{ tipo: 'meio_ambiente', subtipo: 'supressao_arvores', descricao: '10 árvores', quantidade: 10, unidade: 'arvores' }],
    });

    expect(resumo.aviso).toMatch(/automático/);
    expect(resumo.pontos_relevantes[0]).toEqual(expect.objectContaining({ quantidade: 10 }));
    expect(resumo.confianca).toBeGreaterThan(0.7);
  });
});
