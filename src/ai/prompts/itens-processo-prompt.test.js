'use strict';

const { buildItensProcessoPrompt, MAX_TEXTO_EDITAL_CHARS, MAX_TEXTO_ATA_CHARS } = require('./itens-processo-prompt');

describe('itens-processo-prompt', () => {
  it('inclui texto do edital e das atas no payload', () => {
    const prompt = buildItensProcessoPrompt({
      documento: { titulo: 'Pregão 006/2026', tipo: 'edital', ano: 2026, texto_completo: 'EDITAL texto aqui' },
      atas: [{ nome: 'Ata_de_Estrutura_2026.pdf', texto_completo: 'ATA texto aqui' }],
    });
    expect(prompt).toContain('EDITAL texto aqui');
    expect(prompt).toContain('ATA texto aqui');
    expect(prompt).toContain('Ata_de_Estrutura_2026.pdf');
  });

  it('instrui explicitamente a nunca inventar item de tabela de outra natureza (caso doc/605)', () => {
    const prompt = buildItensProcessoPrompt({
      documento: { titulo: 'X', texto_completo: 'texto' },
      atas: [],
    });
    expect(prompt).toMatch(/cronograma|medição|não é uma lista de itens/i);
    expect(prompt).toMatch(/tem_tabela_itens/);
  });

  it('exige trecho_fonte e JSON puro nas instruções', () => {
    const prompt = buildItensProcessoPrompt({ documento: { texto_completo: 't' }, atas: [] });
    expect(prompt).toMatch(/trecho_fonte/);
    expect(prompt).toMatch(/JSON/);
  });

  it('trunca texto de edital além do limite, com aviso', () => {
    const textoGigante = 'A'.repeat(MAX_TEXTO_EDITAL_CHARS + 5000);
    const prompt = buildItensProcessoPrompt({
      documento: { texto_completo: textoGigante },
      atas: [],
    });
    // não deve conter o texto inteiro sem corte
    expect(prompt.length).toBeLessThan(textoGigante.length + 5000);
  });

  it('trunca texto de cada ata além do limite', () => {
    const ataGigante = 'B'.repeat(MAX_TEXTO_ATA_CHARS + 5000);
    const prompt = buildItensProcessoPrompt({
      documento: { texto_completo: 'edital curto' },
      atas: [{ nome: 'ata.pdf', texto_completo: ataGigante }],
    });
    const bCount = (prompt.match(/B/g) || []).length;
    expect(bCount).toBeLessThanOrEqual(MAX_TEXTO_ATA_CHARS);
  });

  it('funciona sem nenhuma ata vinculada', () => {
    const prompt = buildItensProcessoPrompt({ documento: { texto_completo: 'só edital' }, atas: [] });
    expect(prompt).toContain('só edital');
  });

  it('POSTURA: nunca afirma verdade absoluta, atribui à fonte', () => {
    const prompt = buildItensProcessoPrompt({ documento: { texto_completo: 't' }, atas: [] });
    expect(prompt).toMatch(/segundo|conforme consta|fonte/i);
  });
});
