'use strict';

const { parsePreviewTarget } = require('../infrastructure/production-heartbeat/src/preview-target');
const { ehArquivoIncorporavel } = require('../frontend/lib/embed-oficial');

describe('parsePreviewTarget (Worker /preview)', () => {
  it('aceita arquivo da Prefeitura (PHP genérico e .pdf)', () => {
    expect(
      parsePreviewTarget(
        'https://ritapolis.mg.gov.br/obter_arquivo_cadastro_generico.php?INT_ARQ=1'
      )
    ).toBeInstanceOf(URL);
    expect(parsePreviewTarget('https://www.ritapolis.mg.gov.br/x/edital.pdf')).toBeInstanceOf(URL);
  });

  it('aceita download do SGC da Câmara (?Download=N)', () => {
    const target = parsePreviewTarget('https://sgc.ritapolis.mg.leg.br/?Download=80367');
    expect(target?.toString()).toBe('https://sgc.ritapolis.mg.leg.br/?Download=80367');
  });

  it('recusa SGC sem Download numérico, por http ou em host parecido', () => {
    expect(parsePreviewTarget('https://sgc.ritapolis.mg.leg.br/')).toBeNull();
    expect(parsePreviewTarget('https://sgc.ritapolis.mg.leg.br/?Download=abc')).toBeNull();
    expect(parsePreviewTarget('http://sgc.ritapolis.mg.leg.br/?Download=80367')).toBeNull();
    expect(
      parsePreviewTarget('https://sgc.ritapolis.mg.leg.br.evil.example/?Download=1')
    ).toBeNull();
  });

  it('recusa SAPL, outras origens e URL inválida', () => {
    expect(parsePreviewTarget('https://sapl.ritapolis.mg.leg.br/media/x.pdf')).toBeNull();
    expect(parsePreviewTarget('https://example.com/x.pdf')).toBeNull();
    expect(parsePreviewTarget('não é url')).toBeNull();
    expect(parsePreviewTarget(null)).toBeNull();
  });

  it('libera no Worker tudo o que o frontend manda incorporar', () => {
    const urls = [
      'https://ritapolis.mg.gov.br/obter_arquivo_cadastro_generico.php?INT_ARQ=1',
      'https://sgc.ritapolis.mg.leg.br/?Download=80367',
    ];
    for (const url of urls) {
      expect(ehArquivoIncorporavel(url)).toBe(true);
      expect(parsePreviewTarget(url)).not.toBeNull();
    }
  });
});
