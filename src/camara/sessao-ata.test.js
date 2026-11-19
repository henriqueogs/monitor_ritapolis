'use strict';

const { validarExtracaoSessao, resolverNome, contemTrecho } = require('./sessao-ata');

const TEXTO = `ATA DA 13º SESSÃO ORDINÁRIA DA 2º SESSÃO LEGISLATIVA
Aos dezesseis dias do mês de setembro do ano de dois mil e vinte e seis, sob a presidência do
Vereador Gustavo Jr. Assis da Paixão, com a presença dos Vereadores Luiz Paulo da Silva,
Matheus Antônio Resende de Almeida, Edir Bonifácio Silva Santos, Maryele Dayana Reis Ribeiro
e Júlio Cezar Santos, e a ausência justificada da vereadora Anna Paula Vieira Neto.
Durante a apreciação e votação, foram registrados dois votos contrários dos vereadores Luiz
Paulo e Matheus e três votos favoráveis dos vereadores Júlio Cezar, Edir e Maryele. Dessa
forma, o Projeto de Lei nº 22/2026 foi aprovado por três votos favoráveis.
O Projeto de Lei nº 23/2026 foi discutido, votado e aprovado com cinco votos favoráveis.`;

const HOJE = '2026-11-19';

// Abertura com a marca "deu-se início": o que vem depois não é lista de presença.
const ABERTURA_COM_MARCA = `Aos dezesseis dias do mês de setembro de 2026, sob a presidência do
Vereador Gustavo Jr. Assis da Paixão, com a presença do Vereador Luiz Paulo da Silva, deu-se
início à sessão.`;

function extracao(overrides = {}) {
  return {
    data_sessao: '2026-09-16',
    presidente: 'Gustavo Jr. Assis da Paixão',
    presentes: [
      'Gustavo Jr. Assis da Paixão',
      'Luiz Paulo da Silva',
      'Matheus Antônio Resende de Almeida',
      'Edir Bonifácio Silva Santos',
      'Maryele Dayana Reis Ribeiro',
      'Júlio Cezar Santos',
    ],
    ausentes: [{ nome: 'Anna Paula Vieira Neto', justificada: true }],
    votacoes: [votacao()],
    ...overrides,
  };
}

function votacao(overrides = {}) {
  return {
    materia: 'Projeto de Lei nº 22/2026',
    descricao: 'Operação de crédito',
    resultado: 'aprovado',
    votos_favoraveis: 3,
    votos_contrarios: 2,
    abstencoes: null,
    nominais: [
      { nome: 'Luiz Paulo', voto: 'contrario' },
      { nome: 'Matheus', voto: 'contrario' },
      { nome: 'Júlio Cezar', voto: 'favoravel' },
      { nome: 'Edir', voto: 'favoravel' },
      { nome: 'Maryele', voto: 'favoravel' },
    ],
    trecho:
      'foram registrados dois votos contrários dos vereadores Luiz Paulo e Matheus e três votos favoráveis dos vereadores Júlio Cezar, Edir e Maryele',
    ...overrides,
  };
}

describe('sessao-ata', () => {
  describe('contemTrecho', () => {
    it('ignora quebra de linha, acento, caixa e pontuação', () => {
      expect(contemTrecho(TEXTO, 'votos contrarios dos vereadores LUIZ\nPaulo e Matheus')).toBe(true);
    });

    it('recusa trecho que não está no texto e trecho curto demais', () => {
      expect(contemTrecho(TEXTO, 'foi rejeitado por unanimidade dos presentes')).toBe(false);
      expect(contemTrecho(TEXTO, 'votos')).toBe(false);
    });
  });

  describe('resolverNome', () => {
    const presentes = ['Luiz Paulo da Silva', 'Júlio Cezar Santos', 'Edir Bonifácio Silva Santos'];

    it('acha o nome completo a partir da forma curta usada na ata', () => {
      expect(resolverNome('Júlio Cezar', presentes)).toBe('Júlio Cezar Santos');
      expect(resolverNome('edir', presentes)).toBe('Edir Bonifácio Silva Santos');
    });

    it('retorna null quando ninguém ou mais de um bate', () => {
      expect(resolverNome('Sormani', presentes)).toBeNull();
      expect(resolverNome('Santos', presentes)).toBeNull();
    });
  });

  describe('validarExtracaoSessao', () => {
    it('aceita extração coerente com o texto, com nomes completos nos votos', () => {
      const { sessao, avisos, status } = validarExtracaoSessao(extracao(), TEXTO);

      expect(status).toBe('ok');
      expect(avisos).toEqual([]);
      expect(sessao.votacoes[0].nominais[0]).toEqual({
        nome: 'Luiz Paulo da Silva',
        voto: 'contrario',
      });
      expect(sessao.ausentes).toEqual([{ nome: 'Anna Paula Vieira Neto', justificada: true }]);
    });

    it('descarta votação cujo trecho não está na ata', () => {
      const dados = extracao({
        votacoes: [votacao(), votacao({ materia: 'Projeto nº 99', trecho: 'trecho que a ata não tem em lugar nenhum' })],
      });

      const { sessao, avisos, status } = validarExtracaoSessao(dados, TEXTO);

      expect(sessao.votacoes).toHaveLength(1);
      expect(status).toBe('com_avisos');
      expect(avisos[0]).toMatch(/Projeto nº 99.*trecho/);
    });

    it('descarta presença de nome que não aparece na ata', () => {
      const dados = extracao({ presentes: [...extracao().presentes, 'Fulano Inventado'] });

      const { sessao, avisos } = validarExtracaoSessao(dados, TEXTO);

      expect(sessao.presentes).not.toContain('Fulano Inventado');
      expect(avisos).toEqual(['1 presença descartada(s): nome fora da abertura da ata']);
    });

    it('descarta voto nominal de quem não está no trecho ou não está presente', () => {
      const dados = extracao({
        votacoes: [
          votacao({
            nominais: [...votacao().nominais, { nome: 'Anna Paula', voto: 'favoravel' }],
          }),
        ],
      });

      const { sessao, avisos } = validarExtracaoSessao(dados, TEXTO);

      expect(sessao.votacoes[0].nominais).toHaveLength(5);
      expect(avisos[0]).toMatch(/descartado\(s\), pessoa fora do trecho/);
      expect(avisos.join(' ')).not.toMatch(/Anna Paula/);
    });

    it('aceita voto nominal com nome completo ou cargo, se a pessoa é citada no trecho', () => {
      const dados = extracao({
        votacoes: [
          votacao({
            nominais: [
              { nome: 'Luiz Paulo da Silva', voto: 'contrario' },
              { nome: 'Vereador Matheus', voto: 'contrario' },
            ],
          }),
        ],
      });

      const { sessao, avisos } = validarExtracaoSessao(dados, TEXTO);

      expect(avisos).toEqual([]);
      expect(sessao.votacoes[0].nominais.map((n) => n.nome)).toEqual([
        'Luiz Paulo da Silva',
        'Matheus Antônio Resende de Almeida',
      ]);
    });

    it('não confunde quem divide um nome com outro presente', () => {
      const texto = `${TEXTO} Presentes também Paula Cristina Santos e Anna Paula Vieira Neto. Houve voto contrário da vereadora Anna Paula ao requerimento nº 5.`;
      const dados = extracao({
        presentes: [...extracao().presentes, 'Paula Cristina Santos', 'Anna Paula Vieira Neto'],
        ausentes: [],
        votacoes: [
          votacao({
            materia: 'Requerimento nº 5',
            votos_favoraveis: null,
            votos_contrarios: 1,
            nominais: [{ nome: 'Paula Cristina Santos', voto: 'contrario' }],
            trecho: 'Houve voto contrário da vereadora Anna Paula ao requerimento nº 5',
          }),
        ],
      });

      const { sessao, avisos } = validarExtracaoSessao(dados, texto);

      expect(sessao.votacoes[0].nominais).toEqual([]);
      expect(avisos[0]).toMatch(/fora do trecho/);
    });

    it('omite os nomes quando há mais votos nominais do que o placar', () => {
      const dados = extracao({ votacoes: [votacao({ votos_favoraveis: 2 })] });

      const { sessao, avisos, status } = validarExtracaoSessao(dados, TEXTO);

      expect(sessao.votacoes[0].nominais).toEqual([]);
      expect(sessao.votacoes[0].votos_favoraveis).toBe(2);
      expect(status).toBe('com_avisos');
      expect(avisos[0]).toMatch(/placar/);
    });

    it('não aceita como presente quem só é citado depois da abertura (assessor, convidado)', () => {
      const texto = `${ABERTURA_COM_MARCA} A assessora jurídica Chimenne Souza esclareceu dúvidas.`;
      const dados = extracao({ presentes: ['Luiz Paulo da Silva', 'Chimenne Souza'], ausentes: [] });

      const { sessao, avisos } = validarExtracaoSessao(dados, texto, { hoje: HOJE });

      expect(sessao.presentes).toEqual(['Gustavo Jr. Assis da Paixão', 'Luiz Paulo da Silva']);
      expect(avisos.join(' ')).not.toMatch(/Chimenne/);
    });

    it('aceita suplente empossado durante a sessão', () => {
      const texto = `${ABERTURA_COM_MARCA} O Senhor Lucimar Antônio dos Santos, primeiro suplente, foi convocado para posse nesta sessão.`;
      const dados = extracao({ presentes: ['Lucimar Antônio dos Santos'], ausentes: [] });

      expect(validarExtracaoSessao(dados, texto, { hoje: HOJE }).sessao.presentes).toContain(
        'Lucimar Antônio dos Santos'
      );
    });

    it('descarta data cujo mês não está na abertura ou que é futura', () => {
      const mesErrado = validarExtracaoSessao(extracao({ data_sessao: '2026-10-16' }), TEXTO, { hoje: HOJE });
      const futura = validarExtracaoSessao(extracao(), TEXTO, { hoje: '2026-09-01' });

      expect(mesErrado.sessao.data_sessao).toBeNull();
      expect(mesErrado.avisos).toContain('data da sessão descartada: não confere com a abertura da ata');
      expect(futura.sessao.data_sessao).toBeNull();
      expect(validarExtracaoSessao(extracao(), TEXTO, { hoje: HOJE }).sessao.data_sessao).toBe('2026-09-16');
    });

    it('descarta voto nominal com direção trocada em relação ao trecho', () => {
      const dados = extracao({
        votacoes: [
          votacao({
            nominais: [
              { nome: 'Luiz Paulo', voto: 'favoravel' },
              { nome: 'Edir', voto: 'favoravel' },
            ],
          }),
        ],
      });

      const { sessao, avisos } = validarExtracaoSessao(dados, TEXTO, { hoje: HOJE });

      expect(sessao.votacoes[0].nominais).toEqual([
        { nome: 'Edir Bonifácio Silva Santos', voto: 'favoravel' },
      ]);
      expect(avisos[0]).toMatch(/direção do voto não confere/);
    });

    it('lê a direção quando a palavra de voto vem depois do nome', () => {
      const texto = `${TEXTO} No requerimento nº 7, o vereador Edir votou contra e foi vencido.`;
      const dados = extracao({
        votacoes: [
          votacao({
            materia: 'Requerimento nº 7',
            votos_favoraveis: null,
            votos_contrarios: 1,
            nominais: [{ nome: 'Edir', voto: 'contrario' }],
            trecho: 'No requerimento nº 7, o vereador Edir votou contra e foi vencido',
          }),
        ],
      });

      expect(validarExtracaoSessao(dados, texto, { hoje: HOJE }).sessao.votacoes[0].nominais).toEqual([
        { nome: 'Edir Bonifácio Silva Santos', voto: 'contrario' },
      ]);
    });

    it('inclui quem preside entre os presentes', () => {
      const dados = extracao({ presentes: extracao().presentes.slice(1) });

      expect(validarExtracaoSessao(dados, TEXTO).sessao.presentes).toContain(
        'Gustavo Jr. Assis da Paixão'
      );
    });

    it('recusa extração sem nenhum presente reconhecido', () => {
      const dados = extracao({ presidente: null, presentes: ['Fulano Inventado'] });

      expect(validarExtracaoSessao(dados, TEXTO).status).toBe('invalida');
    });
  });
});
