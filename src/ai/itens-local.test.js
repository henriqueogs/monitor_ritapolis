'use strict';
const { montarPacote, gerarLocal, verificarResultado } = require('./itens-local');
const { computeTextoHash, computeInputHash } = require('./itens-processo-input');

const documento = {
  id: 7,
  titulo: 'Edital 7/2026',
  tipo: 'edital',
  ano: 2026,
  url_origem: 'https://official.example/process/7',
  texto_completo: 'Cabecalho do edital.\nItem 1 Arroz 10 kg R$ 120,00\nFim.',
  coletado_em: '2026-10-01',
};
const atas = [{ id: 3, tipo: 'ata', url: 'https://official.example/ata/3', texto_completo: 'Ata sem tabela.' }];

// Provider que cita literalmente o trecho da fonte, como o modelo deve fazer.
const provider = {
  provider: 'teste',
  model: 'modelo-teste',
  generateJson: jest.fn(async ({ prompt }) => {
    const { fontes } = JSON.parse(prompt.split('JSON de entrada:\n')[1]);
    const fonte = fontes.find((f) => f.texto.includes('Item 1 Arroz'));
    const itens = fonte
      ? [
          {
            item_numero: '1',
            descricao: 'Arroz',
            quantidade: 10,
            unidade: 'kg',
            valor_estimado: 120,
            trecho_fonte: 'Item 1 Arroz 10 kg R$ 120,00',
            fonte_chave: fonte.chave,
          },
        ]
      : [];
    return JSON.stringify({
      tem_tabela_itens: itens.length > 0,
      itens_solicitados: itens,
      resultado_lotes: [],
      resultado_global: null,
      lacunas: [],
      confianca: 0.9,
    });
  }),
};

describe('itens-local', () => {
  describe('montarPacote', () => {
    it('leva so o que a extracao precisa, com os hashes da entrada', () => {
      const pacote = montarPacote({ documento, atas });

      expect(pacote.documento).not.toHaveProperty('coletado_em');
      expect(pacote.documento.texto_completo).toBe(documento.texto_completo);
      expect(pacote.atas).toEqual(atas);
      expect(pacote.texto_hash).toBe(computeTextoHash(documento, atas));
      expect(pacote.input_hash).toBe(computeInputHash(documento, atas));
    });
  });

  describe('gerarLocal + verificarResultado', () => {
    it('resultado gerado fora da VM e aceito quando a fonte e a mesma', async () => {
      const pacote = montarPacote({ documento, atas });

      const resultado = await gerarLocal(pacote, { provider });

      expect(resultado.documento_id).toBe(7);
      expect(resultado.itens_json.itens_solicitados).toHaveLength(1);
      expect(verificarResultado({ resultado, documento, atas })).toEqual({ ok: true });
    });

    it('recusa quando o texto oficial mudou depois da exportacao', async () => {
      const resultado = await gerarLocal(montarPacote({ documento, atas }), { provider });
      const alterado = { ...documento, texto_completo: `${documento.texto_completo} Retificado.` };

      const r = verificarResultado({ resultado, documento: alterado, atas });

      expect(r).toEqual({ ok: false, motivo: 'texto_atualizado' });
    });

    it('recusa quando um anexo foi acrescentado na VM', async () => {
      const resultado = await gerarLocal(montarPacote({ documento, atas }), { provider });
      const novas = [...atas, { id: 4, tipo: 'ata', url: 'u', texto_completo: 'Outra ata.' }];

      expect(verificarResultado({ resultado, documento, atas: novas }).ok).toBe(false);
    });

    it('recusa citacao adulterada no arquivo', async () => {
      const resultado = await gerarLocal(montarPacote({ documento, atas }), { provider });
      resultado.itens_json.itens_solicitados[0].trecho_fonte = 'Item 1 Feijao 99 kg R$ 1,00';

      expect(verificarResultado({ resultado, documento, atas }).ok).toBe(false);
    });
  });
});
