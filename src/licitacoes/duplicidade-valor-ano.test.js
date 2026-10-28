'use strict';

const { medirDuplicidadePorAno } = require('./duplicidade-valor-ano');

function doc(campos) {
  return {
    tipo: 'edital',
    ano: 2025,
    numero: null,
    titulo: '',
    numero_pncp: null,
    grupo_id: null,
    valor_final: 1000,
    ...campos,
  };
}

describe('duplicidade-valor-ano', () => {
  describe('medirDuplicidadePorAno', () => {
    it('conta uma vez só edital e extrato do mesmo processo pela chave de processo', () => {
      // Arrange
      const docs = [
        doc({ id: 1, numero: '045/2025', valor_final: 5000 }),
        doc({ id: 2, tipo: 'publicacao_extrato', numero: '045/2025', valor_final: 5000 }),
        doc({ id: 3, numero: '046/2025', valor_final: 700 }),
      ];

      // Act
      const [linha] = medirDuplicidadePorAno(docs);

      // Assert
      expect(linha.soma_bruta).toBe(10700);
      expect(linha.estrategias.processo).toMatchObject({
        distintos: 2,
        soma_dedup: 5700,
        excesso: 5000,
      });
      expect(linha.estrategias.processo.exemplos[0].documentos.map(d => d.id)).toEqual([1, 2]);
    });

    it('grupo não vê o extrato, que nunca entra em licitacoes_grupo_documentos', () => {
      // Arrange
      const docs = [
        doc({ id: 1, grupo_id: 9, numero: '045/2025' }),
        doc({ id: 2, tipo: 'publicacao_extrato', numero: '045/2025' }),
      ];

      // Act
      const [linha] = medirDuplicidadePorAno(docs);

      // Assert
      expect(linha.estrategias.grupo.excesso).toBe(0);
      expect(linha.estrategias.processo.excesso).toBe(1000);
    });

    it('agrupa pelo controle PNCP normalizado e pela modalidade do título', () => {
      // Arrange
      const docs = [
        doc({
          id: 1,
          numero_pncp: '18094763000105-1-000012/2025',
          titulo: 'Pregão Eletrônico 12/2025 - Merenda',
        }),
        doc({
          id: 2,
          numero_pncp: '18094763000105-1-12/2025',
          titulo: 'Pregão Eletrônico - 012/2025',
        }),
      ];

      // Act
      const [linha] = medirDuplicidadePorAno(docs);

      // Assert
      expect(linha.estrategias.pncp.distintos).toBe(1);
      expect(linha.estrategias.modalidade.distintos).toBe(1);
    });

    it('prefere o edital como canônico quando os valores divergem', () => {
      // Arrange
      const docs = [
        doc({ id: 1, tipo: 'publicacao_extrato', numero: '045/2025', valor_final: 900 }),
        doc({ id: 2, numero: '045/2025', valor_final: 1000 }),
      ];

      // Act
      const [linha] = medirDuplicidadePorAno(docs);

      // Assert
      expect(linha.estrategias.processo.soma_dedup).toBe(1000);
    });

    it('separa por ano, ignora documento sem valor e ordena do mais recente', () => {
      // Arrange
      const docs = [
        doc({ id: 1, ano: 2024, numero: '1/2024' }),
        doc({ id: 2, ano: 2025, numero: '1/2025' }),
        doc({ id: 3, ano: 2025, numero: '2/2025', valor_final: null }),
      ];

      // Act
      const linhas = medirDuplicidadePorAno(docs);

      // Assert
      expect(linhas.map(l => [l.ano, l.documentos])).toEqual([
        [2025, 1],
        [2024, 1],
      ]);
    });

    it('documento sem chave fica sozinho', () => {
      // Act
      const [linha] = medirDuplicidadePorAno([doc({ id: 1 }), doc({ id: 2 })]);

      // Assert
      expect(linha.estrategias.processo.excesso).toBe(0);
      expect(linha.estrategias.modalidade.distintos).toBe(2);
    });
  });
});
