'use strict';

const { montarPromptAnalista, lerRespostaAnalista } = require('./prompt');
const { TIPOS_ACHADO } = require('./verificador');

const dossie = {
  titulo: 'AUTO PECAS LTDA (CNPJ 11111111000111)',
  fontes: [
    {
      fonte_id: 'RESUMO',
      url_origem: 'https://x/r',
      texto: 'Resumo calculado pelo sistema: total R$ 300,00',
    },
    {
      fonte_id: 'E1',
      url_origem: 'https://x/e1',
      texto: 'Empenho 00001-000/2025 (EO) em 02/03/2025: R$ 100,00 — peças',
    },
  ],
};

describe('montarPromptAnalista', () => {
  const prompt = montarPromptAnalista(dossie);

  it('inclui cada fonte com id e texto literal', () => {
    expect(prompt).toContain('[RESUMO]');
    expect(prompt).toContain('[E1] Empenho 00001-000/2025');
    expect(prompt).toContain(dossie.titulo);
  });

  it('exige evidência literal, proíbe somar e acusar, e lista os tipos permitidos', () => {
    expect(prompt).toMatch(/literal/i);
    expect(prompt).toMatch(/não some|nao some|não calcule/i);
    expect(prompt).toMatch(/acus/i);
    for (const tipo of TIPOS_ACHADO) {
      expect(prompt).toContain(tipo);
    }
  });

  it('manda ignorar o trivial (numeração reiniciada, erro de digitação, campo truncado)', () => {
    expect(prompt).toMatch(/não relate/i);
    expect(prompt).toMatch(/numeração/i);
    expect(prompt).toMatch(/digitação/i);
    expect(prompt).toMatch(/truncad/i);
  });

  it('permite resposta sem achados (não força suspeita)', () => {
    expect(prompt).toMatch(/"achados": \[\]/);
    expect(prompt).toMatch(/nada incomum|nenhum achado/i);
  });

  it('não vaza url_origem (o sistema as anexa depois)', () => {
    expect(prompt).not.toContain('https://x/e1');
  });
});

describe('lerRespostaAnalista', () => {
  it('extrai o JSON mesmo com cerca markdown', () => {
    const r = lerRespostaAnalista('```json\n{"achados": []}\n```');
    expect(r).toEqual({ achados: [] });
  });

  it('devolve null quando não há JSON', () => {
    expect(lerRespostaAnalista('desculpe, não consegui')).toBeNull();
  });
});
