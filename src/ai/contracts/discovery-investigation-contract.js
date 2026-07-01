'use strict';

const { z } = require('zod');

const textoPublico = z.string().trim().min(1).max(1400);

const DiscoveryInvestigationContract = z.object({
  hipotese_publica: textoPublico,
  // Narrativa consolidada (opcional): parágrafo único que já incorpora os
  // fatos relevantes e a lacuna relevante em prosa corrida — a leitura
  // principal do público quando presente. `o_que_os_dados_mostram`/
  // `lacunas_encontradas` continuam existindo como evidência de apoio
  // (auditável), não como o texto em destaque. Opcional para não quebrar a
  // leitura de investigações já geradas antes deste campo existir.
  narrativa_consolidada: textoPublico.optional(),
  o_que_os_dados_mostram: z.array(textoPublico).min(1).max(8),
  lacunas_encontradas: z.array(textoPublico).default([]),
  perguntas_abertas: z.array(textoPublico).default([]),
  evidencias_usadas: z.array(z.object({
    documento_id: z.number().int().positive().nullable().optional(),
    anexo_id: z.number().int().positive().nullable().optional(),
    descricao: textoPublico,
  })).min(1).max(12),
  nivel_confianca: z.number().min(0).max(1),
  analise_admin: z.string().trim().min(1).max(3000),
});

const DiscoveryInvestigationV2Contract = DiscoveryInvestigationContract.extend({
  tema: z.string().trim().min(1).max(120).optional(),
  tipo_investigacao: z.string().trim().min(1).max(160).optional(),
  metricas: z.record(z.string(), z.any()).optional(),
  comparativos: z.record(z.string(), z.any()).optional(),
  documentos_relacionados: z.array(z.object({
    documento_id: z.number().int().positive(),
    papel: z.string().trim().min(1).max(120).optional(),
    observacao: z.string().trim().max(500).optional(),
  })).default([]),
  campos_a_verificar: z.array(textoPublico).default([]),
  limites_publicacao: z.array(textoPublico).default([]),
});

const TERMOS_ACUSATORIOS_PUBLICOS = [
  /\birregularidade\b/i,
  /\bcrime\b/i,
  /\bfraude\b/i,
  /\bcorrupt/i,
  /\bilegal\b/i,
  /\bsuspeit/i,
  /\bdenuncia\b/i,
  /\bdenuncia\b/i,
];

function assertPublicoCauteloso(data) {
  const campos = [
    data.hipotese_publica,
    data.narrativa_consolidada || '',
    ...(data.o_que_os_dados_mostram || []),
    ...(data.lacunas_encontradas || []),
    ...(data.perguntas_abertas || []),
  ].join('\n');

  const termo = TERMOS_ACUSATORIOS_PUBLICOS.find((regex) => regex.test(campos));
  if (termo) {
    throw new Error(`Investigacao publica contem termo acusatorio: ${termo}`);
  }
}

function validateDiscoveryInvestigation(value) {
  const parsed = DiscoveryInvestigationV2Contract.safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'raiz'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Investigacao de descoberta fora do contrato: ${issues}`);
  }
  assertPublicoCauteloso(parsed.data);
  return parsed.data;
}

module.exports = {
  DiscoveryInvestigationContract,
  DiscoveryInvestigationV2Contract,
  validateDiscoveryInvestigation,
  assertPublicoCauteloso,
};
