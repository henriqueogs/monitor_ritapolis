'use strict';

const { extrairObjetoJson, RespostaNaoJsonError } = require('./json-resposta');

describe('extrairObjetoJson', () => {
  it('interpreta JSON puro', () => {
    expect(extrairObjetoJson('{"resumo":"ok","n":2}')).toEqual({ resumo: 'ok', n: 2 });
  });

  it('remove cerca de código markdown', () => {
    expect(extrairObjetoJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extrairObjetoJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('extrai o objeto quando o modelo escreve texto antes e depois', () => {
    expect(extrairObjetoJson('Claro! Segue:\n{"a":{"b":2}}\nEspero ter ajudado.')).toEqual({
      a: { b: 2 },
    });
  });

  it('chaves dentro de strings não confundem a extração', () => {
    expect(extrairObjetoJson('texto {"fala":"use { e } com cuidado"} fim')).toEqual({
      fala: 'use { e } com cuidado',
    });
  });

  it.each([['texto sem json'], [''], ['{"quebrado": '], ['[1,2,3]'], ['"string solta"']])(
    'rejeita com RespostaNaoJsonError: %j',
    entrada => {
      expect(() => extrairObjetoJson(entrada)).toThrow(RespostaNaoJsonError);
    }
  );

  it('o erro traz um trecho da resposta para diagnóstico, sem despejar tudo', () => {
    const longa = 'x'.repeat(5000);

    try {
      extrairObjetoJson(longa);
      throw new Error('deveria ter lançado');
    } catch (erro) {
      expect(erro).toBeInstanceOf(RespostaNaoJsonError);
      expect(erro.trecho.length).toBeLessThanOrEqual(200);
    }
  });

  it('rejeita entrada que não é texto', () => {
    expect(() => extrairObjetoJson(undefined)).toThrow(RespostaNaoJsonError);
    expect(() => extrairObjetoJson(null)).toThrow(RespostaNaoJsonError);
  });
});

describe('extrairObjetoJson: robustez herdada da produção', () => {
  it('repara escapes inválidos que o modelo gera (R\\$, 50\\%) sem quebrar escapes válidos', () => {
    expect(extrairObjetoJson('{"valor":"R\\$ 10","pct":"50\\%"}')).toEqual({
      valor: 'R$ 10',
      pct: '50%',
    });
    expect(extrairObjetoJson('{"a":"linha1\\nlinha2","b":"aspas \\" ok"}')).toEqual({
      a: 'linha1\nlinha2',
      b: 'aspas " ok',
    });
  });

  it('cerca markdown sem JSON dentro cai para o texto inteiro', () => {
    expect(extrairObjetoJson('Exemplo:\n```js\nconst x = 1;\n```\n{"a":1}')).toEqual({ a: 1 });
  });

  it('com dois objetos na resposta devolve o primeiro', () => {
    expect(extrairObjetoJson('{"a":1} e depois {"b":2}')).toEqual({ a: 1 });
  });
});
