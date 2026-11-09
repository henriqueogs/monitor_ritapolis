'use strict';

/**
 * Itens da nota fiscal na página de detalhe da despesa (/Relatorios/Detalhamento_Despesa.php):
 * "Item N / Produto / Complemento / Unidade / Marca / Quantidade / Valor Unitário / Total",
 * agrupados sob "Nota Fiscal: <número>". Base da comparação de preços entre empenhos. Puro.
 */

const RE_NOTA = /<b>Nota Fiscal:<\/b>\s*([^<]*)/gi;
const RE_ITEM = /<TH[^>]*>\s*Item\s+(\d+)\s*<\/TH>/gi;
const FIM_DO_ITEM = /<TH[^>]*>/i;

const texto = valor => {
  const t = String(valor ?? '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t || null;
};

const numero = valor => {
  const t = texto(valor);
  if (!t) {
    return null;
  }
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const campo = (bloco, rotulo) => {
  const m = bloco.match(new RegExp(`<b>${rotulo}:</b>\\s*([^<]*)`, 'i'));
  return m ? texto(m[1]) : null;
};

function notaAntesDe(html, posicao) {
  let nota = null;
  for (const m of html.slice(0, posicao).matchAll(RE_NOTA)) {
    nota = texto(m[1]);
  }
  return nota;
}

function lerItem(html, inicio, numeroDoItem) {
  const resto = html.slice(inicio);
  const fim = resto.slice(1).search(FIM_DO_ITEM);
  const bloco = fim >= 0 ? resto.slice(0, fim + 1) : resto;
  const produto = campo(bloco, 'Produto');
  const [codigo, ...nome] = (produto || '').split(' - ');
  return {
    item: Number(numeroDoItem),
    nota_fiscal: notaAntesDe(html, inicio),
    produto_codigo: nome.length ? texto(codigo) : null,
    produto: nome.length ? texto(nome.join(' - ')) : produto,
    complemento: campo(bloco, 'Complemento'),
    unidade: campo(bloco, 'Unidade'),
    marca: campo(bloco, 'Marca'),
    quantidade: numero(campo(bloco, 'Quantidade')),
    valor_unitario: numero(campo(bloco, 'Valor Unitário')),
    valor_total: numero(campo(bloco, 'Total')),
  };
}

function parseItensDespesa(html) {
  const pagina = String(html ?? '');
  return [...pagina.matchAll(RE_ITEM)].map(m => lerItem(pagina, m.index, m[1]));
}

module.exports = { parseItensDespesa };
