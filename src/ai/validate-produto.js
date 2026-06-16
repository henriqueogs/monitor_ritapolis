'use strict';

// Validação de produto extraído conferindo os campos contra o trecho da fonte
// (a ata/resultado de onde foi extraído). Substitui a revisão manual: a IA
// responde se o extraído confere com a fonte, e o veredito vira status_revisao.

const { parseSummaryResponse } = require('./validate-summary');

function fmtValor(v) {
  return v === null || v === undefined ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function buildValidacaoProdutoPrompt(produto) {
  const campos = [
    `- Descrição: ${produto.descricao || '—'}`,
    `- Unidade: ${produto.unidade || '—'}`,
    `- Quantidade: ${produto.quantidade ?? '—'}`,
    `- Valor unitário final: ${fmtValor(produto.valor_unitario_final)}`,
    `- Valor total final: ${fmtValor(produto.valor_total_final)}`,
    `- Fornecedor: ${produto.fornecedor_nome || '—'}`,
  ].join('\n');

  return [
    'Você confere a qualidade de dados extraídos de licitações municipais.',
    'Abaixo há CAMPOS EXTRAÍDOS de um item e o TRECHO DA FONTE de onde foram extraídos.',
    'Decida se os campos extraídos correspondem ao que o trecho realmente diz.',
    '',
    'CAMPOS EXTRAÍDOS:',
    campos,
    '',
    'TRECHO DA FONTE:',
    `"""${(produto.trecho_fonte || '').slice(0, 1200)}"""`,
    '',
    'Regra importante: campos extraídos com "—" estão AUSENTES e NÃO devem ser',
    'cobrados — uma extração fiel pode ter só a descrição. Julgue apenas se o que',
    'FOI extraído é coerente com o trecho. O sinal principal é a descrição.',
    '',
    'Responda SOMENTE em JSON, sem markdown:',
    '{"confere": "sim|nao|parcial", "motivo": "explicação curta"}',
    '- "sim": a descrição corresponde ao trecho e nenhum campo presente o contradiz',
    '  (campos ausentes "—" não impedem o "sim").',
    '- "nao": há contradição clara — descrição, valor ou fornecedor divergem do trecho.',
    '- "parcial": o próprio trecho não permite nem confirmar o produto descrito.',
  ].join('\n');
}

const SIM = new Set(['sim', 's', 'true', 'ok', 'confere']);
const NAO = new Set(['nao', 'n', 'false', 'incorreto', 'nao_confere']);

function normalizar(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// Mapeia a resposta da IA para status_revisao. Conservador: qualquer coisa que
// não seja um "sim"/"nao" claro vira 'pendente' (vai para revisão humana).
function interpretarVeredito(parsed) {
  const motivo = String(parsed?.motivo || '');
  const confere = normalizar(parsed?.confere);

  if (SIM.has(confere)) {
    return { status: 'validado', motivo };
  }
  if (NAO.has(confere)) {
    return { status: 'rejeitado', motivo };
  }
  return { status: 'pendente', motivo };
}

async function validarProdutoComIA(produto, { provider }) {
  const prompt = buildValidacaoProdutoPrompt(produto);
  const raw = await provider.generateJson({ prompt, temperature: 0 });
  const parsed = parseSummaryResponse(raw);
  return interpretarVeredito(parsed);
}

module.exports = {
  buildValidacaoProdutoPrompt,
  interpretarVeredito,
  validarProdutoComIA,
};
