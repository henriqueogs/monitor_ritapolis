'use strict';

const {
  slugParlamentar,
  separarAutores,
  montarRoster,
  montarPerfil,
} = require('./parlamentares');

const VEREADORES = [
  {
    int_pes: 995,
    nome: 'Gustavo Jr. Assis da Paixão',
    mandatos: [{ periodo_inicio: 2025, periodo_fim: 2028, partido: 'PV' }],
  },
];

function proposicao(overrides = {}) {
  return {
    id: 1,
    tipo: 'indicacao',
    numero: '45',
    ano: 2024,
    ementa: 'Patrolamento das estradas.',
    data_publicacao: '2024-06-17',
    url_origem: 'https://camara.exemplo/m/Legislacao',
    url_pdf: 'https://camara.exemplo/?Download=1',
    autor: 'Anna Paula Vieira Neto, Edir Bonifácio Silva Santos',
    ...overrides,
  };
}

describe('parlamentares', () => {
  describe('slugParlamentar', () => {
    it('remove acentos, pontuação e caixa', () => {
      expect(slugParlamentar('Gustavo Jr. Assis da Paixão')).toBe('gustavo-jr-assis-da-paixao');
    });

    it('iguala nomes que só diferem em caixa e espaços', () => {
      expect(slugParlamentar('Thiago Alves leal')).toBe(slugParlamentar('  THIAGO  ALVES LEAL '));
    });
  });

  describe('separarAutores', () => {
    it('separa coautores por vírgula', () => {
      expect(separarAutores('Anna Paula Vieira Neto, Edir Bonifácio Silva Santos')).toEqual([
        'Anna Paula Vieira Neto',
        'Edir Bonifácio Silva Santos',
      ]);
    });

    it('retorna lista vazia sem autor', () => {
      expect(separarAutores(null)).toEqual([]);
    });
  });

  describe('montarRoster', () => {
    it('une o cadastro da Câmara com autores que só aparecem nas proposições', () => {
      const roster = montarRoster({ vereadores: VEREADORES, proposicoes: [proposicao()] });

      expect(roster.map((p) => p.slug)).toEqual([
        'anna-paula-vieira-neto',
        'edir-bonifacio-silva-santos',
        'gustavo-jr-assis-da-paixao',
      ]);
      expect(roster[2]).toMatchObject({ int_pes: 995, partido_atual: 'PV', mandato_fim: 2028 });
      expect(roster[0]).toMatchObject({ int_pes: null, partido_atual: null });
      expect(roster[0].proposicoes_por_mandato).toMatchObject([{ inicio: 2021, fim: 2024, total: 1 }]);
    });

    it('não duplica quem está no cadastro e também assina proposição', () => {
      const roster = montarRoster({
        vereadores: VEREADORES,
        proposicoes: [proposicao({ autor: 'GUSTAVO JR. ASSIS DA PAIXÃO' })],
      });

      expect(roster).toHaveLength(1);
      expect(roster[0]).toMatchObject({ int_pes: 995 });
      expect(roster[0].proposicoes_por_mandato[0].total).toBe(1);
    });

    it('inclui quem só aparece nas atas das sessões, sem duplicar grafias', () => {
      const roster = montarRoster({
        vereadores: VEREADORES,
        proposicoes: [],
        nomesDeSessoes: ['Luiz Paulo da Silva', 'Gustavo Júnior Assis da Paixão'],
      });

      expect(roster.map((p) => p.slug)).toEqual(['gustavo-jr-assis-da-paixao', 'luiz-paulo-da-silva']);
    });

    it('conta separado por mandato, sem somar mandatos diferentes', () => {
      const roster = montarRoster({
        vereadores: [],
        proposicoes: [
          proposicao({ autor: 'Edir Bonifácio Silva Santos', ano: 2024 }),
          proposicao({ id: 2, autor: 'Edir Bonifácio Silva Santos', ano: 2025 }),
          proposicao({ id: 3, autor: 'Edir Bonifácio Silva Santos', ano: 2026 }),
        ],
      });

      expect(roster[0].proposicoes_por_mandato.map((m) => [m.inicio, m.total])).toEqual([
        [2025, 2],
        [2021, 1],
      ]);
    });

    it('informa o mandato das proposições de cada pessoa', () => {
      const roster = montarRoster({
        vereadores: [],
        proposicoes: [
          proposicao({ autor: 'Edir Bonifácio Silva Santos', ano: 2021 }),
          proposicao({ id: 2, autor: 'Edir Bonifácio Silva Santos', ano: 2024 }),
        ],
      });

      expect(roster[0].proposicoes_por_mandato).toMatchObject([{ inicio: 2021, total: 2 }]);
    });
  });

  describe('montarPerfil', () => {
    const dados = {
      vereadores: VEREADORES,
      proposicoes: [
        proposicao(),
        proposicao({ id: 2, tipo: 'requerimento', ano: 2023, autor: 'Edir Bonifácio Silva Santos' }),
        proposicao({ id: 3, autor: 'Thiago Alves leal' }),
      ],
    };

    it('acha pelo slug e lista só as proposições assinadas pela pessoa', () => {
      const perfil = montarPerfil('edir-bonifacio-silva-santos', dados);

      expect(perfil.nome).toBe('Edir Bonifácio Silva Santos');
      expect(perfil.proposicoes.map((p) => p.id)).toEqual([1, 2]);
    });

    it('acha pelo código da Câmara (int_pes)', () => {
      expect(montarPerfil('995', dados).slug).toBe('gustavo-jr-assis-da-paixao');
    });

    it('marca coautoria e lista os coautores', () => {
      const perfil = montarPerfil('edir-bonifacio-silva-santos', dados);

      expect(perfil.proposicoes[0].coautores).toEqual(['Anna Paula Vieira Neto']);
      expect(perfil.proposicoes[1].coautores).toEqual([]);
    });

    it('resume por ano e tipo, do ano mais recente ao mais antigo', () => {
      const perfil = montarPerfil('edir-bonifacio-silva-santos', dados);

      expect(perfil.por_ano).toEqual([
        { ano: 2024, indicacao: 1, requerimento: 0, total: 1 },
        { ano: 2023, indicacao: 0, requerimento: 1, total: 1 },
      ]);
    });

    it('lista projetos de lei assinados pela pessoa, sem criar perfil para Prefeito ou Mesa', () => {
      const projetos = [
        { int_prjt: 10, autor_texto: 'Gustavo Jr. Assis da Paixão', exercicio: 2026 },
        { int_prjt: 11, autor_texto: 'Prefeito Antônio Ronato de Melo', exercicio: 2026 },
      ];

      expect(montarPerfil('995', { ...dados, projetos }).projetos.map((p) => p.int_prjt)).toEqual([10]);
      expect(montarPerfil('prefeito-antonio-ronato-de-melo', { ...dados, projetos })).toBeNull();
    });

    it('retorna null para quem não existe', () => {
      expect(montarPerfil('ninguem', dados)).toBeNull();
    });
  });
});
