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
const ItemSolicitadoSchema = z.object({
  item_numero: z.string().trim().max(20).nullable().optional(),
  descricao: z.string().trim().min(1).max(400),
  quantidade: numeroCoagido.optional(),
  unidade: z.string().trim().max(40).nullable().optional(),
  valor_estimado: numeroCoagido.optional(),
  trecho_fonte: z.string().trim().min(1).max(500),
});

const ResultadoLoteSchema = z.object({
  lote_numero: z.string().trim().max(20).nullable().optional(),
  objeto: z.string().trim().min(1).max(400),
  fornecedor_nome: z.string().trim().max(200).nullable().optional(),
  fornecedor_cnpj: z.string().trim().max(20).nullable().optional(),
  teto_homologado: numeroCoagido.optional(),
  trecho_fonte: z.string().trim().min(1).max(500),
});

const ResultadoGlobalSchema = z.object({
  descricao: z.string().trim().min(1).max(400),
  valor: numeroCoagido.optional(),
  fornecedor_nome: z.string().trim().max(200).nullable().optional(),
  fornecedor_cnpj: z.string().trim().max(20).nullable().optional(),
  trecho_fonte: z.string().trim().min(1).max(500),
});

const ItensProcessoContract = z.object({
  tem_tabela_itens: z.boolean(),
  itens_solicitados: z.array(ItemSolicitadoSchema).max(MAX_LINHAS).default([]),
  resultado_lotes: z.array(ResultadoLoteSchema).max(MAX_LINHAS).default([]),
  resultado_global: ResultadoGlobalSchema.nullable().default(null),
  lacunas: z.array(z.string().trim().min(1).max(400)).default([]),
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
