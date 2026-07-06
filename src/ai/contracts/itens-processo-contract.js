'use strict';

// Contrato de saída da IA para reextração completa dos itens de um processo
// (edital + atas vinculadas). Mira o MESMO shape de 3 blocos já consumido
// pelo frontend (src/licitacoes/itens-processo-view.js): itens_solicitados,
// resultado_lotes, resultado_global. `tem_tabela_itens=false` é a saída
// esperada quando o texto não é uma lista de itens (ex.: doc 605 é
// cronograma de medição de obra) — nunca inventar item de outra natureza.

const { z } = require('zod');

const MAX_LINHAS = 200;

// Mesma coerção BR usada no contrato de resumo de anexo — modelos de IA às
// vezes devolvem "12.400,00" em vez de number puro.
function coagirNumero(valor) {
  if (valor === null || valor === undefined || valor === '') {
    return null;
  }
  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? valor : null;
  }
  const texto = String(valor).trim();
  const normalizado = /\d{1,3}(\.\d{3})+,\d+$/.test(texto)
    ? texto.replace(/\./g, '').replace(',', '.')
    : texto.replace(',', '.');
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : null;
}

const numeroCoagido = z.preprocess(coagirNumero, z.number().nullable());

// trecho_fonte é obrigatório em toda linha — §11.3, a IA não pode inventar
// sem apontar de onde tirou o dado.
// Limites com folga sobre o pedido no prompt (~400/~500) — o modelo às vezes
// excede a instrução de conciseção; rejeitar por isso perde o resultado
// inteiro sem necessidade.
const MAX_DESCRICAO = 600;
const MAX_TRECHO_FONTE = 700;

// A IA nem sempre respeita o limite pedido (e às vezes escreve a sentinela
// "Não especificado..." em campos curtos como cnpj/lote_numero). Rejeitar o
// resultado inteiro por isso jogaria fora itens/lotes corretos — truncamos
// com marcador em vez de inventar ou de descartar o dado inteiro.
function truncarComMarca(max) {
  return (valor) => {
    // item_numero/lote_numero às vezes vêm como number puro ("1" virou 1) —
    // coage pra string antes de truncar, senão a validação de string falha.
    if (typeof valor === 'number') {return String(valor);}
    if (typeof valor !== 'string') {return valor;}
    const t = valor.trim();
    if (t.length <= max) {return t;}
    return `${t.slice(0, max - 1)}…`;
  };
}

function textoTruncado(max) {
  return z.preprocess(truncarComMarca(max), z.string().max(max));
}

function textoTruncadoObrigatorio(max) {
  return z.preprocess(truncarComMarca(max), z.string().min(1).max(max));
}

const ItemSolicitadoSchema = z.object({
  item_numero: textoTruncado(20).nullable().optional(),
  descricao: textoTruncadoObrigatorio(MAX_DESCRICAO),
  quantidade: numeroCoagido.optional(),
  unidade: textoTruncado(40).nullable().optional(),
  valor_estimado: numeroCoagido.optional(),
  trecho_fonte: textoTruncadoObrigatorio(MAX_TRECHO_FONTE),
});

const ResultadoLoteSchema = z.object({
  lote_numero: textoTruncado(20).nullable().optional(),
  objeto: textoTruncadoObrigatorio(MAX_DESCRICAO),
  fornecedor_nome: textoTruncado(200).nullable().optional(),
  fornecedor_cnpj: textoTruncado(20).nullable().optional(),
  teto_homologado: numeroCoagido.optional(),
  trecho_fonte: textoTruncadoObrigatorio(MAX_TRECHO_FONTE),
});

const ResultadoGlobalSchema = z.object({
  descricao: textoTruncadoObrigatorio(MAX_DESCRICAO),
  valor: numeroCoagido.optional(),
  fornecedor_nome: textoTruncado(200).nullable().optional(),
  fornecedor_cnpj: textoTruncado(20).nullable().optional(),
  trecho_fonte: textoTruncadoObrigatorio(MAX_TRECHO_FONTE),
});

// .default([]) do zod só entra quando a chave está ausente (undefined) — a
// IA às vezes manda null explícito, que passaria direto sem o preprocess.
const arrayOuNull = (schema) => z.preprocess((v) => v ?? [], z.array(schema).max(MAX_LINHAS));

const ItensProcessoContract = z.object({
  tem_tabela_itens: z.boolean(),
  itens_solicitados: arrayOuNull(ItemSolicitadoSchema),
  resultado_lotes: arrayOuNull(ResultadoLoteSchema),
  resultado_global: ResultadoGlobalSchema.nullable().default(null),
  lacunas: arrayOuNull(z.string().trim().min(1).max(400)),
  confianca: z.number().min(0).max(1),
});

function validateItensProcesso(value) {
  const parsed = ItensProcessoContract.safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'raiz'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Itens do processo fora do contrato: ${issues}`);
  }
  return parsed.data;
}

module.exports = { ItensProcessoContract, validateItensProcesso, MAX_LINHAS };
