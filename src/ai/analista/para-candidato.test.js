'use strict';

const { achadoParaCandidato, AVISO_IA } = require('./para-candidato');
const { candidatoParaAlerta } = require('../../alertas/vertentes/persistencia');

const resultado = {
  chave: 'credor:11111111000111',
  titulo: 'AUTO PECAS LTDA (CNPJ 11111111000111)',
};
const achado = {
  achado: 'Dois empenhos no mesmo dia para o mesmo objeto',
  tipo: 'repeticao',
  evidencias: [
    {
      fonte_id: 'E1',
      trecho: 'peças para a retroescavadeira',
      url_origem: 'https://portal.example/e1',
    },
  ],
  por_que_suspeito: 'Dois empenhos de R$ 30.000,00 e R$ 26.000,00 na mesma data.',
  o_que_falta_para_confirmar: 'Ver se há ata de registro de preços.',
  confianca: 0.6,
};

describe('achadoParaCandidato', () => {
  it('monta candidato em revisão, com aviso de IA, fontes e sem valor total', () => {
    const c = achadoParaCandidato({ resultado, achado, ano: 2026 });
    expect(c).toMatchObject({
      vertente: 'analista',
      severidade: 'info',
      titulo: achado.achado,
      periodo: { ano: 2026 },
    });
    expect(c.narrativa).toContain(achado.por_que_suspeito);
    expect(c.narrativa).toContain(achado.o_que_falta_para_confirmar);
    expect(c.narrativa).toContain(AVISO_IA);
    expect(c.evidencias[0]).toMatchObject({
      url_origem: 'https://portal.example/e1',
      trecho: 'peças para a retroescavadeira',
    });
    expect(c.metrica.unidade).not.toBe('R$');
  });

  it('vira alerta em revisão e a chave é estável por credor + achado', () => {
    const a = candidatoParaAlerta(achadoParaCandidato({ resultado, achado, ano: 2026 }));
    const b = candidatoParaAlerta(achadoParaCandidato({ resultado, achado, ano: 2026 }));
    const outro = candidatoParaAlerta(
      achadoParaCandidato({ resultado, achado: { ...achado, achado: 'Outro' }, ano: 2026 })
    );
    expect(a.alerta.estado_editorial).toBe('revisao');
    expect(a.alerta.valor_total).toBeNull();
    expect(a.alerta.chave_unica).toBe(b.alerta.chave_unica);
    expect(a.alerta.chave_unica).not.toBe(outro.alerta.chave_unica);
  });
});
