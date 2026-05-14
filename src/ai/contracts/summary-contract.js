const { z } = require('zod');

const tipoDocumentoEnum = z.enum([
  'edital',
  'decreto',
  'portaria',
  'lei',
  'contrato',
  'despesa',
  'ata',
  'outro'
]);

const dataTipoEnum = z.enum([
  'publicacao',
  'abertura',
  'vigencia',
  'homologacao',
  'assinatura',
  'outro'
]);

const valorTipoEnum = z.enum(['estimado', 'final', 'global', 'mensal', 'unitario', 'outro']);
const papelEnum = z.enum([
  'contratante',
  'contratado',
  'autoridade',
  'fornecedor',
  'orgao_publico',
  'outro'
]);
const nivelRiscoEnum = z.enum(['baixo', 'medio', 'alto']);

const SummaryContract = z.object({
  tipo_documento: tipoDocumentoEnum,
  titulo_curto: z.string().trim().min(1),
  resumo_cidadao: z.string().trim().min(1),
  resumo_tecnico: z.string().trim().min(1),
  pontos_principais: z.array(z.string().trim().min(1)).default([]),
  datas_relevantes: z
    .array(
      z.object({
        tipo: dataTipoEnum,
        data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
        descricao: z.string().trim().min(1),
        trecho_fonte: z.string().trim().min(1)
      })
    )
    .default([]),
  valores: z
    .array(
      z.object({
        tipo: valorTipoEnum,
        valor: z.number().finite(),
        moeda: z.string().trim().min(1).default('BRL'),
        descricao: z.string().trim().min(1),
        trecho_fonte: z.string().trim().min(1)
      })
    )
    .default([]),
  partes_envolvidas: z
    .array(
      z.object({
        nome: z.string().trim().min(1),
        papel: papelEnum,
        documento: z.string().trim().min(1).nullable(),
        trecho_fonte: z.string().trim().min(1)
      })
    )
    .default([]),
  objeto: z.object({
    descricao: z.string().trim().min(1).nullable(),
    trecho_fonte: z.string().trim().min(1).nullable()
  }),
  riscos_ou_alertas: z
    .array(
      z.object({
        nivel: nivelRiscoEnum,
        descricao: z.string().trim().min(1),
        motivo: z.string().trim().min(1)
      })
    )
    .default([]),
  campos_nao_encontrados: z.array(z.string().trim().min(1)).default([]),
  confianca: z.number().min(0).max(1)
});

module.exports = {
  SummaryContract
};
