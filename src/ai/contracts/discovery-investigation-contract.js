'use strict';

const { z } = require('zod');

const textoPublico = z.string().trim().min(1).max(1400);

const DiscoveryInvestigationContract = z.object({
  hipotese_publica: textoPublico,
  // Camada "cidadã" (opcional, aditiva): o texto que o público lê primeiro.
  // pergunta_cidada vira o título; resposta_direta, a frase de abertura;
  // por_que_olhar, o motivo em uma linha. Opcionais para não invalidar
  // investigações geradas antes destes campos existirem.
  pergunta_cidada: z.string().trim().min(1).max(160),
  resposta_direta: textoPublico,
  por_que_olhar: textoPublico,
  // Narrativa consolidada (opcional): parágrafo único que já incorpora os
  // fatos relevantes e a lacuna relevante em prosa corrida — a leitura
  // principal do público quando presente. `o_que_os_dados_mostram`/
  // `lacunas_encontradas` continuam existindo como evidência de apoio
  // (auditável), não como o texto em destaque. Opcional para não quebrar a
  // leitura de investigações já geradas antes deste campo existir.
  narrativa_consolidada: textoPublico,
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
    data.pergunta_cidada || '',
    data.resposta_direta || '',
    data.por_que_olhar || '',
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

// O modelo às vezes devolve a chave com typo ("evidencias_usada", sem o s final)
// com o conteúdo correto (observado em 07/10/2026: 9 de 20 candidatos do lote 1
// ficaram presos em AI_PROVIDER_ERROR). Só renomeia a chave; a forma e o
// conteúdo continuam validados pelo contrato.
function normalizarChaves(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) { return value; }
  if (value.evidencias_usadas !== undefined || value.evidencias_usada === undefined) { return value; }
  const { evidencias_usada: evidencias, ...resto } = value;
  return { ...resto, evidencias_usadas: evidencias };
}

function validateDiscoveryInvestigation(value) {
  const parsed = DiscoveryInvestigationV2Contract.safeParse(normalizarChaves(value));
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
