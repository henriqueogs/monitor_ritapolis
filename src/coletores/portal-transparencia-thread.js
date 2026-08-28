'use strict';

/**
 * Coleta de despesas do Portal da Transparência via o fluxo "thread" que a
 * página humana usa (sessão + token por carregamento + geração assíncrona +
 * exportação CSV), em vez do endpoint JSON /api/relatorios/despesa.
 *
 * Motivo: o endpoint JSON documentado quebrou no lado do portal (SH3) em
 * algo entre 30/07/2026 e 28/08/2026 — devolve HTML em vez de JSON pra
 * qualquer requisição válida, reproduzido de 3 origens de rede diferentes.
 * Ver memory reference_portal_transparencia_fluxo_thread para o fluxo
 * completo mapeado.
 *
 * ponytail: o CSV do relatório resumido não traz CNPJ do credor nem
 * histórico/categoria econômica — só a página de detalhamento por empenho
 * tem isso. Por isso cada despesa exige uma requisição extra (mais lento,
 * mais educado com o servidor deles do que não fazer nada).
 */

const BASE_URL = 'https://pt.ritapolis.mg.gov.br';

// ---------------------------------------------------------------------------
// Parsing puro — sem I/O, o que garante a maior parte dos testes
// ---------------------------------------------------------------------------

function extrairTokens(html) {
  const texto = String(html || '');
  const match = texto.match(/SHA1_TOKEN=([a-f0-9]+)&INT_TOKEN=(\d+)/);
  if (!match) {
    return null;
  }
  return { sha1Token: match[1], intToken: match[2] };
}

function parseValorCsv(raw) {
  const texto = String(raw || '').trim();
  if (!texto || texto === '-') {
    return null;
  }
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : null;
}

/**
 * Faz o parse de uma linha de CSV respeitando aspas (campos podem conter
 * vírgula dentro de aspas, embora não seja comum nesses relatórios).
 */
function parseLinhaCsv(linha) {
  const campos = [];
  let atual = '';
  let dentroDeAspas = false;
  for (let i = 0; i < linha.length; i += 1) {
    const char = linha[i];
    if (char === '"') {
      dentroDeAspas = !dentroDeAspas;
    } else if (char === ',' && !dentroDeAspas) {
      campos.push(atual);
      atual = '';
    } else {
      atual += char;
    }
  }
  campos.push(atual);
  return campos;
}

/**
 * Converte "00003 - BANCO DO BRASIL S/A" em "BANCO DO BRASIL S/A" — o CSV só
 * tem o código interno do credor, não o CNPJ (isso só vem no detalhamento).
 */
function nomeCredorDoCsv(campo) {
  const texto = String(campo || '').trim();
  const match = texto.match(/^\d+\s*-\s*(.+)$/);
  return match ? match[1].trim() : texto || null;
}

/**
 * @returns {{empenho, ehOP, credorNomeParcial, tipo, dataEmpenho, dataLiquidacao, dataPagamento, valor}[]}
 *   `empenho` já normalizado (sem "/ ano"), pronto pra chave (exercicio, empenho).
 *   Linhas com tipo 'OP' são puladas — colidem no mesmo número de empenho que
 *   a linha 'EO' correspondente e nossa tabela só guarda uma por empenho.
 */
// Só isso é uma linha de despesa de verdade. O CSV termina com rodapé de
// soma ("Total Geral (*)", "Total Orçamentário", ...) e uma linha de legenda
// — nenhum formato ali bate com "NNNNN-NNN / AAAA", então valida por
// whitelist em vez de tentar listar cada variante de lixo conhecida.
const EMPENHO_VALIDO = /^\d{5}-\d{3}\s*\/\s*\d{4}$/;

function parseCsvDespesas(csvText) {
  const linhas = String(csvText || '').split(/\r?\n/).filter(Boolean);
  const despesas = [];

  for (let i = 1; i < linhas.length; i += 1) {
    const campos = parseLinhaCsv(linhas[i]);
    const [empenhoRaw, credor, tipo, , , dataEmpenho, dataLiquidacao, dataPagamento, valorEmpenhado, , valorPago] = campos;

    if (!empenhoRaw || !EMPENHO_VALIDO.test(empenhoRaw)) {
      continue;
    }
    if (tipo === 'OP') {
      continue;
    }

    const empenho = empenhoRaw.split('/')[0].trim();
    despesas.push({
      empenho,
      credorNomeParcial: nomeCredorDoCsv(credor),
      tipo: tipo || null,
      dataEmpenho: dataEmpenho || null,
      dataLiquidacao: dataLiquidacao || null,
      dataPagamento: dataPagamento || null,
      valor: parseValorCsv(valorEmpenhado) ?? parseValorCsv(valorPago) ?? 0,
    });
  }

  return despesas;
}

/**
 * Extrai os campos ricos (função, categoria, credor+CNPJ, histórico) da
 * página /Relatorios/Detalhamento_Despesa.php.
 * @returns {object|null} formato compatível com `dadosPrincipais` de
 *   `upsertDespesa` (src/db/transparencia-repo.js).
 */
function parseDetalhamentoDespesa(html) {
  const texto = String(html || '');
  // Entre o rótulo e o valor há mistura de tags (</b>, <B>) e &nbsp; —
  // ex: "Número:</b>&nbsp;<B>00001-000</B>". Pula tudo isso, captura
  // só o texto até a próxima tag.
  const campo = (rotulo) => {
    const escapado = rotulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = texto.match(new RegExp(`${escapado}:(?:\\s|&nbsp;|</?[a-zA-Z][^>]*>)*([^<]+)`, 'i'));
    return match ? match[1].replace(/&nbsp;/g, ' ').trim() : null;
  };

  if (!campo('Número')) {
    return null;
  }

  const beneficiario = campo('Beneficiário');
  const cnpj = campo('CPF/CNPJ');
  const credor = beneficiario ? `${beneficiario}${cnpj ? ` - CPF/CNPJ: ${cnpj}` : ''}` : null;

  return {
    unidade: campo('Unidade'),
    funcao: campo('Função'),
    subfuncao: campo('Subfunção'),
    programa: campo('Programa'),
    projetoAtividade: campo('Projeto Atividade'),
    categoriaEconomica: campo('Categoria Econômica'),
    fonteDeRecurso: campo('Fonte de Recurso'),
    coTce: campo('CO TCE'),
    coAux: campo('CO AUX'),
    credor,
    historico: campo('Histórico'),
  };
}

module.exports = {
  BASE_URL,
  extrairTokens,
  parseValorCsv,
  parseCsvDespesas,
  nomeCredorDoCsv,
  parseDetalhamentoDespesa,
};
