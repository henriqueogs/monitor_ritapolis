const { z } = require('zod');

const sourceTypeEnum = z.enum([
  'prefeitura',
  'pncp',
  'ata',
  'contrato',
  'produto',
  'grupo',
  'documento',
  'outro'
]);

const alertLevelEnum = z.enum(['baixo', 'medio', 'alto']);
const consistencyStatusEnum = z.enum(['consistente', 'divergente', 'incompleto', 'revisar']);

function normalizeSourceType(value) {
  const text = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!text) {return 'outro';}
  if (['prefeitura', 'site_prefeitura', 'municipio', 'cadastro_oficial'].includes(text)) {return 'prefeitura';}
  if (['pncp', 'portal_nacional'].includes(text)) {return 'pncp';}
  if (text.includes('ata')) {return 'ata';}
  if (text.includes('contrato')) {return 'contrato';}
  if (text.includes('produto') || text.includes('item') || text.includes('licitacoes_produtos')) {return 'produto';}
  if (text.includes('grupo') || text.includes('processo')) {return 'grupo';}
  if (text.includes('documento') || text.includes('pdf') || text.includes('edital')) {return 'documento';}
  return text;
}

const sourceRefSchema = z.object({
  fonte: z.preprocess(normalizeSourceType, sourceTypeEnum.catch('outro')),
  campo: z.string().trim().min(1),
  identificador: z
    .preprocess(
      (value) => (value === null || value === '' ? null : String(value)),
      z.string().trim().min(1).nullable()
    )
    .default(null)
});

const IntegratedReadingContract = z.object({
  contrato_versao: z.literal('2.0').default('2.0'),
  titulo: z.string().trim().min(1),
  leitura_integrada: z.string().trim().min(1),
  pontos_principais: z.array(z.string().trim().min(1)).default([]),
  consistencia: z
    .array(
      z.object({
        status: consistencyStatusEnum,
        campo: z.string().trim().min(1),
        descricao: z.string().trim().min(1),
        fontes: z.array(sourceRefSchema).default([])
      })
    )
    .default([]),
  alertas: z
    .array(
      z.object({
        nivel: alertLevelEnum,
        descricao: z.string().trim().min(1),
        fonte: sourceRefSchema.nullable().default(null)
      })
    )
    .default([]),
  lacunas: z
    .array(
      z.object({
        campo: z.string().trim().min(1),
        descricao: z.string().trim().min(1)
      })
    )
    .default([]),
  fontes_usadas: z.array(sourceRefSchema).default([]),
  confianca: z.number().min(0).max(1)
});

module.exports = {
  IntegratedReadingContract
};
