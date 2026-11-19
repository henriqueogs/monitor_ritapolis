'use strict';

/**
 * Frequência de cada parlamentar nas sessões com ata extraída, e votações de um projeto.
 *
 * Atas recentes só listam os presentes, então "faltou" nem sempre está escrito. A conta usa as
 * sessões entre a primeira e a última vez em que a pessoa aparece no mandato (não cobra de
 * suplente as sessões anteriores à posse) e separa falta registrada de "não listado".
 */

const { slugParlamentar } = require('./parlamentares');
const { normalizar } = require('./sessao-ata');
const { mandatoInicio, MANDATO_DURACAO_ANOS } = require('../utils/mandato');

const ROTULO_PROJETO = {
  projeto_lei: 'projeto de lei',
  projeto_lei_complementar: 'projeto de lei complementar',
  projeto_lei_substitutivo: 'projeto de lei substitutivo',
  projeto_resolucao: 'projeto de resolucao',
  projeto_emenda_lei_organica: 'emenda a lei organica',
};
const NAO_LISTADO = 'nao_listado';

const anoDe = (data) => Number(String(data).slice(0, 4));

function linhaVazia(ano) {
  const inicio = mandatoInicio(ano);
  return {
    ano,
    mandato: { inicio, fim: inicio + MANDATO_DURACAO_ANOS - 1 },
    sessoes: 0,
    presente: 0,
    ausente_justificada: 0,
    ausente: 0,
    [NAO_LISTADO]: 0,
    // Sessão por sessão, para cada número ter a ata de origem ao lado.
    detalhe: [],
  };
}

/** @returns {Array<{ano, mandato, sessoes, presente, ausente_justificada, ausente, nao_listado, detalhe}>} */
function calcularFrequencia(slug, presencas) {
  const sessoes = new Map(presencas.map((p) => [p.documento_id, p.data_sessao]));
  const dela = presencas.filter((p) => slugParlamentar(p.nome) === slug);
  const situacaoPorSessao = new Map(dela.map((p) => [p.documento_id, p.situacao]));
  const porAno = new Map();

  for (const mandato of new Set(dela.map((p) => mandatoInicio(anoDe(p.data_sessao))))) {
    const datas = dela
      .map((p) => p.data_sessao)
      .filter((data) => mandatoInicio(anoDe(data)) === mandato)
      .sort();
    const [primeira, ultima] = [datas[0], datas[datas.length - 1]];
    for (const [documentoId, data] of sessoes) {
      if (data < primeira || data > ultima) {
        continue;
      }
      const linha = porAno.get(anoDe(data)) || linhaVazia(anoDe(data));
      linha.sessoes += 1;
      const situacao = situacaoPorSessao.get(documentoId) || NAO_LISTADO;
      linha[situacao] += 1;
      linha.detalhe.push({ documento_id: documentoId, data_sessao: data, situacao });
      porAno.set(linha.ano, linha);
    }
  }
  for (const linha of porAno.values()) {
    linha.detalhe.sort((a, b) => b.data_sessao.localeCompare(a.data_sessao));
  }
  return [...porAno.values()].sort((a, b) => b.ano - a.ano);
}

/**
 * Votações que tratam de um projeto em tramitação. A numeração dos projetos corre ao longo
 * da legislatura, então o mesmo número só vale dentro do mandato e a partir do ano do projeto.
 * O número tem de estar também no trecho literal da ata, não só na matéria escrita pela IA.
 */
function votacoesDoProjeto(projeto, votacoes) {
  const rotulo = ROTULO_PROJETO[projeto.tipo];
  if (!rotulo || !projeto.numero) {
    return [];
  }
  const alvo = ` ${rotulo} n ${Number(projeto.numero)} `;
  return votacoes.filter((votacao) => {
    const ano = anoDe(votacao.data_sessao);
    const materia = ` ${normalizar(votacao.materia).replace(/\bn 0+(\d)/g, 'n $1')} `;
    const numeroNoTrecho = new RegExp(` (n|numero) 0*${Number(projeto.numero)} `).test(
      ` ${normalizar(votacao.trecho)} `
    );
    return (
      materia.includes(alvo) &&
      numeroNoTrecho &&
      ano >= projeto.exercicio &&
      mandatoInicio(ano) === mandatoInicio(projeto.exercicio)
    );
  });
}

module.exports = { calcularFrequencia, votacoesDoProjeto };
