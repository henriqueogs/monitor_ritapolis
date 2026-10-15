'use strict';

/**
 * Contrato da porta EmbeddingProvider. Roda contra qualquer implementação
 * (fake determinístico, adaptador NVIDIA com cliente simulado, outro provedor).
 * Usa as globais do Jest: chame de dentro de um arquivo *.test.js.
 *
 * embed(textos, { tipo: 'passage' | 'query' }) → Promise<number[][]>
 * Propriedades: model (string), dims (inteiro > 0).
 */

const { ModeloIndisponivelError, ProviderLimiteError } = require('../errors');
const { verificarModelo } = require('../embedding-provider');

const LOTE_GRANDE = 300; // maior que qualquer limite de lote razoável

/**
 * @param {string} nome
 * @param {{ criar: Function, criarMorto?: Function, criarLimitado?: Function }} fabricas
 */
function runEmbeddingProviderContract(nome, { criar, criarMorto, criarLimitado }) {
  describe(`contrato EmbeddingProvider: ${nome}`, () => {
    it('expõe model (string) e dims (inteiro positivo)', () => {
      const p = criar();

      expect(typeof p.model).toBe('string');
      expect(Number.isInteger(p.dims) && p.dims > 0).toBe(true);
    });

    it('lista vazia devolve lista vazia', async () => {
      expect(await criar().embed([])).toEqual([]);
    });

    it('devolve um vetor por texto, na ordem, todos com dims componentes', async () => {
      const p = criar();

      const r = await p.embed(['licitação de merenda', 'decreto de feriado']);

      expect(r).toHaveLength(2);
      for (const v of r) {expect(v).toHaveLength(p.dims);}
      expect(r[0]).not.toEqual(r[1]);
    });

    it('é determinístico e preserva a ordem (embed em lote == embed individual)', async () => {
      const p = criar();

      const lote = await p.embed(['primeiro texto', 'segundo texto']);
      const a = await p.embed(['primeiro texto']);
      const b = await p.embed(['segundo texto']);

      expect(lote[0]).toEqual(a[0]);
      expect(lote[1]).toEqual(b[0]);
    });

    it(`aceita mais de ${LOTE_GRANDE} textos de uma vez, sem perder nem trocar a ordem`, async () => {
      const p = criar();
      const textos = Array.from({ length: LOTE_GRANDE }, (_, i) => `texto numero ${i} sobre pregao ${i * 7}`);

      const r = await p.embed(textos);
      const primeiro = await p.embed([textos[0]]);
      const ultimo = await p.embed([textos[LOTE_GRANDE - 1]]);

      expect(r).toHaveLength(LOTE_GRANDE);
      expect(r[0]).toEqual(primeiro[0]);
      expect(r[LOTE_GRANDE - 1]).toEqual(ultimo[0]);
    });

    it('aceita os tipos query e passage e rejeita tipo desconhecido', async () => {
      const p = criar();

      await expect(p.embed(['x'], { tipo: 'query' })).resolves.toHaveLength(1);
      await expect(p.embed(['x'], { tipo: 'passage' })).resolves.toHaveLength(1);
      await expect(p.embed(['x'], { tipo: 'banana' })).rejects.toBeInstanceOf(TypeError);
    });

    it('verificarModelo: modelo vivo devolve ok e as dimensões', async () => {
      const p = criar();

      expect(await verificarModelo(p)).toEqual({ ok: true, modelo: p.model, dims: p.dims });
    });

    if (criarMorto) {
      it('detecta modelo morto: embed rejeita com ModeloIndisponivelError', async () => {
        await expect(criarMorto().embed(['x'])).rejects.toBeInstanceOf(ModeloIndisponivelError);
      });

      it('verificarModelo reporta modelo_indisponivel (sem lançar)', async () => {
        const p = criarMorto();

        expect(await verificarModelo(p)).toEqual({ ok: false, modelo: p.model, motivo: 'modelo_indisponivel' });
      });
    }

    if (criarLimitado) {
      it('limite de taxa: embed rejeita com ProviderLimiteError', async () => {
        await expect(criarLimitado().embed(['x'])).rejects.toBeInstanceOf(ProviderLimiteError);
      });

      it('verificarModelo trata 429 como limite (modelo existe), não como morto', async () => {
        const r = await verificarModelo(criarLimitado());

        expect(r).toMatchObject({ ok: false, motivo: 'limite_de_taxa' });
      });
    }
  });
}

module.exports = { runEmbeddingProviderContract };
