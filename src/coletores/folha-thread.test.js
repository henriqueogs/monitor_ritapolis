'use strict';

const fs = require('fs');
const path = require('path');
const { reconstruirLinhasLogicas, parseCsvFolha } = require('./folha-thread');

function lerFixture(nome) {
  return fs.readFileSync(path.join(__dirname, '__fixtures__', nome), 'utf8');
}

describe('folha-thread', () => {
  describe('reconstruirLinhasLogicas', () => {
    it('mantem linhas normais separadas', () => {
      const texto = '"a","b"\n"c","d"';
      expect(reconstruirLinhasLogicas(texto)).toEqual(['"a","b"', '"c","d"']);
    });

    it('junta uma linha fisica quebrada dentro de um campo entre aspas (rodape da folha)', () => {
      const texto = '"a","b"\n" Remuneração Bruta: 100\n   Total: 90 ","","","",""\n"proxima"';
      const linhas = reconstruirLinhasLogicas(texto);
      expect(linhas).toHaveLength(3);
      expect(linhas[1]).toContain('Remuneração Bruta: 100\n   Total: 90');
    });
  });

  describe('parseCsvFolha', () => {
    let registros;

    beforeAll(() => {
      const csv = lerFixture('folha-exemplo.csv');
      registros = parseCsvFolha(csv);
    });

    it('processa o arquivo sem lancar excecao e descarta o registro sem rodape (2 dos 3 blocos fecham)', () => {
      expect(registros).toHaveLength(2);
    });

    it('extrai os dados principais do primeiro registro', () => {
      const r = registros[0];
      expect(r.vinculo).toBe('0000019');
      expect(r.matricula).toBe('146');
      expect(r.nomeServidor).toBe('MARIA DA SILVA SANTOS');
      expect(r.cpfMascarado).toBe('***.180796-**');
      expect(r.situacao).toBe('Ativo');
      expect(r.formaAdmissao).toBe('Efetivo');
      expect(r.cargo).toBe('ENCARREGADO DO DEPARTAMENTO DE FAZENDA');
      expect(r.funcao).toBe('ENCARREGADO DEPTO DE FAZENDA');
      expect(r.secretaria).toBe('FAZENDA');
      expect(r.salarioBase).toBe(3319.15);
      expect(r.competenciaMes).toBe(1);
      expect(r.competenciaAno).toBe(2025);
      expect(r.lotacao).toBe('ENCARREGADO DEPARTAMENTO DE FAZENDA');
      expect(r.siglaCargo).toBe('EFETIVO');
      expect(r.dataAdmissao).toBe('18/01/1991');
      expect(r.cargaHoraria).toBe('40');
    });

    it('extrai o rodape (remuneracao bruta e liquida) mesmo quebrado em duas linhas fisicas', () => {
      const r = registros[0];
      expect(r.remuneracaoBruta).toBe(7025.54);
      expect(r.totalLiquido).toBe(5414.49);
    });

    it('acumula todas as rubricas de provento/desconto do primeiro registro', () => {
      const r = registros[0];
      expect(r.rubricas).toHaveLength(7);
      expect(r.rubricas[0]).toEqual({
        codigo: '001', descricao: 'VENCIMENTO', referencia: '30', proventos: 3319.15, descontos: null,
      });
      expect(r.rubricas[1]).toEqual({
        codigo: '025', descricao: 'I.R.R.F.', referencia: '2750', proventos: null, descontos: 817.9,
      });
    });

    it('processa um segundo registro dentro do mesmo arquivo corretamente', () => {
      const r = registros[1];
      expect(r.vinculo).toBe('0000027');
      expect(r.matricula).toBe('210');
      expect(r.nomeServidor).toBe('JOAO PEDRO OLIVEIRA COSTA');
      expect(r.secretaria).toBe('OBRAS E INFRAESTRUTURA');
      expect(r.rubricas).toHaveLength(2);
    });

    it('descarta um registro sem o rodape de fechamento (truncado/malformado) e nao lanca excecao', () => {
      const vinculos = registros.map((r) => r.vinculo);
      expect(vinculos).not.toContain('0000031');
    });
  });
});
