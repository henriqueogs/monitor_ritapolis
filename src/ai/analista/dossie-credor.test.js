'use strict';

const { montarDossieCredor } = require('./dossie-credor');
const { verificarAchados } = require('./verificador');

const credor = { nome: 'AUTO PECAS LTDA', cnpj: '11111111000111' };
let seq = 0;
const empenho = (extra = {}) => {
  seq += 1;
  return {
    id: seq,
    empenho: `${String(seq).padStart(5, '0')}-000`,
    exercicio_orcamento: 2025,
    tipo: 'EO',
    data_empenho: `2025-03-${String((seq % 28) + 1).padStart(2, '0')}`,
    valor: 1000 * seq,
    historico: `Aquisição de peças, requisição ${seq}`,
    ...extra,
  };
};

describe('montarDossieCredor', () => {
  beforeEach(() => {
    seq = 0;
  });

  it('cada empenho vira uma fonte citável com url_origem do portal', () => {
    const d = montarDossieCredor({ credor, empenhos: [empenho(), empenho()] });
    const fonte = d.fontes.find(f => f.fonte_id === 'E1');
    expect(fonte.url_origem).toMatch(/^https?:\/\//);
    expect(fonte.texto).toContain('R$ 1.000,00');
    expect(fonte.texto).toContain('Aquisição de peças');
    expect(d.tipo).toBe('credor');
    expect(d.chave).toBe('credor:11111111000111');
  });

  it('cada empenho traz categoria, fonte de recurso, pagamento e processo (contexto contábil)', () => {
    const pago = empenho({
      categoria_economica: '4.4.90.52.00 - EQUIPAMENTO',
      fonte_recurso: '2.660.000 - FNAS',
      data_pagamento: '2025-04-02',
      modalidade: 'Pregão - 00212025',
      licitacao_ref: '00010325 / 0',
    });
    const aberto = empenho({ data_pagamento: null });
    const d = montarDossieCredor({ credor, empenhos: [pago, aberto] });
    const t1 = d.fontes.find(f => f.fonte_id === `E${pago.id}`).texto;
    expect(t1).toContain('categoria 4.4.90.52.00 - EQUIPAMENTO');
    expect(t1).toContain('fonte de recurso 2.660.000 - FNAS');
    expect(t1).toContain('pago em 02/04/2025');
    expect(t1).toContain('Pregão - 00212025');
    expect(d.fontes.find(f => f.fonte_id === `E${aberto.id}`).texto).toContain('sem pagamento');
  });

  it('o resumo soma os empenhos originais de cada processo (explica rateio em vários empenhos)', () => {
    const ref = { licitacao_ref: '00006626 / 0', modalidade: 'Adesão - 00182026' };
    const empenhos = [
      empenho({ valor: 508322.62, ...ref }),
      empenho({ valor: 128177.38, ...ref }),
      empenho({ valor: 10, licitacao_ref: '00000001 / 0', modalidade: 'Pregão - 00012025' }),
    ];
    const r = montarDossieCredor({ credor, empenhos }).fontes.find(f => f.fonte_id === 'RESUMO');
    expect(r.texto).toContain('Adesão - 00182026: 2 empenhos somam R$ 636.500,00');
    expect(r.texto).not.toContain('Pregão - 00012025: 1 empenhos');
  });

  it('o resumo é calculado pelo sistema, com totais por ano só de empenhos originais', () => {
    const empenhos = [
      empenho({ valor: 100 }),
      empenho({ valor: 200 }),
      empenho({ tipo: 'EE', valor: 999 }),
      empenho({ exercicio_orcamento: 2026, data_empenho: '2026-02-01', valor: 300 }),
    ];
    const resumo = montarDossieCredor({ credor, empenhos }).fontes.find(
      f => f.fonte_id === 'RESUMO'
    );
    expect(resumo.texto).toContain('3 empenhos originais');
    expect(resumo.texto).toContain('R$ 600,00');
    expect(resumo.texto).toMatch(/2025: 2 empenhos.*R\$ 300,00/);
    expect(resumo.texto).not.toContain('999');
    expect(resumo.url_origem).toMatch(/^https?:\/\//);
  });

  it('inclui licitações/processos do credor como fontes', () => {
    const d = montarDossieCredor({
      credor,
      empenhos: [empenho()],
      licitacoes: [
        {
          documento_id: 7,
          titulo: 'Processo 12/2025 - Pregão',
          url_origem: 'https://x.gov.br/p7',
          vencedor_cnpj: credor.cnpj,
          valor_final: 50000,
        },
      ],
    });
    const l = d.fontes.find(f => f.fonte_id === 'L7');
    expect(l.url_origem).toBe('https://x.gov.br/p7');
    expect(l.texto).toContain('Processo 12/2025');
    expect(l.texto).toContain('R$ 50.000,00');
  });

  it('limita os empenhos mostrados e avisa que é amostra (maiores e mais recentes)', () => {
    const muitos = Array.from({ length: 30 }, () => empenho());
    const d = montarDossieCredor({ credor, empenhos: muitos, maxEmpenhos: 10 });
    expect(d.fontes.filter(f => f.fonte_id.startsWith('E'))).toHaveLength(10);
    expect(d.amostra).toBe(true);
    expect(d.fontes.find(f => f.fonte_id === 'RESUMO').texto).toMatch(/10 de 30/);
    expect(d.fontes.some(f => f.fonte_id === 'E30')).toBe(true);
  });

  it('mascara CPF no nome do credor e nos históricos (dado pessoal não vai ao modelo)', () => {
    const d = montarDossieCredor({
      credor: { nome: 'ELANILSON SANTOS 53014731668 - ME', cnpj: '27884788000100' },
      empenhos: [empenho({ historico: 'Pago a fulano CPF 530.147.316-68 por serviço' })],
    });
    const tudo = JSON.stringify(d);
    expect(tudo).not.toContain('53014731668');
    expect(tudo).not.toContain('530.147.316-68');
    expect(d.titulo).toContain('ELANILSON SANTOS ***');
    expect(d.chave).toBe('credor:27884788000100');
  });

  it('estima os tokens do dossiê', () => {
    const d = montarDossieCredor({ credor, empenhos: [empenho()] });
    expect(d.tokens_estimados).toBeGreaterThan(0);
  });

  it('o verificador aceita citar o resumo do sistema (total calculado)', () => {
    const d = montarDossieCredor({
      credor,
      empenhos: [empenho({ valor: 100 }), empenho({ valor: 200 })],
    });
    const r = verificarAchados(
      {
        achados: [
          {
            achado: 'Total no período',
            tipo: 'concentracao',
            evidencias: [{ fonte_id: 'RESUMO', trecho: 'R$ 300,00' }],
            por_que_suspeito: 'O total de R$ 300,00 vem do resumo.',
            o_que_falta_para_confirmar: 'Comparar com outros credores.',
            confianca: 0.5,
          },
        ],
      },
      d
    );
    expect(r.descartados).toEqual([]);
    expect(r.aceitos).toHaveLength(1);
  });
});
