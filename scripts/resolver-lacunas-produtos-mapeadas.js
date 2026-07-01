'use strict';

const { DatabaseSync } = require('node:sqlite');
const config = require('../src/config');

const db = new DatabaseSync(config.dbPath, { timeout: 15000 });
db.exec('PRAGMA busy_timeout = 15000;');

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const produtoDuplicadoOps = [
  {
    documento_id: 606,
    manter_produto_id: 5736,
    remover_produto_ids: [5227],
    valor_global_final: 7500,
    fornecedor_nome: 'FERNANDA AUXILIADORA DE FREITAS GUIMARAES',
    origem_detalhe: 'documentos_anexos:1127:ata:EXTRATO_DE_CONTRATA_AO_Pombal.pdf'
  },
  {
    documento_id: 22,
    manter_produto_id: 5782,
    remover_produto_ids: [5290],
    valor_global_final: 505000.9,
    fornecedor_nome: 'BELABRU COMERCIO E REPRESENTAÇÕES LTDA',
    origem_detalhe: 'documentos_anexos:63:contrato:Contrato_aquisicao_de_VAN_21_lugares___Educacao_ass.pdf'
  },
  {
    documento_id: 35,
    manter_produto_id: 5787,
    remover_produto_ids: [5238],
    valor_global_final: 1248436.8,
    fornecedor_nome: 'O2 PLUS CARD INST. DE PAGAMENTOS LTDA',
    origem_detalhe: 'licitacoes_detalhes:valor_final_local'
  },
  {
    documento_id: 77,
    manter_produto_id: 5832,
    remover_produto_ids: [5427],
    valor_global_final: 5051,
    fornecedor_nome: 'HENRIQUE DOS SANTOS LEAL',
    origem_detalhe: 'documentos_anexos:1749:contrato:CONTRATO___HENRIQUE_DOS_SANTOS_LEAL.pdf'
  }
];

const detalhesOps = [
  {
    documento_id: 606,
    valor_final: 7500,
    vencedor_nome: 'FERNANDA AUXILIADORA DE FREITAS GUIMARAES',
    vencedor_cnpj: '34.771.372/0001-33',
    origem_detalhe: 'documentos_anexos:1127:ata:EXTRATO_DE_CONTRATA_AO_Pombal.pdf',
    trecho_fonte: 'Valor do contrato: R$ 7.500,00; Empresa contratada: Buffet Fernanda Freitas.'
  },
  {
    documento_id: 660,
    valor_final: 51100,
    vencedor_nome: 'Ricardo Vinicius de Morais Nascimento',
    vencedor_cnpj: '58.176.559/0001-57',
    origem_detalhe: 'documentos_anexos:3286:contrato:Contrato_de__Concessao_de_Espaco_Publico___42_Exposicao_Agropecuaria_de_Ritapolis.pdf',
    trecho_fonte: 'CLÁUSULA TERCEIRA - O LOCATÁRIO pagará ao LOCADOR a quantia de R$ 51.100,00.'
  },
  {
    documento_id: 77,
    valor_final: 5051,
    vencedor_nome: 'HENRIQUE DOS SANTOS LEAL',
    vencedor_cnpj: null,
    origem_detalhe: 'documentos_anexos:1749:contrato:CONTRATO___HENRIQUE_DOS_SANTOS_LEAL.pdf',
    trecho_fonte: 'CLÁUSULA TERCEIRA - O LOCATÁRIO pagará ao LOCADOR a quantia de R$ 5.051,00.'
  }
];

function main() {
  const apply = hasFlag('apply');
  const resumo = {
    apply,
    produtos_duplicados: produtoDuplicadoOps,
    detalhes: detalhesOps,
    produtos_atualizados: 0,
    produtos_removidos: 0,
    detalhes_atualizados: 0
  };

  if (!apply) {
    console.log(JSON.stringify(resumo, null, 2));
    console.log('\nUse: node scripts/resolver-lacunas-produtos-mapeadas.js --apply');
    return;
  }

  const updateProduto = db.prepare(`
    UPDATE licitacoes_produtos
       SET valor_final_tipo = 'global',
           valor_global_final = @valor_global_final,
           fornecedor_nome = COALESCE(fornecedor_nome, @fornecedor_nome),
           origem = CASE
             WHEN IFNULL(origem, '') LIKE '%detalhes_valor_final%' THEN origem
             ELSE TRIM(IFNULL(origem, '') || CASE WHEN IFNULL(origem, '') = '' THEN '' ELSE '+' END || 'detalhes_valor_final')
           END,
           origem_detalhe = TRIM(IFNULL(origem_detalhe, '') || CASE WHEN IFNULL(origem_detalhe, '') = '' THEN '' ELSE ' | ' END || @origem_detalhe),
           confianca = MAX(IFNULL(confianca, 0), 0.82),
           atualizado_em = @atualizado_em
     WHERE id = @produto_id
  `);
  const deleteProduto = db.prepare('DELETE FROM licitacoes_produtos WHERE id = @produto_id');
  const upsertDetalhes = db.prepare(`
    INSERT INTO licitacoes_detalhes (
      documento_id, vencedor_nome, vencedor_cnpj, valor_final, origem, origem_detalhe,
      trecho_fonte, confianca, atualizado_em
    ) VALUES (
      @documento_id, @vencedor_nome, @vencedor_cnpj, @valor_final, 'contrato_local',
      @origem_detalhe, @trecho_fonte, 0.86, @atualizado_em
    )
    ON CONFLICT(documento_id) DO UPDATE SET
      vencedor_nome = CASE
        WHEN IFNULL(licitacoes_detalhes.vencedor_nome, '') = ''
          OR LOWER(licitacoes_detalhes.vencedor_nome) IN ('autorizatário', 'autorizatario', 'contratada', 'contratado', 'licitante', 'cnpj n°', 'cnpj n')
        THEN excluded.vencedor_nome
        ELSE licitacoes_detalhes.vencedor_nome
      END,
      vencedor_cnpj = CASE WHEN IFNULL(licitacoes_detalhes.vencedor_cnpj, '') = '' THEN excluded.vencedor_cnpj ELSE licitacoes_detalhes.vencedor_cnpj END,
      valor_final = COALESCE(licitacoes_detalhes.valor_final, excluded.valor_final),
      origem = CASE WHEN licitacoes_detalhes.valor_final IS NULL THEN excluded.origem ELSE licitacoes_detalhes.origem END,
      origem_detalhe = COALESCE(excluded.origem_detalhe, licitacoes_detalhes.origem_detalhe),
      trecho_fonte = COALESCE(excluded.trecho_fonte, licitacoes_detalhes.trecho_fonte),
      confianca = MAX(IFNULL(licitacoes_detalhes.confianca, 0), excluded.confianca),
      atualizado_em = excluded.atualizado_em
  `);

  db.exec('BEGIN');
  try {
    const atualizadoEm = new Date().toISOString();
    for (const op of produtoDuplicadoOps) {
      resumo.produtos_atualizados += updateProduto.run({
        produto_id: op.manter_produto_id,
        valor_global_final: op.valor_global_final,
        fornecedor_nome: op.fornecedor_nome,
        origem_detalhe: op.origem_detalhe,
        atualizado_em: atualizadoEm
      }).changes || 0;

      for (const produtoId of op.remover_produto_ids) {
        resumo.produtos_removidos += deleteProduto.run({ produto_id: produtoId }).changes || 0;
      }
    }

    for (const op of detalhesOps) {
      resumo.detalhes_atualizados += upsertDetalhes.run({
        ...op,
        atualizado_em: atualizadoEm
      }).changes || 0;
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  console.log(JSON.stringify(resumo, null, 2));
}

main();
