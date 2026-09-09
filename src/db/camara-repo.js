'use strict';

/**
 * Repositório: Câmara Municipal — vereadores, mandatos e projetos de lei em
 * tramitação. Domínio novo (processo/pessoa, não documento publicado) —
 * separado de documentos-repo.js/transparencia-repo.js.
 */

const crypto = require('crypto');
const { db } = require('./connection');

const LIMITE_MAX = 100;
// SQLite trata NULL como distinto de NULL em UNIQUE -- ON CONFLICT nunca
// dispara pra exercicio=NULL (cada chamada criaria uma linha nova). Sentinel
// em vez de NULL, mesmo padrao de MES_ANO_INTEIRO em transparencia-repo.js.
const EXERCICIO_NAO_APLICAVEL = -1;

function hashProjeto(intPrjt, situacao, localizacao) {
  return crypto.createHash('sha256').update(`${intPrjt}|${situacao}|${localizacao}`).digest('hex').slice(0, 16);
}

const upsertVereadorStmt = db.prepare(`
  INSERT INTO camara_vereadores (int_pes, nome)
  VALUES (@int_pes, @nome)
  ON CONFLICT (int_pes) DO UPDATE SET
    nome = excluded.nome,
    atualizado_em = CURRENT_TIMESTAMP
`);

/** @returns {'inserted'|'updated'|null} */
function upsertVereador({ intPes, nome }) {
  if (!intPes || !nome) {
    return null;
  }
  const existing = db.prepare('SELECT int_pes FROM camara_vereadores WHERE int_pes = ?').get(Number(intPes));
  upsertVereadorStmt.run({ int_pes: Number(intPes), nome: String(nome).trim() });
  return existing ? 'updated' : 'inserted';
}

const upsertMandatoStmt = db.prepare(`
  INSERT INTO camara_mandatos (int_pes, periodo_inicio, periodo_fim, partido)
  VALUES (@int_pes, @periodo_inicio, @periodo_fim, @partido)
  ON CONFLICT (int_pes, periodo_inicio) DO UPDATE SET
    periodo_fim = excluded.periodo_fim,
    partido = excluded.partido
`);

function upsertMandato({ intPes, periodoInicio, periodoFim, partido }) {
  if (!intPes || !periodoInicio || !periodoFim) {
    return null;
  }
  upsertMandatoStmt.run({
    int_pes: Number(intPes),
    periodo_inicio: Number(periodoInicio),
    periodo_fim: Number(periodoFim),
    partido: partido || null,
  });
  return true;
}

const upsertProjetoStmt = db.prepare(`
  INSERT INTO camara_projetos (
    int_prjt, c_org, tipo, numero, exercicio, autor_texto, origem,
    ementa, situacao, localizacao, anexo_url, anexo_nome, hash_projeto
  ) VALUES (
    @int_prjt, @c_org, @tipo, @numero, @exercicio, @autor_texto, @origem,
    @ementa, @situacao, @localizacao, @anexo_url, @anexo_nome, @hash_projeto
  )
  ON CONFLICT (int_prjt) DO UPDATE SET
    tipo = excluded.tipo,
    numero = excluded.numero,
    exercicio = excluded.exercicio,
    autor_texto = excluded.autor_texto,
    origem = excluded.origem,
    ementa = excluded.ementa,
    situacao = excluded.situacao,
    localizacao = excluded.localizacao,
    anexo_url = excluded.anexo_url,
    anexo_nome = excluded.anexo_nome,
    hash_projeto = excluded.hash_projeto,
    atualizado_em = CURRENT_TIMESTAMP
`);

/** @returns {'inserted'|'updated'|null} */
function upsertProjeto(p) {
  const intPrjt = Number(p?.intPrjt);
  if (!intPrjt) {
    return null;
  }

  const existing = db.prepare('SELECT int_prjt FROM camara_projetos WHERE int_prjt = ?').get(intPrjt);

  upsertProjetoStmt.run({
    int_prjt: intPrjt,
    c_org: p.cOrg || 'P',
    tipo: p.tipo || null,
    numero: p.numero || null,
    exercicio: p.exercicio || null,
    autor_texto: p.autorTexto || null,
    origem: p.origem || null,
    ementa: p.ementa || null,
    situacao: p.situacao || null,
    localizacao: p.localizacao || null,
    anexo_url: p.anexoUrl || null,
    anexo_nome: p.anexoNome || null,
    hash_projeto: hashProjeto(intPrjt, p.situacao, p.localizacao),
  });

  return existing ? 'updated' : 'inserted';
}

function getProjetos({ exercicio, situacao, tipo, origem, pagina = 1, limite = 30 } = {}) {
  const filters = [];
  const params = [];
  if (exercicio) { filters.push('exercicio = ?'); params.push(Number(exercicio)); }
  if (situacao) { filters.push('situacao = ?'); params.push(situacao); }
  if (tipo) { filters.push('tipo = ?'); params.push(tipo); }
  if (origem) { filters.push('origem = ?'); params.push(origem); }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const limiteReal = Math.min(Math.max(1, Number(limite) || 30), LIMITE_MAX);
  const offset = (Math.max(1, Number(pagina) || 1) - 1) * limiteReal;

  const total = db.prepare(`SELECT COUNT(*) AS n FROM camara_projetos ${where}`).get(...params).n;
  const dados = db.prepare(`
    SELECT int_prjt, c_org, tipo, numero, exercicio, autor_texto, origem,
           ementa, situacao, localizacao, anexo_url, anexo_nome, coletado_em
    FROM camara_projetos
    ${where}
    ORDER BY int_prjt DESC
    LIMIT ? OFFSET ?
  `).all(...params, limiteReal, offset);

  return { total, pagina: Number(pagina) || 1, limite: limiteReal, dados };
}

function getProjetoDossie(intPrjt) {
  return db.prepare('SELECT * FROM camara_projetos WHERE int_prjt = ?').get(Number(intPrjt)) || null;
}

function getVereadores() {
  return db.prepare(`
    SELECT v.int_pes, v.nome,
           (SELECT partido FROM camara_mandatos m WHERE m.int_pes = v.int_pes ORDER BY periodo_inicio DESC LIMIT 1) AS partido_atual,
           (SELECT periodo_fim FROM camara_mandatos m WHERE m.int_pes = v.int_pes ORDER BY periodo_inicio DESC LIMIT 1) AS mandato_fim
    FROM camara_vereadores v
    ORDER BY v.nome ASC
  `).all();
}

function getVereadorDossie(intPes) {
  const vereador = db.prepare('SELECT * FROM camara_vereadores WHERE int_pes = ?').get(Number(intPes));
  if (!vereador) {
    return null;
  }
  const mandatos = db.prepare(
    'SELECT periodo_inicio, periodo_fim, partido FROM camara_mandatos WHERE int_pes = ? ORDER BY periodo_inicio DESC'
  ).all(Number(intPes));
  return { ...vereador, mandatos };
}

function upsertCamaraColetaLog({ tipo, exercicio = null, registros, novos, atualizados, status, erro = null }) {
  const exercicioVal = exercicio ?? EXERCICIO_NAO_APLICAVEL;
  db.prepare(`
    INSERT INTO camara_coletas_log (tipo, exercicio, registros, novos, atualizados, status, erro, coletado_em)
    VALUES (@tipo, @exercicio, @registros, @novos, @atualizados, @status, @erro, CURRENT_TIMESTAMP)
    ON CONFLICT (tipo, exercicio) DO UPDATE SET
      registros = excluded.registros,
      novos = excluded.novos,
      atualizados = excluded.atualizados,
      status = excluded.status,
      erro = excluded.erro,
      coletado_em = CURRENT_TIMESTAMP
  `).run({ tipo, exercicio: exercicioVal, registros: registros || 0, novos: novos || 0, atualizados: atualizados || 0, status, erro });
}

function getCamaraColetaLog(tipo, exercicio = null) {
  const exercicioVal = exercicio ?? EXERCICIO_NAO_APLICAVEL;
  return db.prepare('SELECT * FROM camara_coletas_log WHERE tipo = ? AND exercicio = ?').get(tipo, exercicioVal) || null;
}

module.exports = {
  upsertVereador,
  upsertMandato,
  upsertProjeto,
  getProjetos,
  getProjetoDossie,
  getVereadores,
  getVereadorDossie,
  upsertCamaraColetaLog,
  getCamaraColetaLog,
};
