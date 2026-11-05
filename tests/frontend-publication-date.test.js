const { publicationLabel } = require('../frontend/lib/publication-date');

test('não apresenta atualização ou coleta como publicação ausente', () => {
  expect(publicationLabel({ atualizado_em: '2026-09-27', coletado_em: '2026-10-01' }))
    .toBe('Data de publicação não informada');
  expect(publicationLabel({ data_publicacao: '', atualizado_em: '2026-09-27' }))
    .toBe('Data de publicação não informada');
});

test('preserva o dia civil na fronteira de ano sem deslocar pelo fuso', () => {
  expect(publicationLabel({ data_publicacao: '2025-01-01', atualizado_em: '2026-09-27' }))
    .toBe('Publicação: 01/01/2025');
  expect(publicationLabel({ data_publicacao: '2024-12-31T00:00:00.000Z' }))
    .toBe('Publicação: 31/12/2024');
});

test('não publica datas impossíveis, sem inventar substituição técnica', () => {
  for (const data of ['2025-02-29', '2025-13-01', '2025-00-01', 'não informada']) {
    expect(publicationLabel({ data_publicacao: data })).toBe('Data de publicação não informada');
  }
  expect(publicationLabel({ data_publicacao: '2024-02-29' })).toBe('Publicação: 29/02/2024');
});
