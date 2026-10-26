'use strict';

const { normalizar, quantizarInt8, desquantizar, cosseno, cossenoInt8 } = require('./quantizacao');

function aleatorio(dims, semente) {
  // PRNG determinístico (mulberry32) para testes reprodutíveis
  let s = semente;
  const v = new Float32Array(dims);
  for (let i = 0; i < dims; i += 1) {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    v[i] = (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  }
  return v;
}

describe('quantizacao int8', () => {
  it('normalizar devolve vetor unitário e não muta a entrada', () => {
    const entrada = Float32Array.from([3, 4]);

    const n = normalizar(entrada);

    expect(Math.hypot(...n)).toBeCloseTo(1, 6);
    expect(Array.from(entrada)).toEqual([3, 4]);
  });

  it('normalizar tolera vetor zero (não gera NaN)', () => {
    expect(Array.from(normalizar(new Float32Array(4)))).toEqual([0, 0, 0, 0]);
  });

  it('ida e volta mantém o erro por componente abaixo de meio degrau', () => {
    const v = normalizar(aleatorio(2048, 1));

    const q = quantizarInt8(v);
    const volta = desquantizar(q);

    expect(q.dados).toBeInstanceOf(Int8Array);
    const erroMax = Math.max(...Array.from(v, (x, i) => Math.abs(x - volta[i])));
    expect(erroMax).toBeLessThanOrEqual(q.escala / 2 + 1e-7);
  });

  it('usa a faixa inteira: o maior componente vira ±127', () => {
    const q = quantizarInt8(normalizar(aleatorio(256, 2)));

    expect(Math.max(...Array.from(q.dados, Math.abs))).toBe(127);
  });

  it('vetor zero quantiza sem dividir por zero', () => {
    const q = quantizarInt8(new Float32Array(8));

    expect(Array.from(q.dados)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(Number.isFinite(q.escala)).toBe(true);
  });

  it('cosseno int8 aproxima o float32 (erro < 0,01) em 2048 dimensões', () => {
    const a = normalizar(aleatorio(2048, 3));
    const b = normalizar(aleatorio(2048, 4));

    const exato = cosseno(a, b);
    const aprox = cossenoInt8(quantizarInt8(a), quantizarInt8(b));

    expect(Math.abs(exato - aprox)).toBeLessThan(0.01);
  });

  it('cosseno int8 preserva a ordem dos vizinhos (top-1 igual ao float32)', () => {
    const consulta = normalizar(aleatorio(512, 10));
    const candidatos = Array.from({ length: 200 }, (_, i) => normalizar(aleatorio(512, 100 + i)));
    candidatos[137] = normalizar(
      Float32Array.from(consulta, (x, i) => x + aleatorio(512, 999)[i] * 0.1)
    );

    const melhorExato = candidatos
      .map(c => cosseno(consulta, c))
      .reduce((m, s, i, arr) => (s > arr[m] ? i : m), 0);
    const qConsulta = quantizarInt8(consulta);
    const melhorInt8 = candidatos
      .map(c => cossenoInt8(qConsulta, quantizarInt8(c)))
      .reduce((m, s, i, arr) => (s > arr[m] ? i : m), 0);

    expect(melhorExato).toBe(137);
    expect(melhorInt8).toBe(melhorExato);
  });

  it('int8 ocupa 1 byte por dimensão (4× menos que float32)', () => {
    const q = quantizarInt8(normalizar(aleatorio(2048, 5)));

    expect(q.dados.byteLength).toBe(2048);
    expect(q.dados.byteLength).toBe(new Float32Array(2048).byteLength / 4);
  });
});
