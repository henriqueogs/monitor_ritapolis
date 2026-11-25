'use strict';

const fs = require('fs');
const path = require('path');

const {
  SITUACOES,
  urlZipVotacao,
  extrairArquivoZip,
  parsearVotacaoVereadores,
} = require('./tse-votacao');

const FIXTURES = path.join(__dirname, '__fixtures__');
// Linhas reais do votacao_candidato_munzona_2024_MG.csv (latin1, separador ';').
const CSV = fs
  .readFileSync(path.join(FIXTURES, 'tse-votacao-vereador-exemplo.csv'))
  .toString('latin1');
const CODIGO_TSE = '51217';

describe('tse-votacao', () => {
  describe('urlZipVotacao', () => {
    it('monta a URL do zip de votação por candidato do ano', () => {
      expect(urlZipVotacao(2024)).toBe(
        'https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_2024.zip'
      );
    });
  });

  describe('extrairArquivoZip', () => {
    it('extrai só o arquivo pedido de dentro do zip', () => {
      const zip = fs.readFileSync(path.join(FIXTURES, 'tse-votacao-exemplo.zip'));

      const csv = extrairArquivoZip(zip, 'votacao_candidato_munzona_2024_MG.csv');

      expect(csv.toString('latin1')).toBe(CSV);
    });

    it('lança erro quando o arquivo não está no zip', () => {
      const zip = fs.readFileSync(path.join(FIXTURES, 'tse-votacao-exemplo.zip'));

      expect(() => extrairArquivoZip(zip, 'inexistente.csv')).toThrow(/inexistente\.csv/);
    });
  });

  describe('parsearVotacaoVereadores', () => {
    it('fica só com vereadores do município, eleitos e suplentes', () => {
      const lista = parsearVotacaoVereadores(CSV, { codigoMunicipio: CODIGO_TSE });

      expect(lista.map(c => c.nome_urna).sort()).toEqual([
        'EDNA DO CARNEIRO',
        'LUIZ PAULO',
        'TOTÓ DO SABIÁ',
      ]);
    });

    it('lê nome, partido, votos e situação com acento (latin1)', () => {
      const lista = parsearVotacaoVereadores(CSV, { codigoMunicipio: CODIGO_TSE });

      expect(lista.find(c => c.nome_urna === 'TOTÓ DO SABIÁ')).toEqual({
        sq_candidato: '130002026148',
        ano_eleicao: 2024,
        numero: '40444',
        nome: 'SORMANI JESUS DE OLIVEIRA',
        nome_urna: 'TOTÓ DO SABIÁ',
        partido: 'PSB',
        votos: 110,
        situacao: SITUACOES.ELEITO_MEDIA,
      });
    });

    it('não traz CPF, e-mail nem dado pessoal além da candidatura', () => {
      const [candidato] = parsearVotacaoVereadores(CSV, { codigoMunicipio: CODIGO_TSE });

      expect(Object.keys(candidato).sort()).toEqual(
        [
          'ano_eleicao',
          'nome',
          'nome_urna',
          'numero',
          'partido',
          'situacao',
          'sq_candidato',
          'votos',
        ].sort()
      );
    });

    it('soma os votos do mesmo candidato em zonas diferentes', () => {
      const [cabecalho, ...linhas] = CSV.trim().split(/\r?\n/);
      const luiz = linhas.find(l => l.includes('"LUIZ PAULO"'));
      const outraZona = luiz.replace(';232;', ';999;');

      const lista = parsearVotacaoVereadores([cabecalho, luiz, outraZona].join('\n'), {
        codigoMunicipio: CODIGO_TSE,
      });

      expect(lista).toHaveLength(1);
      expect(lista[0].votos).toBe(260);
    });

    it('retorna lista vazia para outro município', () => {
      expect(parsearVotacaoVereadores(CSV, { codigoMunicipio: '00000' })).toEqual([]);
    });

    it('lança erro quando o cabeçalho não tem as colunas esperadas', () => {
      expect(() =>
        parsearVotacaoVereadores('"A";"B"\n"1";"2"', { codigoMunicipio: CODIGO_TSE })
      ).toThrow(/SG_UE/);
    });
  });
});
