'use strict';

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyProdutoPrecoLacuna(row = {}) {
  const produtosTotal = Number(row.produtos_total ?? row.produtos ?? 0);
  const produtosComPreco = Number(row.produtos_com_preco ?? row.com_preco ?? 0);

  if (!produtosTotal || produtosComPreco > 0) {
    return null;
  }

  const title = normalize(row.titulo);
  const modalidade = normalize(row.modalidade || row.numero || '');
  const text = `${title} ${modalidade}`;

  if (/\bleilao\b/.test(text)) {
    return {
      codigo: 'preco_item_nao_aplicavel',
      detalhe: 'leilao_bens_inserviveis'
    };
  }

  const isConcessaoEspaco =
    /\bautorizacao de uso\b|\bespaco publico\b|\bexploracao comercial\b|\blocacao de espaco\b/.test(text) ||
    (/\bconcessao\b|\bchamamento\b/.test(text) && /\bespaco\b|\bbar\b|\bexposicao\b|\bquiosque\b|\bbarraca\b|\bparque\b/.test(text));

  if (isConcessaoEspaco) {
    return {
      codigo: 'preco_item_nao_aplicavel',
      detalhe: 'concessao_ou_autorizacao_uso'
    };
  }

  const valorFinal = Number(row.valor_final || 0);
  if (produtosTotal > 1 && valorFinal > 0) {
    return {
      codigo: 'valor_global_sem_rateio',
      detalhe: 'valor_final_do_processo_nao_deve_ser_rateado'
    };
  }

  if (Number(row.resultado_pendente || 0) > 0) {
    return {
      codigo: 'anexo_resultado_pendente',
      detalhe: 'ha_anexo_de_resultado_sem_texto_extraido'
    };
  }

  if (Number(row.anexo_edital_ou_tecnico_ok || 0) > 0 && Number(row.valor_final || 0) <= 0) {
    return {
      codigo: 'resultado_final_nao_publicado',
      detalhe: 'ha_orcamento_ou_edital_mas_nao_ata_resultado'
    };
  }

  if (Number(row.resultado_ok || 0) > 0) {
    return {
      codigo: 'parser_pendente',
      detalhe: 'ha_anexo_extraido_sem_preco_estruturado'
    };
  }

  return {
    codigo: 'fonte_sem_detalhamento_por_item',
    detalhe: 'sem_anexo_resultado_e_sem_preco_por_item'
  };
}

module.exports = {
  classifyProdutoPrecoLacuna
};
