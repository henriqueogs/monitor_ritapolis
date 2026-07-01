'use strict';

const crypto = require('crypto');
const { db } = require('../src/db');

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
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

function hash(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function produto({
  documento_id,
  ano,
  processo,
  modalidade,
  item_numero,
  descricao,
  unidade = null,
  quantidade = null,
  valor_unitario_estimado = null,
  valor_total_estimado = null,
  origem,
  origem_detalhe,
  trecho_fonte,
  confianca = 0.82
}) {
  return {
    documento_id,
    ano,
    processo,
    modalidade,
    item_numero: String(item_numero || ''),
    lote_numero: null,
    descricao,
    descricao_normalizada: normalizeDescricao(descricao),
    unidade,
    quantidade,
    valor_unitario_estimado,
    valor_total_estimado,
    valor_unitario_final: null,
    valor_total_final: null,
    valor_final_tipo: null,
    valor_lote_final: null,
    valor_global_final: null,
    fornecedor_nome: null,
    fornecedor_cnpj: null,
    origem,
    origem_detalhe,
    trecho_fonte,
    resumo_ai_id: null,
    confianca,
    status_revisao: 'pendente',
    hash_item: hash(`${documento_id}:${origem}:${item_numero}:${descricao}`)
  };
}

const produtos = [
  // Processo #43 — Leilão 003/2025, ANEXO I recuperado.
  produto({ documento_id: 43, ano: 2025, processo: '0099/2025', modalidade: 'Leilão 003/2025', item_numero: 1, descricao: '710/INDUSCAR PICCOL MICRO ONIBUS HMG8838 SUCATA ADMINISTRAÇÃO patrimônio 04076', valor_total_estimado: 3150, origem: 'anexo_leilao_avaliacao', origem_detalhe: 'documentos_anexos:1573:ANEXO_I.pdf', trecho_fonte: '01 710/INDUSCAR PICCOL MICRO ONIBUS HMG8838 SUCATA ADMINISTRAÇÃO R$ 3.150,00 04076' }),
  produto({ documento_id: 43, ano: 2025, processo: '0099/2025', modalidade: 'Leilão 003/2025', item_numero: 2, descricao: 'IVECO cityclass 70c17 MICRO ONIBUS NXX1377 SUCATA EDUCAÇÃO patrimônio M-1377', valor_total_estimado: 3150, origem: 'anexo_leilao_avaliacao', origem_detalhe: 'documentos_anexos:1573:ANEXO_I.pdf', trecho_fonte: '02 IVECO cityclass 70c17 MICRO ONIBUS NXX1377 SUCATA EDUCAÇÃO R$ 3.150,00 M-1377' }),
  produto({ documento_id: 43, ano: 2025, processo: '0099/2025', modalidade: 'Leilão 003/2025', item_numero: 3, descricao: 'ONIBUS 1318 ONIBUS GRG6438 SUCATA EDUCAÇÃO patrimônio N-6161', valor_total_estimado: 5600, origem: 'anexo_leilao_avaliacao', origem_detalhe: 'documentos_anexos:1573:ANEXO_I.pdf', trecho_fonte: '03 ONIBUS 1318 ONIBUS GRG6438 SUCATA EDUCAÇÃO R$ 5.600,00 N-6161' }),
  produto({ documento_id: 43, ano: 2025, processo: '0099/2025', modalidade: 'Leilão 003/2025', item_numero: 4, descricao: 'SUCATA METÁLICA PESADA SUCATA DIVERSA', valor_total_estimado: 3000, origem: 'anexo_leilao_avaliacao', origem_detalhe: 'documentos_anexos:1573:ANEXO_I.pdf', trecho_fonte: '04 SUCATA METÁLICA PESADA SUCATA DIVERSA R$ 3.000,00' }),

  // Processo #60 — Leilão 002/2025, ANEXO I recuperado por OCR.
  produto({ documento_id: 60, ano: 2025, processo: '0070/2025', modalidade: 'Leilão 002/2025', item_numero: 1, descricao: 'CAMINHÃO GMM7422 SUCATA OBRAS patrimônio G-5023', valor_total_estimado: 5600, origem: 'anexo_leilao_avaliacao', origem_detalhe: 'documentos_anexos:1677:ANEXO_I_DESCRICAO_DOS_ITENS.pdf', trecho_fonte: '01 CAMINHÃO GMM7422 SUCATA OBRAS R$ 5.600,00 G-5023' }),
  produto({ documento_id: 60, ano: 2025, processo: '0070/2025', modalidade: 'Leilão 002/2025', item_numero: 2, descricao: 'ONIBUS 1318 ONIBUS GRG6438 SUCATA EDUCAÇÃO patrimônio N-6161', valor_total_estimado: 5600, origem: 'anexo_leilao_avaliacao', origem_detalhe: 'documentos_anexos:1677:ANEXO_I_DESCRICAO_DOS_ITENS.pdf', trecho_fonte: '02 ONIBUS 1318 ONIBUS GRG6438 SUCATA EDUCAÇÃO R$ 5.600,00 N-6161' }),
  produto({ documento_id: 60, ano: 2025, processo: '0070/2025', modalidade: 'Leilão 002/2025', item_numero: 3, descricao: '710/INDUSCAR PICCOL MICROONIBUS HMG8838 INATIVO ADMINISTRAÇÃO patrimônio 04076', valor_total_estimado: 16210, origem: 'anexo_leilao_avaliacao', origem_detalhe: 'documentos_anexos:1677:ANEXO_I_DESCRICAO_DOS_ITENS.pdf', trecho_fonte: '03 710/INDUSCAR PICCOL MICROONIBUS HMG8838 INATIVO ADMINISTRAÇÃO R$ 16.210,00 04076' }),
  produto({ documento_id: 60, ano: 2025, processo: '0070/2025', modalidade: 'Leilão 002/2025', item_numero: 4, descricao: 'IVECO cityclass 70c17 MICRO ONIBUS NXX1377 INATIVO EDUCAÇÃO patrimônio M-1377', valor_total_estimado: 17800, origem: 'anexo_leilao_avaliacao', origem_detalhe: 'documentos_anexos:1677:ANEXO_I_DESCRICAO_DOS_ITENS.pdf', trecho_fonte: '04 IVECO cityclass 70c17 MICRO ONIBUS NXX1377 INATIVO EDUCAÇÃO R$ 17.800,00 M-1377' }),
  produto({ documento_id: 60, ano: 2025, processo: '0070/2025', modalidade: 'Leilão 002/2025', item_numero: 5, descricao: 'ONIBUS 1318 ONIBUS GMD5650 INATIVO EDUCAÇÃO patrimônio N-6159', valor_total_estimado: 19600, origem: 'anexo_leilao_avaliacao', origem_detalhe: 'documentos_anexos:1677:ANEXO_I_DESCRICAO_DOS_ITENS.pdf', trecho_fonte: '05 ONIBUS 1318 ONIBUS GMD5650 INATIVO EDUCAÇÃO R$ 19.600,00 N-6159' }),
  produto({ documento_id: 60, ano: 2025, processo: '0070/2025', modalidade: 'Leilão 002/2025', item_numero: 6, descricao: 'MOTONIVELADORA FIAT ALLIS FG85 MAQUINA 4250h INATIVO OBRAS patrimônio 03951', valor_total_estimado: 45000, origem: 'anexo_leilao_avaliacao', origem_detalhe: 'documentos_anexos:1677:ANEXO_I_DESCRICAO_DOS_ITENS.pdf', trecho_fonte: '06 MOTONIVELADORA FIAT ALLIS FG85 MAQUINA 4250h INATIVO OBRAS R$ 45.000,00 03951' }),
  produto({ documento_id: 60, ano: 2025, processo: '0070/2025', modalidade: 'Leilão 002/2025', item_numero: 7, descricao: 'SUCATA METÁLICA PESADA SUCATA DIVERSA', valor_total_estimado: 5000, origem: 'anexo_leilao_avaliacao', origem_detalhe: 'documentos_anexos:1677:ANEXO_I_DESCRICAO_DOS_ITENS.pdf', trecho_fonte: '07 SUCATA METÁLICA PESADA SUCATA DIVERSA R$ 5.000,00' }),
  produto({ documento_id: 60, ano: 2025, processo: '0070/2025', modalidade: 'Leilão 002/2025', item_numero: 8, descricao: 'UNO MILLE ECONOMY HATCH HMH 7232 INSERVÍVEL SAÚDE patrimônio ZZ5649', valor_total_estimado: 4757, origem: 'anexo_leilao_avaliacao', origem_detalhe: 'documentos_anexos:1677:ANEXO_I_DESCRICAO_DOS_ITENS.pdf', trecho_fonte: '08 UNO MILLE ECONOMY HMH 7232 INSERVÍVEL SAÚDE R$ 4.757,00 ZZ5649' }),

  // Processo #90 — Chamamento 001/2025, tabela de preço do edital OCR.
  ...['BAILE DA 3º IDADE', 'AULA DE VIOLÃO', 'ATIVIDADES FÍSICAS PARA A 3º IDADE', 'JIU-JITSU', 'AULA DE BALÉ', 'AULA DE VOLEI', 'CORTE E COSTURA', 'CORTE E COSTURA'].map((descricao, index) =>
    produto({ documento_id: 90, ano: 2025, processo: '007/2025', modalidade: 'Chamamento 001/2025', item_numero: index + 1, descricao: `Oficina CRAS - ${descricao}`, unidade: 'hora/aula', quantidade: null, valor_unitario_estimado: 45, origem: 'edital_credenciamento_tabela_preco', origem_detalhe: 'documentos_anexos:3608:EDITAL_DE_CHAMAMENTO_OFICINEIROS_DO_CRAS.pdf', trecho_fonte: `${descricao} | remuneração R$ 45,00 por hora/aula`, confianca: 0.78 })
  ),

  // Objetos oficiais sem detalhamento de item/preço, recuperados da fonte viva.
  produto({ documento_id: 546, ano: 2026, processo: '0007/2026', modalidade: 'Dispensa 003/2026', item_numero: 1, descricao: 'Contratação CISRU para a Prestação de Serviços do SAMU junto a População de Ritápolis', origem: 'pagina_oficial_objeto', origem_detalhe: 'prefeitura:pagina_editais:cadastro_612:sem_pdf', trecho_fonte: 'Objeto: Contratação CISRU para a Prestação de Serviços do SAMU junto a População de Ritápolis. Link do processo: http://', confianca: 0.66 }),
  produto({ documento_id: 547, ano: 2025, processo: '0027/2025', modalidade: 'Dispensa 013/2025', item_numero: 1, descricao: 'Projeto de Extensão de Rede em 13 ruas da cidade de Ritápolis', origem: 'pagina_oficial_objeto', origem_detalhe: 'prefeitura:pagina_editais:cadastro_612:sem_pdf', trecho_fonte: 'Objeto: Projeto de Extensão de Rede em 13 ruas da cidade de Ritápolis. Link do processo: http://', confianca: 0.66 }),
  produto({ documento_id: 53, ano: 2025, processo: '0082/2025', modalidade: 'Credenciamento 005/2025', item_numero: 1, descricao: 'Credenciamento de instituições financeiras públicas ou privadas e cooperativas de crédito para prestação de serviços bancários', origem: 'edital_credenciamento_objeto', origem_detalhe: 'documentos_anexos:1671:ANEXO_I_TERMO_DE_REFERENCIA.pdf', trecho_fonte: 'O objeto do presente projeto é o Credenciamento de Instituições Financeiras Públicas ou Privadas e Cooperativas de Crédito das Categorias plena ou clássica para a prestação de serviços bancários.', confianca: 0.82 })
];

function main() {
  const apply = hasFlag('apply');
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO licitacoes_produtos (
       documento_id, ano, processo, modalidade, item_numero, lote_numero,
       descricao, descricao_normalizada, unidade, quantidade,
       valor_unitario_estimado, valor_total_estimado,
       valor_unitario_final, valor_total_final, valor_final_tipo, valor_lote_final, valor_global_final,
       fornecedor_nome, fornecedor_cnpj, origem, origem_detalhe,
       trecho_fonte, resumo_ai_id, confianca, status_revisao,
       hash_item, criado_em, atualizado_em
     ) VALUES (
       @documento_id, @ano, @processo, @modalidade, @item_numero, @lote_numero,
       @descricao, @descricao_normalizada, @unidade, @quantidade,
       @valor_unitario_estimado, @valor_total_estimado,
       @valor_unitario_final, @valor_total_final, @valor_final_tipo, @valor_lote_final, @valor_global_final,
       @fornecedor_nome, @fornecedor_cnpj, @origem, @origem_detalhe,
       @trecho_fonte, @resumo_ai_id, @confianca, @status_revisao,
       @hash_item, @criado_em, @atualizado_em
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
  const reclassificar = db.prepare(
    `UPDATE documentos
        SET tipo = 'processo_seletivo',
            dados_extras = json_set(IFNULL(dados_extras, '{}'), '$.reclassificacao_motivo', 'nao_e_licitacao_compra_processos_seletivos_concursos'),
            atualizado_em = CURRENT_TIMESTAMP
      WHERE id = 604 AND tipo = 'edital'`
  );

  let changes = 0;
  if (apply) {
    for (const item of produtos) {
      changes += insert.run({ ...item, criado_em: now, atualizado_em: now }).changes || 0;
    }
    changes += reclassificar.run().changes || 0;
  }

  console.log(JSON.stringify({
    apply,
    produtos_planejados: produtos.length,
    documentos_afetados: [...new Set(produtos.map((item) => item.documento_id))],
    reclassificacao_604: true,
    changes
  }, null, 2));
}

main();
