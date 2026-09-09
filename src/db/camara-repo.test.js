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
  upsertVereador,
  upsertMandato,
  upsertProjeto,
  getProjetos,
  getProjetoDossie,
  getVereadores,
  getVereadorDossie,
  upsertCamaraColetaLog,
  getCamaraColetaLog,
} = require('./camara-repo');

function projetoBase(overrides = {}) {
  return {
    intPrjt: 6968,
    cOrg: 'P',
    tipo: 'projeto_lei',
    numero: '8',
    exercicio: 2025,
    autorTexto: 'Prefeito Antônio Ronato de Melo',
    origem: null,
    ementa: 'Altera o valor do vencimento básico.',
    situacao: 'Em tramitação',
    localizacao: 'Rascunho',
    anexoUrl: 'https://sgc.ritapolis.mg.leg.br/?Download=55491',
    anexoNome: 'Projeto de Lei nº 8.pdf',
    ...overrides,
  };
}

describe('camara-repo', () => {
  beforeEach(() => {
    mockConn.exec('DELETE FROM camara_votos; DELETE FROM camara_projetos; DELETE FROM camara_mandatos; DELETE FROM camara_vereadores; DELETE FROM camara_coletas_log;');
  });

  describe('upsertProjeto / getProjetos / getProjetoDossie', () => {
    it('insere um projeto novo e retorna "inserted"', () => {
      expect(upsertProjeto(projetoBase())).toBe('inserted');
      const dossie = getProjetoDossie(6968);
      expect(dossie.tipo).toBe('projeto_lei');
      expect(dossie.autor_texto).toBe('Prefeito Antônio Ronato de Melo');
    });

    it('atualiza (upsert) o mesmo int_prjt e retorna "updated"', () => {
      upsertProjeto(projetoBase());
      const resultado = upsertProjeto(projetoBase({ situacao: 'Aprovado', localizacao: 'Finalizado' }));
      expect(resultado).toBe('updated');
      expect(getProjetoDossie(6968).situacao).toBe('Aprovado');
    });

    it('retorna null pra item sem int_prjt', () => {
      expect(upsertProjeto({ ...projetoBase(), intPrjt: null })).toBeNull();
    });

    it('filtra por exercicio e situacao', () => {
      upsertProjeto(projetoBase());
      upsertProjeto(projetoBase({ intPrjt: 6983, exercicio: 2024, situacao: 'Aprovado' }));

      const porExercicio = getProjetos({ exercicio: 2025 });
      expect(porExercicio.total).toBe(1);
      expect(porExercicio.dados[0].int_prjt).toBe(6968);

      const porSituacao = getProjetos({ situacao: 'Aprovado' });
      expect(porSituacao.total).toBe(1);
      expect(porSituacao.dados[0].int_prjt).toBe(6983);
    });

    it('getProjetoDossie retorna null pra id inexistente', () => {
      expect(getProjetoDossie(999999)).toBeNull();
    });
  });

  describe('upsertVereador / upsertMandato / getVereadores / getVereadorDossie', () => {
    it('insere vereador e mandato, e o dossie traz ambos', () => {
      upsertVereador({ intPes: 487, nome: 'Totó do Sabiá' });
      upsertMandato({ intPes: 487, periodoInicio: 2021, periodoFim: 2024, partido: 'PSDB' });
      upsertMandato({ intPes: 487, periodoInicio: 2025, periodoFim: 2028, partido: 'PSB' });

      const dossie = getVereadorDossie(487);
      expect(dossie.nome).toBe('Totó do Sabiá');
      expect(dossie.mandatos).toHaveLength(2);
      expect(dossie.mandatos[0]).toEqual({ periodo_inicio: 2025, periodo_fim: 2028, partido: 'PSB' });
    });

    it('getVereadores traz o partido do mandato mais recente', () => {
      upsertVereador({ intPes: 487, nome: 'Totó do Sabiá' });
      upsertMandato({ intPes: 487, periodoInicio: 2021, periodoFim: 2024, partido: 'PSDB' });
      upsertMandato({ intPes: 487, periodoInicio: 2025, periodoFim: 2028, partido: 'PSB' });

      const lista = getVereadores();
      expect(lista).toHaveLength(1);
      expect(lista[0].partido_atual).toBe('PSB');
    });

    it('upsertMandato e' + ' ' + 'upsertVereador retornam null pra dados incompletos', () => {
      expect(upsertVereador({ intPes: null, nome: 'X' })).toBeNull();
      expect(upsertMandato({ intPes: 1, periodoInicio: null, periodoFim: 2028 })).toBeNull();
    });

    it('getVereadorDossie retorna null pra pessoa inexistente', () => {
      expect(getVereadorDossie(999999)).toBeNull();
    });
  });

  describe('upsertCamaraColetaLog / getCamaraColetaLog', () => {
    it('grava e le o log por tipo (sem exercicio)', () => {
      upsertCamaraColetaLog({ tipo: 'projetos', registros: 108, novos: 108, atualizados: 0, status: 'ok' });
      const log = getCamaraColetaLog('projetos', null);
      expect(log.registros).toBe(108);
      expect(log.status).toBe('ok');
    });

    it('upsert por (tipo, exercicio) atualiza o mesmo registro', () => {
      upsertCamaraColetaLog({ tipo: 'vereadores', registros: 5, novos: 5, atualizados: 0, status: 'ok' });
      upsertCamaraColetaLog({ tipo: 'vereadores', registros: 5, novos: 0, atualizados: 5, status: 'ok' });
      const log = getCamaraColetaLog('vereadores', null);
      expect(log.atualizados).toBe(5);
    });
  });
});
