'use strict';

const {
  isPalavraReal,
  isNumeroReal,
  linhaTemConteudo,
  limparRuidoOcr,
} = require('./text');

describe('isPalavraReal', () => {
  it('aceita palavras alfabéticas com vogal e 3+ letras', () => {
    expect(isPalavraReal('RESOLUÇÃO')).toBe(true);
    expect(isPalavraReal('Conselho')).toBe(true);
    expect(isPalavraReal('Rua')).toBe(true);
  });

  it('aceita palavra com pontuação só nas bordas', () => {
    expect(isPalavraReal('Almeida,')).toBe(true);
    expect(isPalavraReal('(objeto)')).toBe(true);
  });

  it('aceita palavras com hífen/apóstrofo interno legítimo', () => {
    expect(isPalavraReal('Publique-se')).toBe(true);
    expect(isPalavraReal('Registre-se,')).toBe(true);
    expect(isPalavraReal('cumpra-se.')).toBe(true);
    expect(isPalavraReal("d'água")).toBe(true);
  });

  it('rejeita tokens com símbolos no meio (ruído de OCR)', () => {
    expect(isPalavraReal('tlLL#UL:;Ç')).toBe(false);
    expect(isPalavraReal('&*1Jt!1:t:')).toBe(false);
    expect(isPalavraReal('tYÃw;i{w,#saÀ')).toBe(false);
  });

  it('rejeita sem vogal, curto demais ou com dígitos', () => {
    expect(isPalavraReal('tlLL')).toBe(false); // sem vogal
    expect(isPalavraReal('Mc')).toBe(false); // < 3 letras
    expect(isPalavraReal('0U202s')).toBe(false); // dígitos no meio
  });
});

describe('isNumeroReal', () => {
  it('aceita valores, datas e códigos numéricos', () => {
    expect(isNumeroReal('6.510.000,00')).toBe(true);
    expect(isNumeroReal('15/03/2024')).toBe(true);
    expect(isNumeroReal('36335-000')).toBe(true);
    expect(isNumeroReal('2024')).toBe(true);
  });

  it('rejeita dígitos colados em símbolos de ruído', () => {
    expect(isNumeroReal(':t):11:t::tti')).toBe(false);
    expect(isNumeroReal('&*1Jt')).toBe(false);
    expect(isNumeroReal('7')).toBe(false); // só 1 dígito
  });
});

describe('linhaTemConteudo', () => {
  it('aprova linhas com palavra ou número real', () => {
    expect(linhaTemConteudo('RESOLUÇÃO N. 01/2025')).toBe(true);
    expect(linhaTemConteudo('VALOR: R$ 6.510.000,00')).toBe(true);
    expect(linhaTemConteudo('Rua Miguel Arcanjo de Almeida')).toBe(true);
  });

  it('reprova linhas de ruído de OCR (cabeçalho/brasão)', () => {
    expect(linhaTemConteudo('a,r t B B !4tS r &*1Jt!1:t:')).toBe(false);
    expect(linhaTemConteudo('\\ tlLL#UL:;Ç tYÃw;i{w,#saÀ qÁ&,')).toBe(false);
    expect(linhaTemConteudo('w u*')).toBe(false);
    expect(linhaTemConteudo('Â i u Ç,')).toBe(false);
  });

  it('reprova linha de logo com palavra acidental isolada entre lixo', () => {
    // OCR de brasão: só "VINDO"/"Pac" acidentais entre muito ruído (< 40%)
    expect(linhaTemConteudo('CC KO) Cc Pac Nk VINDO ah. (7 e LB |')).toBe(false);
  });

  it('preserva linhas de fecho com palavras hifenizadas', () => {
    expect(linhaTemConteudo('Registre-se, publique-se e cumpra-se.')).toBe(true);
    expect(linhaTemConteudo('Publique-se.')).toBe(true);
  });
});

describe('limparRuidoOcr', () => {
  it('remove as linhas-lixo do cabeçalho OCR e preserva o conteúdo', () => {
    const texto = [
      'a,r t B',
      '',
      'B !4tS r &*1Jt!1:t: ! :t):11:t::tti:i t: t:t ttt:::',
      '',
      '\\ tlLL#UL:;Ç tYÃw;i{w,#saÀ qÁ&,',
      'w u*',
      'Â',
      'Rua Miguel Arcanjo de Almeida, s/no - Cássia',
      'RESOLUÇÃO N. 01/2025',
      'O Conselho Municipal dos Direitos da Criança e do Adolescente.',
    ].join('\n');

    const r = limparRuidoOcr(texto);

    expect(r).not.toMatch(/!4tS|&\*1Jt|tlLL#UL|tYÃw/);
    expect(r).toMatch(/Rua Miguel Arcanjo de Almeida/);
    expect(r).toMatch(/RESOLUÇÃO N\. 01\/2025/);
    expect(r.startsWith('Rua Miguel Arcanjo')).toBe(true);
  });

  it('preserva linhas com valores monetários e datas', () => {
    const texto = '&*1Jt! :t): ttt:::\nVALOR ESTIMADO: R$ 6.510.000,00\nDATA: 15/03/2024';
    const r = limparRuidoOcr(texto);
    expect(r).toMatch(/R\$ 6\.510\.000,00/);
    expect(r).toMatch(/15\/03\/2024/);
    expect(r).not.toMatch(/&\*1Jt/);
  });

  it('não altera texto já limpo (a menos de espaços nas bordas)', () => {
    const texto = 'Contratação de empresa para fornecimento de combustível.';
    expect(limparRuidoOcr(texto)).toBe(texto);
  });

  it('retorna string vazia para entrada vazia/nula', () => {
    expect(limparRuidoOcr('')).toBe('');
    expect(limparRuidoOcr(null)).toBe('');
    expect(limparRuidoOcr(undefined)).toBe('');
  });

  it('colapsa múltiplas linhas em branco resultantes', () => {
    const texto = 'Texto real aqui.\n!4tS\n&*1Jt\n:t::\nMais texto real depois.';
    const r = limparRuidoOcr(texto);
    expect(r).not.toMatch(/\n{3,}/);
    expect(r).toMatch(/Texto real aqui/);
    expect(r).toMatch(/Mais texto real depois/);
  });
});
