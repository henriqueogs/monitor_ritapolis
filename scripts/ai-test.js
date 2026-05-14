const config = require('../src/config');
const { createAiProvider } = require('../src/ai/providers');
const { parseSummaryResponse, validateSummary } = require('../src/ai/validate-summary');

async function main() {
  if (!config.aiSummaryEnabled) {
    throw new Error('AI_SUMMARY_ENABLED=false. Habilite a camada de IA no .env para executar o teste.');
  }

  const provider = createAiProvider();
  const prompt = `Retorne somente JSON valido no contrato solicitado.
{
  "tipo_documento": "outro",
  "titulo_curto": "Teste de conectividade",
  "resumo_cidadao": "Teste simples de conectividade com o provider.",
  "resumo_tecnico": "Teste tecnico de retorno JSON valido.",
  "pontos_principais": ["Conectividade validada"],
  "datas_relevantes": [],
  "valores": [],
  "partes_envolvidas": [],
  "objeto": { "descricao": null, "trecho_fonte": null },
  "riscos_ou_alertas": [],
  "campos_nao_encontrados": [],
  "confianca": 0.5
}`;

  const raw = await provider.generateJson({ prompt, temperature: 0 });
  const parsed = parseSummaryResponse(raw);
  validateSummary(parsed);

  console.log('IA configurada com sucesso.');
  console.log(`Provider: ${provider.provider}`);
  console.log(`Modelo: ${provider.model}`);
  console.log('JSON de teste validado.');
}

main().catch((error) => {
  console.error(`Falha no teste da IA: ${error.message}`);
  process.exitCode = 1;
});
