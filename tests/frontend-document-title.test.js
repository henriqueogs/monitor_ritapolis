const { splitTitle } = require('../frontend/lib/document-title');

test('keeps the subject as heading when the last segment is the issuing institution', () => {
  expect(splitTitle('Contrato de fornecimento de veículo - Prefeitura Municipal de Ritápolis')).toEqual({ titulo: 'Contrato de fornecimento de veículo', subtitulo: 'Prefeitura Municipal de Ritápolis' });
  expect(splitTitle('Ata da reunião – Câmara Municipal de Ritápolis').titulo).toBe('Ata da reunião');
});

test('preserves the existing subject-last convention for administrative prefixes', () => {
  expect(splitTitle('Processo 0076/2026 - Pregão 014/2026 - Locação de vans')).toEqual({ titulo: 'Locação de vans', subtitulo: 'Processo 0076/2026 – Pregão 014/2026' });
  expect(splitTitle('Lei 123/2026')).toEqual({ titulo: 'Lei 123/2026', subtitulo: null });
});
