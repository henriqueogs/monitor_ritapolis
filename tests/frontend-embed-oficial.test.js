'use strict';

const { ehArquivoIncorporavel } = require('../frontend/lib/embed-oficial');
const { buildCsp, OFFICIAL_SOURCE_FRAME_ORIGINS } = require('../frontend/lib/csp');
const { HOST_SGC, ORIGEM_SGC } = require('../frontend/lib/ente');

describe('ehArquivoIncorporavel (preview em iframe só para arquivos oficiais conhecidos)', () => {
  it('aceita arquivo da Prefeitura (PHP genérico e .pdf)', () => {
    expect(
      ehArquivoIncorporavel(
        'https://ritapolis.mg.gov.br/Obter_Arquivo_Cadastro_Generico.php?INT_ARQ=1'
      )
    ).toBe(true);
    expect(ehArquivoIncorporavel('https://www.ritapolis.mg.gov.br/x/edital.pdf')).toBe(true);
  });

  it('aceita download do SGC da Câmara (?Download=N)', () => {
    expect(ehArquivoIncorporavel('https://sgc.ritapolis.mg.leg.br/?Download=80367')).toBe(true);
  });

  it('recusa SGC sem Download numérico (página, não arquivo)', () => {
    expect(ehArquivoIncorporavel('https://sgc.ritapolis.mg.leg.br/')).toBe(false);
    expect(ehArquivoIncorporavel('https://sgc.ritapolis.mg.leg.br/?Download=abc')).toBe(false);
    expect(ehArquivoIncorporavel('https://sgc.ritapolis.mg.leg.br/?pagina=3')).toBe(false);
  });

  it('recusa hosts de terceiros e parecidos', () => {
    expect(ehArquivoIncorporavel('https://evil.example/?Download=1')).toBe(false);
    expect(ehArquivoIncorporavel('https://sgc.ritapolis.mg.leg.br.evil.example/?Download=1')).toBe(
      false
    );
    expect(ehArquivoIncorporavel('https://sapl.ritapolis.mg.leg.br/media/x.pdf')).toBe(false);
  });

  it('recusa entrada inválida', () => {
    expect(ehArquivoIncorporavel('')).toBe(false);
    expect(ehArquivoIncorporavel('não é url')).toBe(false);
    expect(ehArquivoIncorporavel(null)).toBe(false);
  });
});

describe('CSP libera o SGC da Câmara em frame-src e child-src', () => {
  it('origem do SGC está na lista de origens de frame e no cabeçalho', () => {
    expect(ORIGEM_SGC).toBe(`https://${HOST_SGC}`);
    expect(OFFICIAL_SOURCE_FRAME_ORIGINS).toContain(ORIGEM_SGC);
    const csp = buildCsp({ nonce: 'abc' });
    expect(csp).toMatch(new RegExp(`frame-src [^;]*${ORIGEM_SGC.replace(/[.]/g, '[.]')}`));
    expect(csp).toMatch(new RegExp(`child-src [^;]*${ORIGEM_SGC.replace(/[.]/g, '[.]')}`));
  });
});
