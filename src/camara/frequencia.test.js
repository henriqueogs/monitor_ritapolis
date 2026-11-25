'use strict';

const { calcularFrequencia, votacoesDoProjeto } = require('./frequencia');

function presenca(nome, data, situacao = 'presente') {
  return { nome, situacao, documento_id: Number(data.replace(/-/g, '')), data_sessao: data };
}

describe('frequencia', () => {
  describe('calcularFrequencia', () => {
    const presencas = [
      presenca('Edir Bonifácio Silva Santos', '2026-02-04'),
      presenca('Luiz Paulo da Silva', '2026-02-04'),
      presenca('Edir Bonifácio Silva Santos', '2026-02-18', 'ausente_justificada'),
      presenca('Luiz Paulo da Silva', '2026-02-18'),
      presenca('Luiz Paulo da Silva', '2026-03-04'),
      presenca('Edir Bonifácio Silva Santos', '2026-03-18'),
      presenca('Luiz Paulo da Silva', '2026-03-18'),
    ];

    it('conta presenças, faltas registradas e sessões em que a pessoa não foi listada', () => {
      expect(calcularFrequencia('edir-bonifacio-silva-santos', presencas)).toMatchObject([
        { ano: 2026, sessoes: 4, presente: 2, ausente_justificada: 1, ausente: 0, nao_listado: 1 },
      ]);
    });

    it('soma as grafias de uma mesma pessoa (nome civil e de urna)', () => {
      const comApelido = presencas.map((p) =>
        p.data_sessao === '2026-03-18' && p.nome.startsWith('Edir') ? { ...p, nome: 'Edir Bonifácio' } : p
      );

      expect(
        calcularFrequencia(['edir-bonifacio-silva-santos', 'edir-bonifacio'], comApelido)
      ).toMatchObject([{ ano: 2026, sessoes: 4, presente: 2, nao_listado: 1 }]);
    });

    it('só conta sessões entre a primeira e a última vez em que a pessoa aparece', () => {
      const comSuplente = [...presencas, presenca('Lucimar Antônio dos Santos', '2026-03-18')];

      expect(calcularFrequencia('lucimar-antonio-dos-santos', comSuplente)).toMatchObject([
        { ano: 2026, sessoes: 1, presente: 1, ausente_justificada: 0, ausente: 0, nao_listado: 0 },
      ]);
    });

    it('separa por ano, do mais recente ao mais antigo, sem misturar mandatos', () => {
      const doisMandatos = [
        presenca('Edir Bonifácio Silva Santos', '2024-03-06'),
        presenca('Thiago Alves Leal', '2024-12-04'),
        presenca('Luiz Paulo da Silva', '2025-02-05'),
        ...presencas,
      ];

      const linhas = calcularFrequencia('edir-bonifacio-silva-santos', doisMandatos);

      expect(linhas.map((l) => [l.ano, l.sessoes])).toEqual([
        [2026, 4],
        [2024, 1],
      ]);
    });

    it('traz o mandato e cada sessão por trás dos números, da mais recente à mais antiga', () => {
      const [linha] = calcularFrequencia('edir-bonifacio-silva-santos', presencas);

      expect(linha.mandato).toEqual({ inicio: 2025, fim: 2028 });
      expect(linha.detalhe).toEqual([
        { documento_id: 20260318, data_sessao: '2026-03-18', situacao: 'presente' },
        { documento_id: 20260304, data_sessao: '2026-03-04', situacao: 'nao_listado' },
        { documento_id: 20260218, data_sessao: '2026-02-18', situacao: 'ausente_justificada' },
        { documento_id: 20260204, data_sessao: '2026-02-04', situacao: 'presente' },
      ]);
    });

    it('reeleito: cada mandato tem janela própria, sem contar sessões entre um e outro', () => {
      const reeleito = [
        presenca('Edir Bonifácio Silva Santos', '2024-11-06'),
        presenca('Luiz Paulo da Silva', '2024-12-04'),
        presenca('Luiz Paulo da Silva', '2025-01-08'),
        presenca('Edir Bonifácio Silva Santos', '2025-02-05'),
      ];

      const linhas = calcularFrequencia('edir-bonifacio-silva-santos', reeleito);

      expect(linhas.map((l) => [l.ano, l.sessoes, l.presente])).toEqual([
        [2025, 1, 1],
        [2024, 1, 1],
      ]);
    });

    it('junta grafias do mesmo nome (Júnior e Jr.)', () => {
      const linhas = calcularFrequencia('gustavo-jr-assis-da-paixao', [
        presenca('Gustavo Júnior Assis da Paixão', '2026-02-04'),
        presenca('Gustavo Jr. Assis da Paixão', '2026-02-18'),
      ]);

      expect(linhas[0]).toMatchObject({ sessoes: 2, presente: 2 });
    });

    it('retorna lista vazia para quem não aparece em sessão nenhuma', () => {
      expect(calcularFrequencia('ninguem', presencas)).toEqual([]);
    });
  });

  describe('votacoesDoProjeto', () => {
    const projeto = { tipo: 'projeto_lei', numero: '22', exercicio: 2026 };
    const votacao = (materia, data = '2026-09-16', trecho = 'apreciação do Projeto de Lei nº 22, de 09 de junho') => ({
      materia,
      data_sessao: data,
      trecho,
    });

    it('casa a votação pelo tipo e número da matéria', () => {
      const votacoes = [
        votacao('Projeto de Lei nº 22/2026'),
        votacao('Pedido de retirada de pauta do Projeto de Lei nº 22'),
        votacao('Projeto de Lei nº 221/2026'),
        votacao('Projeto de Lei Complementar nº 22/2026'),
        votacao('Projeto de Lei nº 23/2026'),
      ];

      expect(votacoesDoProjeto(projeto, votacoes).map((v) => v.materia)).toEqual([
        'Projeto de Lei nº 22/2026',
        'Pedido de retirada de pauta do Projeto de Lei nº 22',
      ]);
    });

    it('não casa com projeto de mesmo número de outro mandato ou votado antes de existir', () => {
      const votacoes = [
        votacao('Projeto de Lei nº 22', '2023-03-15'),
        votacao('Projeto de Lei nº 22', '2025-03-15'),
      ];

      expect(votacoesDoProjeto(projeto, votacoes)).toEqual([]);
    });

    it('exige o número do projeto também no trecho da ata', () => {
      const votacoes = [votacao('Projeto de Lei nº 22/2026', '2026-09-16', 'o projeto foi aprovado por cinco votos')];

      expect(votacoesDoProjeto(projeto, votacoes)).toEqual([]);
    });

    it('retorna vazio para tipo de projeto desconhecido', () => {
      expect(votacoesDoProjeto({ ...projeto, tipo: 'outro' }, [votacao('Projeto de Lei nº 22')])).toEqual([]);
    });
  });
});
