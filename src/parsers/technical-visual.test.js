'use strict';

const {
  STATUS_TECNICO_VISUAL,
  classificarArquivoTecnicoVisual
} = require('./technical-visual');

function repetirLinhas(linhas, vezes = 8) {
  return Array.from({ length: vezes }, () => linhas.join('\n')).join('\n');
}

describe('parsers/technical-visual', () => {
  it('classifica prancha arquitetonica com rotulos soltos como tecnico visual', () => {
    const texto = repetirLinhas([
      'PLANTA BAIXA PAVIMENTO TERREO',
      'CORTE BB',
      'ESCALA 1:50',
      'P1 J5',
      'SALA DE ATENDIMENTO',
      'DETALHE COBERTURA',
      'FACHADA FRONTAL'
    ]);

    const resultado = classificarArquivoTecnicoVisual({
      nome: '02_BAS_ARQ_projeto_arquitetonico.pdf',
      texto
    });

    expect(resultado.visual).toBe(true);
    expect(resultado.status).toBe(STATUS_TECNICO_VISUAL);
    expect(resultado.sinais).toContain('nome_prancha');
  });

  it('classifica mapa/topografia cheio de coordenadas como tecnico visual', () => {
    const texto = repetirLinhas([
      'PERFIL LONGITUDINAL',
      'CURVA DE NIVEL',
      'RUA JOSE FERREIRA',
      'X 755.20',
      'Y 432.19',
      'ESTACA 0+20',
      'ESCALA 1:100'
    ], 12);

    const resultado = classificarArquivoTecnicoVisual({
      nome: '01_03_BAS_TRP_topografia.pdf',
      texto
    });

    expect(resultado.visual).toBe(true);
    expect(resultado.status).toBe(STATUS_TECNICO_VISUAL);
  });

  it('nao classifica memorial descritivo em prosa como tecnico visual', () => {
    const texto = repetirLinhas([
      'O presente memorial descritivo estabelece as condicoes tecnicas para execucao da obra.',
      'A contratada devera observar as normas aplicaveis, manter a seguranca do canteiro e apresentar os documentos exigidos.',
      'Os servicos serao medidos conforme etapas concluidas e aprovadas pela fiscalizacao municipal.'
    ], 15);

    const resultado = classificarArquivoTecnicoVisual({
      nome: 'memorial_descritivo_construcao.pdf',
      texto
    });

    expect(resultado.visual).toBe(false);
  });

  it('nao classifica planilha xls como tecnico visual', () => {
    const resultado = classificarArquivoTecnicoVisual({
      nome: 'planilha_orcamentaria.xls',
      texto: 'item descricao quantidade valor total'
    });

    expect(resultado.visual).toBe(false);
    expect(resultado.motivo).toBe('formato_texto_estruturado');
  });
});
