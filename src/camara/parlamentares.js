'use strict';

/**
 * Parlamentares da Câmara: une o cadastro do SGC com os autores das proposições.
 *
 * O cadastro da fonte é incompleto (em 13/11/2026 lista 5 dos 9 vereadores em exercício e
 * ninguém da legislatura anterior), então quem assinou indicação ou requerimento entra pelo
 * nome. A identidade pública é o slug do nome; `int_pes` só existe para quem está no SGC.
 */

const { mandatoInicio, MANDATO_DURACAO_ANOS } = require('../utils/mandato');

const TIPOS_PROPOSICAO = { INDICACAO: 'indicacao', REQUERIMENTO: 'requerimento' };

function slugParlamentar(nome) {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    // A mesma pessoa aparece como "Gustavo Júnior ..." e "Gustavo Jr. ..." nas atas.
    .replace(/-junior(?=-|$)/g, '-jr');
}

function separarAutores(autorTexto) {
  return String(autorTexto || '')
    .split(',')
    .map((nome) => nome.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
}

function pessoaDoCadastro(v) {
  const atual = (v.mandatos || [])[0];
  return {
    slug: slugParlamentar(v.nome),
    nome: v.nome,
    int_pes: v.int_pes,
    partido_atual: atual?.partido || null,
    mandato_fim: atual?.periodo_fim || null,
    mandatos: v.mandatos || [],
    proposicoes: [],
  };
}

function pessoaSemCadastro(nome) {
  return {
    slug: slugParlamentar(nome),
    nome,
    int_pes: null,
    partido_atual: null,
    mandato_fim: null,
    mandatos: [],
    proposicoes: [],
  };
}

/** Mapa slug -> pessoa, com as proposições de cada uma (coautores já separados). */
function indexarPessoas({ vereadores = [], proposicoes = [], nomesDeSessoes = [] }) {
  const pessoas = new Map(vereadores.map((v) => [slugParlamentar(v.nome), pessoaDoCadastro(v)]));
  // Quem só aparece nas atas (presença ou falta) também ganha perfil.
  for (const nome of nomesDeSessoes) {
    if (!pessoas.has(slugParlamentar(nome))) {
      pessoas.set(slugParlamentar(nome), pessoaSemCadastro(nome));
    }
  }

  for (const proposicao of proposicoes) {
    const autores = separarAutores(proposicao.autor);
    for (const nome of autores) {
      const slug = slugParlamentar(nome);
      if (!pessoas.has(slug)) {
        pessoas.set(slug, pessoaSemCadastro(nome));
      }
      const { autor: _autor, ...resto } = proposicao;
      pessoas.get(slug).proposicoes.push({
        ...resto,
        coautores: autores.filter((outro) => slugParlamentar(outro) !== slug),
      });
    }
  }
  return pessoas;
}

/**
 * Contagem por mandato, do mais recente ao mais antigo: nunca soma mandatos diferentes num
 * mesmo número. O ano é o da numeração da proposição.
 */
function resumirPorMandato(proposicoes) {
  const porMandato = new Map();
  for (const p of proposicoes) {
    if (!Number.isInteger(Number(p.ano))) {
      continue;
    }
    const inicio = mandatoInicio(Number(p.ano));
    const linha = porMandato.get(inicio) || {
      inicio,
      fim: inicio + MANDATO_DURACAO_ANOS - 1,
      indicacao: 0,
      requerimento: 0,
      sozinho: 0,
      total: 0,
    };
    if (p.tipo in linha) {
      linha[p.tipo] += 1;
    }
    linha.sozinho += p.coautores.length === 0 ? 1 : 0;
    linha.total += 1;
    porMandato.set(inicio, linha);
  }
  return [...porMandato.values()].sort((a, b) => b.inicio - a.inicio);
}

function montarRoster(dados) {
  return [...indexarPessoas(dados).values()]
    .map(({ proposicoes, mandatos: _mandatos, ...pessoa }) => ({
      ...pessoa,
      proposicoes_por_mandato: resumirPorMandato(proposicoes),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

function resumirPorAno(proposicoes) {
  const porAno = new Map();
  for (const p of proposicoes) {
    const linha = porAno.get(p.ano) || { ano: p.ano, indicacao: 0, requerimento: 0, total: 0 };
    if (p.tipo in linha) {
      linha[p.tipo] += 1;
    }
    linha.total += 1;
    porAno.set(p.ano, linha);
  }
  return [...porAno.values()].sort((a, b) => b.ano - a.ano);
}

/** @param {string} id slug do nome ou `int_pes` do SGC */
function montarPerfil(id, dados) {
  const pessoas = [...indexarPessoas(dados).values()];
  const chave = String(id);
  const pessoa = pessoas.find((p) => p.slug === chave || String(p.int_pes) === chave);
  if (!pessoa) {
    return null;
  }
  const proposicoes = [...pessoa.proposicoes].sort(
    (a, b) => String(b.data_publicacao || '').localeCompare(String(a.data_publicacao || '')) || a.id - b.id
  );
  // Projeto não cria perfil: o autor costuma ser o Prefeito ou a Mesa Diretora.
  const projetos = (dados.projetos || []).filter((projeto) =>
    separarAutores(projeto.autor_texto).some((nome) => slugParlamentar(nome) === pessoa.slug)
  );
  return {
    ...pessoa,
    proposicoes,
    projetos,
    por_ano: resumirPorAno(proposicoes),
    por_mandato: resumirPorMandato(proposicoes),
  };
}

module.exports = {
  TIPOS_PROPOSICAO,
  slugParlamentar,
  separarAutores,
  montarRoster,
  montarPerfil,
};
