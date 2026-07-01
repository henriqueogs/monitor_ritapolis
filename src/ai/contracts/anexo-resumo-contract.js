'use strict';

// Contrato de saída da IA para resumo de anexo. Compatível com o shape já
// consumido por frontend/app/anexo/[id]/page.js (resumo_curto,
// pontos_relevantes[].tipo/subtipo/quantidade/unidade).

const { z } = require('zod');

// Modelos de IA às vezes devolvem quantidade como string formatada
// (BR: "12.400,00" ou simples: "60") em vez de number puro. Converte para
// number quando possível; vira null (não derruba o resumo inteiro) quando
// não é um número reconhecível.
function coagirQuantidade(valor) {
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

const AnexoResumoContract = z.object({
  resumo_curto: z.string().trim().min(10).max(600),
  pontos_relevantes: z.array(z.object({
    tipo: z.string().trim().min(1).max(60),
    subtipo: z.string().trim().max(60).optional(),
    descricao: z.string().trim().max(300).optional(),
    quantidade: z.preprocess(coagirQuantidade, z.number().nullable()).optional(),
    unidade: z.string().trim().max(40).nullable().optional(),
  })).max(10).default([]),
  lacunas: z.array(z.string().trim().min(1).max(300)).default([]),
  confianca: z.number().min(0).max(1),
});

function validateAnexoResumo(value) {
  const parsed = AnexoResumoContract.safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'raiz'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Resumo de anexo fora do contrato: ${issues}`);
  }
  return parsed.data;
}

module.exports = { AnexoResumoContract, validateAnexoResumo };
