'use strict';
const { buildItensProcessoPrompt } = require('./itens-processo-prompt');
test('prompt never truncates sources or silently discards attachment six', () => {
  const documento = { id: 1, texto_completo: 'A'.repeat(70000) + 'FINAL_EDITAL' };
  const atas = Array.from({ length: 7 }, (_, id) => ({
    id,
    nome: `Fonte${id}`,
    texto_completo: 'B'.repeat(65000) + `FINAL_${id}`,
  }));
  const prompt = buildItensProcessoPrompt({ documento, atas });
  expect(prompt).toContain('FINAL_EDITAL');
  for (let id = 0; id < 7; id++) {
    expect(prompt).toContain(`FINAL_${id}`);
  }
  expect(prompt).not.toContain('texto truncado');
});
test('literal source evidence, source identity, null unknowns and no chronology-to-item conversion are mandatory', () => {
  const prompt = buildItensProcessoPrompt({ documento: { texto_completo: 'Fonte oficial' } });
  for (const word of [
    'LITERAL',
    'fonte_chave',
    'null',
    'Cronogramas',
    'medicao',
    'JSON',
    '400 caracteres',
  ]) {
    expect(prompt).toContain(word);
  }
  expect(prompt).not.toContain('Não especificado no trecho fornecido');
});
