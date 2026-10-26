'use strict';

// Categoria de uma falha de IA a partir da mensagem do erro. Puro e sem
// dependências: também é carregado pelo diagnóstico da VM
// (scripts/vm-diagnostico.sh), que roda fora do app e não pode ler config/.env.

function classifyAiError(error) {
  const message = String(error || '');
  if (!message) {return 'sem_erro';}
  if (/maxContentLength|maxBodyLength|excede o limite|limite de disco|limite seguro|limite de texto|limite de .* caracteres/i.test(message)) { return 'limite_tamanho'; }
  if (/exige revisao|cobertura incompleta|nao consta na citacao|fonte mudou|checkpoint .* invalido|texto_baixa_qualidade_ocr|ausencia de tabela contradiz|documento sem arquivo oficial/i.test(message)) { return 'revisao_fonte'; }
  // Catálogo NVIDIA NIM aposenta modelos gratuitos sem aviso (410 "end of
  // life" ou 404 do modelo) — já derrubou o resumo 2x (ver config.nvidiaModel).
  if (/\b410\b|end of life|model[^\n]{0,80}not found|not found[^\n]{0,40}model/i.test(message)) {
    return 'modelo_indisponivel';
  }
  if (/timeout|timed out/i.test(message)) {return 'timeout';}
  if (/429|rate limit|too many requests/i.test(message)) {return 'limite_provider';}
  // Contrato estrito (validateItensProcessoStrict) rejeita de propósito a saída
  // incompleta da IA; o ZodError chega como lista JSON de issues.
  if (/^\s*\[\s*\{[\s\S]*"code"\s*:[\s\S]*"path"\s*:/.test(message)) {return 'contrato_rejeitado';}
  if (/contrato|zod|invalid|expected|required/i.test(message)) {return 'contrato_invalido';}
  if (/api key|unauthorized|401|403/i.test(message)) {return 'credencial';}
  if (/network|fetch|connect|econn|enotfound|eai_again/i.test(message)) {return 'rede';}
  if (/chunks/i.test(message)) {return 'limite_tamanho';}
  return 'outro';
}

module.exports = { classifyAiError };
