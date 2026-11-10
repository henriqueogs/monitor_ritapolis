'use strict';

const { verificarAchados, TIPOS_ACHADO } = require('./verificador');

const dossie = {
  fontes: [
    {
      fonte_id: 'E1',
      url_origem: 'https://portal.example/e1',
      texto:
        'Empenho 00542-000/2026 em 05/01/2026: R$ 30.754,71 — Aquisição de peças para a retroescavadeira',
    },
    {
      fonte_id: 'E2',
      url_origem: 'https://portal.example/e2',
      texto:
        'Empenho 00541-000/2026 em 05/01/2026: R$ 26.378,96 — Aquisição de peças para a retroescavadeira',
    },
  ],
};

const achado = (extra = {}) => ({
  achado: 'Dois empenhos no mesmo dia para o mesmo objeto',
  tipo: 'repeticao',
  evidencias: [
    { fonte_id: 'E1', trecho: 'peças para a retroescavadeira', numero: 'R$ 30.754,71' },
    { fonte_id: 'E2', trecho: 'R$ 26.378,96' },
  ],
  por_que_suspeito:
    'Dois empenhos em 05/01/2026, de R$ 30.754,71 e R$ 26.378,96, para o mesmo objeto.',
  o_que_falta_para_confirmar: 'Conferir se há ata de registro de preços.',
  confianca: 0.6,
  ...extra,
});

describe('verificarAchados', () => {
  it('aceita achado com evidências literais e anexa url_origem', () => {
    const r = verificarAchados({ achados: [achado()] }, dossie);
    expect(r.descartados).toEqual([]);
    expect(r.aceitos).toHaveLength(1);
    expect(r.aceitos[0].evidencias[0].url_origem).toBe('https://portal.example/e1');
  });

  it('ignora caixa, acento e espaços ao procurar o trecho', () => {
    const a = achado({
      evidencias: [{ fonte_id: 'E1', trecho: 'PECAS  para a   RETROESCAVADEIRA' }],
    });
    expect(verificarAchados({ achados: [a] }, dossie).aceitos).toHaveLength(1);
  });

  it('descarta trecho que não existe na fonte (evidência inventada)', () => {
    const a = achado({ evidencias: [{ fonte_id: 'E1', trecho: 'combustível para a frota' }] });
    const r = verificarAchados({ achados: [a] }, dossie);
    expect(r.aceitos).toEqual([]);
    expect(r.descartados[0].motivos.join(' ')).toMatch(/trecho/);
  });

  it('descarta fonte inexistente no dossiê', () => {
    const a = achado({ evidencias: [{ fonte_id: 'E99', trecho: 'qualquer coisa longa' }] });
    expect(verificarAchados({ achados: [a] }, dossie).descartados[0].motivos.join(' ')).toMatch(
      /fonte/
    );
  });

  it('descarta achado sem evidências', () => {
    const r = verificarAchados({ achados: [achado({ evidencias: [] })] }, dossie);
    expect(r.descartados[0].motivos.join(' ')).toMatch(/evidências/);
  });

  it('descarta valor monetário que não está nas fontes', () => {
    const a = achado({ por_que_suspeito: 'Somam R$ 99.999,99 no período.' });
    const r = verificarAchados({ achados: [a] }, dossie);
    expect(r.descartados[0].motivos.join(' ')).toMatch(/número/);
  });

  it('descarta percentual e ano que não estão nas fontes', () => {
    for (const texto of ['Alta de 1.484% no período.', 'A partir de 2033 os valores sobem.']) {
      const a = achado({ por_que_suspeito: texto });
      const r = verificarAchados({ achados: [a] }, dossie);
      expect(r.descartados[0].motivos.join(' ')).toMatch(/percentual ou ano/);
    }
  });

  it('descarta "empresa de fachada" e termos parecidos', () => {
    const a = achado({ por_que_suspeito: 'Pode indicar empresa de fachada.' });
    expect(verificarAchados({ achados: [a] }, dossie).descartados[0].motivos.join(' ')).toMatch(
      /linguagem/
    );
  });

  it('descarta linguagem acusatória', () => {
    const a = achado({ por_que_suspeito: 'Parece fraude: dois empenhos no mesmo dia.' });
    const r = verificarAchados({ achados: [a] }, dossie);
    expect(r.descartados[0].motivos.join(' ')).toMatch(/linguagem/);
  });

  it('descarta tipo fora da lista e campos obrigatórios ausentes', () => {
    expect(verificarAchados({ achados: [achado({ tipo: 'outro' })] }, dossie).aceitos).toEqual([]);
    expect(
      verificarAchados({ achados: [achado({ o_que_falta_para_confirmar: '' })] }, dossie).aceitos
    ).toEqual([]);
  });

  it('resposta sem achados válidos devolve listas vazias', () => {
    expect(verificarAchados({}, dossie)).toEqual({ aceitos: [], descartados: [] });
    expect(TIPOS_ACHADO.length).toBeGreaterThan(0);
  });
});
