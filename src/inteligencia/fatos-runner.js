'use strict';

const crypto = require('crypto');
const { db } = require('../db');
const {
  extrairFatosTexto,
  extrairFatosProdutos,
  resumirAnexoLocal,
} = require('./fatos-extractor');
const {
  listarAnexosDocumento,
  salvarResumoAnexo,
  substituirFatosOrigem,
} = require('../db/inteligencia-fatos-repo');

function textoHash(texto) {
  return crypto.createHash('sha256').update(String(texto || ''), 'utf8').digest('hex');
}

function listarDocumentos({ ano, documentoIds = [], limite } = {}) {
  const params = {};
  const filters = ['1=1'];
  if (ano) {
    filters.push('ano = @ano');
    params.ano = Number(ano);
  }
  if (documentoIds.length) {
    const placeholders = documentoIds.map((_, index) => `@id${index}`);
    filters.push(`id IN (${placeholders.join(',')})`);
    documentoIds.forEach((id, index) => {
      params[`id${index}`] = id;
    });
  }
  const limitClause = limite ? 'LIMIT @limite' : '';
  if (limite) {
    params.limite = Number(limite);
  }
  return db
    .prepare(
      `SELECT id, fonte, tipo, numero, ano, titulo, resumo, data_publicacao, data_abertura,
              valor_estimado, url_origem, texto_completo
         FROM documentos
        WHERE ${filters.join(' AND ')}
        ORDER BY ano DESC, COALESCE(data_publicacao, data_abertura, atualizado_em, '') DESC, id DESC
        ${limitClause}`
    )
    .all(params);
}

function listarProdutos(documentoId) {
  return db.prepare('SELECT * FROM licitacoes_produtos WHERE documento_id = ? ORDER BY id ASC').all(Number(documentoId));
}

function processarDocumento(documento, { apply = true } = {}) {
  const textoTitulo = [documento.titulo, documento.resumo].filter(Boolean).join('\n');
  const textoCompleto = [documento.titulo, documento.resumo, documento.texto_completo].filter(Boolean).join('\n');
  const fatosTitulo = extrairFatosTexto({ documento, texto: textoTitulo, origem: 'texto_documento:v1:titulo' });
  const fatosTexto = extrairFatosTexto({ documento, texto: textoCompleto, origem: 'texto_documento:v1:completo' });
  const fatosProdutos = extrairFatosProdutos({ documento, produtos: listarProdutos(documento.id) });
  const anexos = listarAnexosDocumento(documento.id);

  const total = {
    documento_id: documento.id,
    fatos_encontrados: fatosTitulo.length + fatosTexto.length + fatosProdutos.length,
    fatos_salvos: 0,
    anexos: anexos.length,
    resumos_anexos: 0,
  };

  if (apply) {
    total.fatos_salvos += substituirFatosOrigem({
      documentoId: documento.id,
      origemPrefixo: 'texto_documento:v1',
      fatos: [...fatosTitulo, ...fatosTexto],
    }).length;
    total.fatos_salvos += substituirFatosOrigem({
      documentoId: documento.id,
      origemPrefixo: 'produto:',
      fatos: fatosProdutos,
    }).length;
  }

  for (const anexo of anexos) {
    const texto = anexo.texto_completo || '';
    const fatos = anexo.status_extracao === 'ok' && texto
      ? extrairFatosTexto({ documento, anexo, texto, origem: `texto_anexo:v1:${anexo.id}` })
      : [];
    total.fatos_encontrados += fatos.length;
    if (!apply) {
      continue;
    }
    const salvos = substituirFatosOrigem({
      documentoId: documento.id,
      anexoId: anexo.id,
      origemPrefixo: `texto_anexo:v1:${anexo.id}`,
      fatos,
    });
    total.fatos_salvos += salvos.length;
    if (anexo.status_extracao === 'ok' && texto) {
      const resumo = resumirAnexoLocal({ anexo, fatos: salvos.length ? salvos : fatos });
      salvarResumoAnexo({
        anexo_id: anexo.id,
        provider: 'local',
        modelo: 'heuristico-anexo',
        contrato_versao: 'anexo-1.0',
        resumo_json: resumo,
        texto_hash: anexo.texto_hash || textoHash(texto),
        confianca: resumo.confianca,
        status: 'ok',
      });
      total.resumos_anexos += 1;
    }
  }

  return total;
}

function extrairFatosInteligencia({ ano, documentoIds = [], limite, apply = true } = {}) {
  const documentos = listarDocumentos({ ano, documentoIds, limite });
  const total = {
    apply,
    documentos: documentos.length,
    fatos_encontrados: 0,
    fatos_salvos: 0,
    anexos: 0,
    resumos_anexos: 0,
    itens: [],
  };
  for (const documento of documentos) {
    const item = processarDocumento(documento, { apply });
    total.fatos_encontrados += item.fatos_encontrados;
    total.fatos_salvos += item.fatos_salvos;
    total.anexos += item.anexos;
    total.resumos_anexos += item.resumos_anexos;
    total.itens.push(item);
  }
  return total;
}

module.exports = {
  listarDocumentos,
  processarDocumento,
  extrairFatosInteligencia,
};
