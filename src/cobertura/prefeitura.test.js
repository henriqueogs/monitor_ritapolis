'use strict';

const AREAS_FAKE = [
  { id: 'area_grande', titulo: 'Area Grande', fallbackTitle: 'Area Grande', pageId: 1, publicUrl: 'https://x/1', technicalUrl: 'https://x/ws/1', tipo: 'editais' },
  { id: 'area_pequena', titulo: 'Area Pequena', fallbackTitle: 'Area Pequena', pageId: 2, publicUrl: 'https://x/2', technicalUrl: 'https://x/ws/2', tipo: 'emendas' },
];

function fakeRecord(url) {
  return { titulo: 't', numero: 'n', dataPublicacao: '2026-01-01', attachments: [{ url }] };
}

// registros por area, indexado por area.id -- o mock de collectRecordsForPage
// devolve ate `maxRecords` registros dessa lista.
let mockRegistrosPorArea;

jest.mock('../db', () => ({
  db: { prepare: jest.fn(() => ({ all: () => [], get: () => ({ total: 0 }) })) },
}));

jest.mock('../coletores/site-prefeitura', () => {
  const Coletor = jest.fn().mockImplementation(() => ({
    collectRecordsForPage: jest.fn(async (area, { maxRecords }) => {
      const todos = mockRegistrosPorArea[area.id] || [];
      return todos.slice(0, maxRecords);
    }),
  }));
  Coletor.AREAS = AREAS_FAKE;
  return Coletor;
});

const { compararCoberturaPrefeitura } = require('./prefeitura');

describe('compararCoberturaPrefeitura', () => {
  beforeEach(() => {
    mockRegistrosPorArea = {};
  });

  it('consulta TODAS as areas mesmo quando a primeira sozinha bate no limite (regressao)', async () => {
    // area_grande tem mais registros que o limite (500) -- bug antigo: isso
    // fazia area_pequena nunca ser consultada (status preso em
    // 'nao_consultada_por_limite' pra sempre, mesmo tendo so 2 registros).
    mockRegistrosPorArea.area_grande = Array.from({ length: 500 }, (_, i) => fakeRecord(`https://x/doc${i}.pdf`));
    mockRegistrosPorArea.area_pequena = [fakeRecord('https://x/a.pdf'), fakeRecord('https://x/b.pdf')];

    const resultado = await compararCoberturaPrefeitura({ limite: 500 });

    const grande = resultado.areas.find((a) => a.id === 'area_grande');
    const pequena = resultado.areas.find((a) => a.id === 'area_pequena');

    expect(grande.status).toBe('ok');
    expect(grande.encontrados_site).toBe(500);
    // A area pequena precisa ter sido REALMENTE consultada, nao pulada.
    expect(pequena.status).toBe('ok');
    expect(pequena.encontrados_site).toBe(2);
  });

  it('area que falha na consulta fica indisponivel, sem travar as outras', async () => {
    mockRegistrosPorArea.area_grande = [fakeRecord('https://x/doc.pdf')];
    const ColetorMock = require('../coletores/site-prefeitura');
    ColetorMock.mockImplementationOnce(() => ({
      collectRecordsForPage: jest.fn(async (area, { maxRecords }) => {
        if (area.id === 'area_pequena') {throw new Error('timeout de rede');}
        return (mockRegistrosPorArea[area.id] || []).slice(0, maxRecords);
      }),
    }));

    // limite diferente do 1o teste -- o modulo cacheia por chave de limite
    // (5min TTL), reusar o mesmo valor pegaria o resultado do teste anterior.
    const resultado = await compararCoberturaPrefeitura({ limite: 501 });

    const grande = resultado.areas.find((a) => a.id === 'area_grande');
    const pequena = resultado.areas.find((a) => a.id === 'area_pequena');
    expect(grande.status).toBe('ok');
    expect(pequena.status).toBe('indisponivel');
    expect(resultado.status).toBe('parcial');
    expect(resultado.erros).toHaveLength(1);
  });
});
