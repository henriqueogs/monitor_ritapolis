'use strict';

process.loadEnvFile?.() || require('dotenv').config();

const crypto = require('crypto');
const axios = require('axios');
const { db } = require('../src/db');

function readFlag(name, fallback = null) {
  const prefix = `--${name}=`;
  const arg = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function clean(value, max = 900) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) / 100 : null;
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function normalizeDescricao(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

async function getJson(url) {
  const response = await axios.get(url, {
    timeout: 45000,
    headers: {
      accept: 'application/json',
      'user-agent': 'Monitor-Ritapolis/1.0'
    }
  });
  return response.data;
}

function tipoAnexo(arquivo) {
  const text = `${arquivo.tipoDocumentoNome || ''} ${arquivo.titulo || ''}`.toLowerCase();
  if (/termo/.test(text)) {return 'termo_referencia';}
  if (/edital/.test(text)) {return 'edital';}
  if (/contrato/.test(text)) {return 'contrato';}
  if (/resultado|homologa|adjudica/.test(text)) {return 'resultado';}
  return 'outro';
}

async function main() {
  const apply = hasFlag('apply');
  const documentoId = Number(readFlag('documento-id'));
  const cnpj = readFlag('cnpj');
  const ano = Number(readFlag('ano'));
  const sequencial = Number(readFlag('sequencial'));
  if (!documentoId || !cnpj || !ano || !sequencial) {
    throw new Error('Uso: node scripts/importar-pncp-compra.js --documento-id=N --cnpj=CNPJ --ano=YYYY --sequencial=N --apply');
  }

  const base = `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/compras/${ano}/${sequencial}`;
  const compraConsulta = `https://pncp.gov.br/api/consulta/v1/orgaos/${cnpj}/compras/${ano}/${sequencial}`;
  const [compra, itens, arquivos] = await Promise.all([
    getJson(compraConsulta),
    getJson(`${base}/itens`),
    getJson(`${base}/arquivos`)
  ]);

  const produtoStmt = db.prepare(
    `INSERT INTO licitacoes_produtos (
       documento_id, ano, processo, modalidade, item_numero, lote_numero,
       descricao, descricao_normalizada, unidade, quantidade,
       valor_unitario_estimado, valor_total_estimado,
       valor_unitario_final, valor_total_final, valor_final_tipo, valor_lote_final, valor_global_final,
       fornecedor_nome, fornecedor_cnpj, origem, origem_detalhe,
       trecho_fonte, resumo_ai_id, confianca, status_revisao,
       hash_item, criado_em, atualizado_em
     ) VALUES (
       @documento_id, @ano, @processo, @modalidade, @item_numero, NULL,
       @descricao, @descricao_normalizada, @unidade, @quantidade,
       @valor_unitario_estimado, @valor_total_estimado,
       NULL, NULL, NULL, NULL, NULL,
       NULL, NULL, 'pncp_item_estimado', @origem_detalhe,
       @trecho_fonte, NULL, 0.92, 'pendente',
       @hash_item, @agora, @agora
     )
     ON CONFLICT(documento_id, hash_item) DO UPDATE SET
       descricao = excluded.descricao,
       descricao_normalizada = excluded.descricao_normalizada,
       unidade = excluded.unidade,
       quantidade = excluded.quantidade,
       valor_unitario_estimado = excluded.valor_unitario_estimado,
       valor_total_estimado = excluded.valor_total_estimado,
       origem = excluded.origem,
       origem_detalhe = excluded.origem_detalhe,
       trecho_fonte = excluded.trecho_fonte,
       confianca = excluded.confianca,
       atualizado_em = excluded.atualizado_em`
  );

  const detalheStmt = db.prepare(
    `INSERT INTO licitacoes_detalhes (documento_id, valor_final, numero_pncp, origem, origem_detalhe, atualizado_em)
     VALUES (@documento_id, NULL, @numero_pncp, 'pncp_compra', @origem_detalhe, @agora)
     ON CONFLICT(documento_id) DO UPDATE SET
       numero_pncp = COALESCE(licitacoes_detalhes.numero_pncp, excluded.numero_pncp),
       origem = CASE WHEN licitacoes_detalhes.origem IS NULL THEN excluded.origem ELSE licitacoes_detalhes.origem END,
       origem_detalhe = COALESCE(licitacoes_detalhes.origem_detalhe, excluded.origem_detalhe),
       atualizado_em = excluded.atualizado_em`
  );

  const documentoStmt = db.prepare(
    `UPDATE documentos
        SET valor_estimado = COALESCE(valor_estimado, @valor_estimado),
            dados_extras = json_set(
              json_set(IFNULL(dados_extras, '{}'), '$.pncp_recoleta', json(@pncp)),
              '$.pncp_recoletado_em', @agora),
            atualizado_em = CURRENT_TIMESTAMP
      WHERE id = @documento_id`
  );

  const anexoStmt = db.prepare(
    `INSERT INTO documentos_anexos (documento_id, nome, tipo, url, datahora, status_extracao, atualizado_em)
     VALUES (@documento_id, @nome, @tipo, @url, @datahora, 'pendente', @agora)
     ON CONFLICT(documento_id, url) DO UPDATE SET
       nome = excluded.nome,
       tipo = excluded.tipo,
       datahora = COALESCE(excluded.datahora, documentos_anexos.datahora),
       atualizado_em = excluded.atualizado_em`
  );

  const agora = new Date().toISOString();
  let produtos = 0;
  let anexos = 0;
  if (apply) {
    detalheStmt.run({
      documento_id: documentoId,
      numero_pncp: compra.numeroControlePNCP || null,
      origem_detalhe: `pncp:${cnpj}/${ano}/${sequencial}`,
      agora
    });
    documentoStmt.run({
      documento_id: documentoId,
      valor_estimado: money(compra.valorTotalEstimado),
      pncp: JSON.stringify(compra),
      agora
    });
    for (const item of itens) {
      produtos += produtoStmt.run({
        documento_id: documentoId,
        ano,
        processo: clean(compra.processo || compra.numeroCompra, 80),
        modalidade: clean(compra.modalidadeNome, 120),
        item_numero: clean(item.numeroItem, 40),
        descricao: clean(item.descricao, 900),
        descricao_normalizada: normalizeDescricao(item.descricao),
        unidade: clean(item.unidadeMedida, 50),
        quantidade: money(item.quantidade),
        valor_unitario_estimado: money(item.valorUnitarioEstimado),
        valor_total_estimado: money(item.valorTotal),
        origem_detalhe: `pncp:${compra.numeroControlePNCP}:item:${item.numeroItem}`,
        trecho_fonte: clean(`${item.descricao} | quantidade ${item.quantidade} ${item.unidadeMedida || ''} | valor estimado ${item.valorTotal}`, 1400),
        hash_item: hash(`pncp:${compra.numeroControlePNCP}:item:${item.numeroItem}`),
        agora
      }).changes || 0;
    }
    for (const arquivo of arquivos) {
      anexos += anexoStmt.run({
        documento_id: documentoId,
        nome: decodeURIComponent(arquivo.titulo || `pncp-arquivo-${arquivo.sequencialDocumento}`),
        tipo: tipoAnexo(arquivo),
        url: arquivo.url,
        datahora: arquivo.dataPublicacaoPncp || null,
        agora
      }).changes || 0;
    }
  }

  console.log(JSON.stringify({
    apply,
    documento_id: documentoId,
    numero_pncp: compra.numeroControlePNCP,
    situacao: compra.situacaoCompraNome,
    existe_resultado: compra.existeResultado,
    valor_estimado: compra.valorTotalEstimado,
    valor_homologado: compra.valorTotalHomologado,
    itens_lidos: itens.length,
    arquivos_lidos: arquivos.length,
    produtos_gravados: produtos,
    anexos_gravados: anexos
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
