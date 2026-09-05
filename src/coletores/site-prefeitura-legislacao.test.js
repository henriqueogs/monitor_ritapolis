'use strict';

const {
  parseRegistrosLeis,
  parseLinhaMetadados,
  normalizarTipo,
  extrairDataDoNomeArquivo,
  getTotalItens,
} = require('./site-prefeitura-legislacao');

// Fragmento real devolvido por ws_consulta/wsBuscarLeis.php (captado ao vivo
// em 05/09/2026, filtro EXR_LEI_INI=2025). Tabela mal-formada de propósito —
// é assim que a fonte manda; o cheerio corrige a árvore igual um navegador.
const FRAGMENTO_LEIS = `
<TABLE id='paginador_cadastro_generico'>
<TR><TD colspan='3' style='text-align:center'>730 itens encontrados para a busca informada sendo 260 decretos, 52 leis ordinárias, 11 leis complementares, 407 portarias.<BR><BR></TD></TR>
</TABLE><TABLE class='listbox_cinza'>
<TR><TH>Tipo</TH><TH>Autor(es)</TH><TH>Assunto / Ementa</TH><TH>&nbsp;</TH></TR>
<TR style='background-color: #DDD' ><TD>Portaria&nbsp;n&ordm;&nbsp;432&nbsp;&nbsp;2025</TD>
  <TD>EXECUTIVO&nbsp;MUNICIPAL&nbsp;</TD>
  <TD>CONCEDE F&Eacute;RIAS REGULAMENTARES AO SERVIDOR P&Uacute;BLICO MUNICIPAL</TD><TD>&nbsp;</TD>
<TR style='background-color: #DDD' ><TD colspan='5' style='text-align:center'><a class='cliqueaqui' target='_blank' href='/Salvar_arquivo_Leis.php?INT_ARQ=132849'>PORTARIA 432 DE 05 DE JANEIRO DE 2026.pdf</a><BR></TD></TR>
<TR ><TD>Decreto&nbsp;n&ordm;&nbsp;370&nbsp;&nbsp;2025</TD>
  <TD>EXECUTIVO&nbsp;MUNICIPAL&nbsp;</TD>
  <TD>DISP&Otilde;E SOBRE A PROIBI&Ccedil;&Atilde;O DA VENDA DE BEBIDAS EM VIDRO.</TD><TD>&nbsp;</TD>
<TR ><TD colspan='5' style='text-align:center'><a class='cliqueaqui' target='_blank' href='/Salvar_arquivo_Leis.php?INT_ARQ=132000'>DECRETO 370 DE 20 DE DEZEMBRO DE 2025.pdf</a><BR></TD></TR>
</TABLE>`;

describe('site-prefeitura-legislacao · parseLinhaMetadados', () => {
  it('extrai tipo, numero e exercicio de "Tipo nº NUM   ANO"', () => {
    const r = parseLinhaMetadados(['Portaria nº 432 2025', 'EXECUTIVO MUNICIPAL', 'Ementa aqui', '']);
    expect(r).toEqual({ tipoLabel: 'Portaria', numero: '432', exercicio: 2025, autor: 'EXECUTIVO MUNICIPAL', ementa: 'Ementa aqui' });
  });

  it('retorna null pra linha que nao bate no formato (cabecalho/paginacao)', () => {
    expect(parseLinhaMetadados(['', 'Página 1 2 3', 'Ir para página 2'])).toBeNull();
    expect(parseLinhaMetadados(['Tipo', 'Autor(es)', 'Assunto / Ementa'])).toBeNull();
  });
});

describe('site-prefeitura-legislacao · normalizarTipo', () => {
  it('mapeia rotulos conhecidos pro tipo normalizado', () => {
    expect(normalizarTipo('Portaria')).toBe('portaria');
    expect(normalizarTipo('Decreto')).toBe('decreto');
    expect(normalizarTipo('Lei Complementar')).toBe('lei_complementar');
    expect(normalizarTipo('Lei Ordinária')).toBe('lei_ordinaria');
  });

  it('cai em documento_publico pra rotulo desconhecido', () => {
    expect(normalizarTipo('Algo Nunca Visto')).toBe('documento_publico');
  });
});

describe('site-prefeitura-legislacao · extrairDataDoNomeArquivo', () => {
  it('converte "DD DE MES DE YYYY" pra ISO', () => {
    expect(extrairDataDoNomeArquivo('PORTARIA 432 DE 05 DE JANEIRO DE 2026.pdf')).toBe('2026-01-05');
    expect(extrairDataDoNomeArquivo('DECRETO 370 DE 20 DE DEZEMBRO DE 2025.pdf')).toBe('2025-12-20');
  });

  it('retorna null pra nome sem data reconhecivel', () => {
    expect(extrairDataDoNomeArquivo('arquivo.pdf')).toBeNull();
    expect(extrairDataDoNomeArquivo(null)).toBeNull();
  });
});

describe('site-prefeitura-legislacao · getTotalItens', () => {
  it('le o total de "N itens encontrados"', () => {
    expect(getTotalItens(FRAGMENTO_LEIS)).toBe(730);
  });
});

describe('site-prefeitura-legislacao · parseRegistrosLeis (fragmento real)', () => {
  it('extrai os 2 registros com tipo, numero, anexo e data', () => {
    const registros = parseRegistrosLeis(FRAGMENTO_LEIS);
    expect(registros).toHaveLength(2);

    expect(registros[0]).toMatchObject({
      tipoLabel: 'Portaria',
      numero: '432',
      exercicio: 2025,
      tipo: 'portaria',
      anexoUrl: 'https://ritapolis.mg.gov.br/Salvar_arquivo_Leis.php?INT_ARQ=132849',
      dataPublicacao: '2026-01-05',
    });

    expect(registros[1]).toMatchObject({
      tipoLabel: 'Decreto',
      numero: '370',
      exercicio: 2025,
      tipo: 'decreto',
      anexoUrl: 'https://ritapolis.mg.gov.br/Salvar_arquivo_Leis.php?INT_ARQ=132000',
      dataPublicacao: '2025-12-20',
    });
  });

  it('sem itens, retorna lista vazia (nao quebra no cabecalho/paginacao)', () => {
    expect(parseRegistrosLeis('<TABLE><TR><TD>0 itens encontrados</TD></TR></TABLE>')).toEqual([]);
  });
});
