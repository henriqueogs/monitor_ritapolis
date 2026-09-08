'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

function criarBancoMemoria() {
  const conn = new DatabaseSync(':memory:');
  conn.exec(fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf8'));
  return conn;
}

const mockConn = criarBancoMemoria();
jest.mock('./connection', () => ({ db: mockConn }));

const {
  upsertFolhaRegistro,
  getFolhaServidores,
  getFolhaServidorDossie,
  getFolhaResumoSecretarias,
} = require('./folha-repo');

function registroBase(overrides = {}) {
  return {
    vinculo: '0000019',
    matricula: '146',
    nomeServidor: 'MARIA DA SILVA SANTOS',
    cpfMascarado: '***.180796-**',
    situacao: 'Ativo',
    formaAdmissao: 'Efetivo',
    cargo: 'ENCARREGADO DO DEPARTAMENTO DE FAZENDA',
    funcao: 'ENCARREGADO DEPTO DE FAZENDA',
    secretaria: 'FAZENDA',
    lotacao: 'ENCARREGADO DEPARTAMENTO DE FAZENDA',
    siglaCargo: 'EFETIVO',
    dataAdmissao: '18/01/1991',
    cargaHoraria: '40',
    salarioBase: 3319.15,
    competenciaAno: 2025,
    competenciaMes: 1,
    remuneracaoBruta: 7025.54,
    totalLiquido: 5414.49,
    rubricas: [{ codigo: '001', descricao: 'VENCIMENTO', referencia: '30', proventos: 3319.15, descontos: null }],
    ...overrides,
  };
}

describe('folha-repo', () => {
  beforeEach(() => {
    mockConn.exec('DELETE FROM transparencia_folha;');
  });

  describe('upsertFolhaRegistro', () => {
    it('insere um registro novo', () => {
      const action = upsertFolhaRegistro(registroBase());
      expect(action).toBe('inserted');

      const row = mockConn.prepare('SELECT * FROM transparencia_folha').get();
      expect(row.vinculo).toBe('0000019');
      expect(row.nome_servidor).toBe('MARIA DA SILVA SANTOS');
      expect(row.remuneracao_bruta).toBe(7025.54);
      expect(JSON.parse(row.dados_extras).rubricas).toHaveLength(1);
    });

    it('e idempotente por (vinculo, matricula, competencia_ano, competencia_mes) -- atualiza, nao duplica', () => {
      upsertFolhaRegistro(registroBase());
      const action = upsertFolhaRegistro(registroBase({ remuneracaoBruta: 8000 }));
      expect(action).toBe('updated');

      const rows = mockConn.prepare('SELECT * FROM transparencia_folha').all();
      expect(rows).toHaveLength(1);
      expect(rows[0].remuneracao_bruta).toBe(8000);
    });

    it('mesma pessoa em competencias diferentes gera registros separados', () => {
      upsertFolhaRegistro(registroBase({ competenciaMes: 1 }));
      upsertFolhaRegistro(registroBase({ competenciaMes: 2 }));

      const rows = mockConn.prepare('SELECT * FROM transparencia_folha').all();
      expect(rows).toHaveLength(2);
    });

    it('retorna null quando falta vinculo/matricula/competencia', () => {
      expect(upsertFolhaRegistro({ ...registroBase(), vinculo: '' })).toBeNull();
      expect(upsertFolhaRegistro({ ...registroBase(), competenciaAno: null })).toBeNull();
    });
  });

  describe('getFolhaServidores', () => {
    beforeEach(() => {
      upsertFolhaRegistro(registroBase());
      upsertFolhaRegistro(registroBase({
        vinculo: '0000027', matricula: '210', nomeServidor: 'JOAO PEDRO OLIVEIRA COSTA',
        cargo: 'MOTORISTA', secretaria: 'OBRAS E INFRAESTRUTURA',
      }));
    });

    it('lista todos sem filtro, paginado', () => {
      const resultado = getFolhaServidores({ pagina: 1, limite: 10 });
      expect(resultado.total).toBe(2);
      expect(resultado.dados).toHaveLength(2);
    });

    it('busca por nome via FTS', () => {
      const resultado = getFolhaServidores({ q: 'JOAO PEDRO' });
      expect(resultado.total).toBe(1);
      expect(resultado.dados[0].nome_servidor).toBe('JOAO PEDRO OLIVEIRA COSTA');
    });

    it('filtra por secretaria', () => {
      const resultado = getFolhaServidores({ secretaria: 'FAZENDA' });
      expect(resultado.total).toBe(1);
      expect(resultado.dados[0].secretaria).toBe('FAZENDA');
    });

    it('filtra por cargo', () => {
      const resultado = getFolhaServidores({ cargo: 'MOTORISTA' });
      expect(resultado.total).toBe(1);
    });
  });

  describe('getFolhaServidorDossie', () => {
    it('retorna o historico de competencias de um vinculo', () => {
      upsertFolhaRegistro(registroBase({ competenciaMes: 1 }));
      upsertFolhaRegistro(registroBase({ competenciaMes: 2, remuneracaoBruta: 7200 }));

      const dossie = getFolhaServidorDossie({ vinculo: '0000019', matricula: '146' });
      expect(dossie).toHaveLength(2);
      expect(dossie.map((d) => d.competencia_mes)).toEqual([2, 1]);
    });

    it('retorna array vazio quando o vinculo nao existe', () => {
      expect(getFolhaServidorDossie({ vinculo: 'inexistente', matricula: '0' })).toEqual([]);
    });
  });

  describe('getFolhaResumoSecretarias', () => {
    it('agrega remuneracao e contagem de servidores por secretaria', () => {
      upsertFolhaRegistro(registroBase({ secretaria: 'FAZENDA', remuneracaoBruta: 7000 }));
      upsertFolhaRegistro(registroBase({
        vinculo: '0000027', matricula: '210', secretaria: 'FAZENDA', remuneracaoBruta: 3000,
      }));
      upsertFolhaRegistro(registroBase({
        vinculo: '0000031', matricula: '305', secretaria: 'EDUCACAO', remuneracaoBruta: 2650,
      }));

      const resumo = getFolhaResumoSecretarias({ competenciaAno: 2025, competenciaMes: 1 });
      const fazenda = resumo.find((r) => r.secretaria === 'FAZENDA');
      expect(fazenda.total_servidores).toBe(2);
      expect(fazenda.total_remuneracao).toBe(10000);
    });
  });
});
