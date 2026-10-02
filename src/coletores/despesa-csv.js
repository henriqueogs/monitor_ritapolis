'use strict';

const normalizar = texto =>
  String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

// Um empenho já detalhado só precisa de nova consulta de detalhe quando o CSV
// da janela traz algo diferente do armazenado. O detalhe (unidade, função,
// histórico...) é estático por empenho; a consulta é o custo dominante.
// ponytail: correção silenciosa de detalhe na fonte sem mudar o CSV não é vista;
// recoletar o empenho (fora desta verificação) a cobre.
// item: campos do CSV com datas j� em ISO.
function csvConfereComRegistro(item, existente) {
  if (!existente) {return false;}
  if (!existente.unidade && !existente.historico) {return false;}
  const iguais =
    (item.tipo || null) === (existente.tipo || null) &&
    (item.dataEmpenho || null) === (existente.data_empenho || null) &&
    (item.dataLiquidacao || null) === (existente.data_liquidacao || null) &&
    (item.dataPagamento || null) === (existente.data_pagamento || null) &&
    Number(item.valor) === Number(existente.valor);
  if (!iguais) {return false;}
  const parcial = normalizar(item.credorNomeParcial);
  return !parcial || normalizar(existente.credor_nome).includes(parcial);
}

module.exports = { csvConfereComRegistro };
