'use strict';

/**
 * Vertente "compras repetidas": mesmo credor PJ e mesmo objeto, empenhos originais em janela
 * curta, cada um abaixo do limite de dispensa do ano e somando acima dele, sem contrato, ata ou
 * licitação do credor localizados no acervo. O achado é a lacuna de instrumento (fato
 * verificável), não a suspeita de fracionamento: recorrência com instrumento é esperada.
 * Contexto: { empenhos, credoresComInstrumento: Set<cnpj só dígitos> } já carregados.
 */

const { limiteDispensa, motivoExclusao, CATEGORIAS_LIMITE } = require('../limites-dispensa');
const { formatBRL } = require('../tipos');
const { evidenciaEmpenho } = require('./execucao-contratual');
const { citacoesDoHistorico, resumirCitacoes, frasesDasCitacoes } = require('./citacoes');

const TIPO_ORIGINAL = 'EO';
const JANELA_DIAS = 90;
const MIN_DATAS = 4;
const MAX_EVIDENCIAS = 10;
const OBJETOS_NO_TEXTO = 2;
const TOKENS_NO_OBJETO = 3;
const TAMANHO_MIN_TOKEN = 4;
const MS_DIA = 86400000;
const CENTAVOS = 100;
const MOEDA = 'R$';

const CAMPOS_A_VERIFICAR = [
  'soma e datas dos empenhos',
  'existência de contrato ou ata para o objeto',
  'se o objeto é o mesmo nos empenhos',
];

const PALAVRAS_VAZIAS = new Set([
  'para',
  'pela',
  'pelo',
  'como',
  'dessa',
  'desse',
  'municipal',
  'prefeitura',
  'municipio',
  'aquisicao',
  'compra',
  'fornecimento',
  'requisicao',
  'pagamento',
  'referente',
  'objeto',
  'conforme',
  'valor',
  'nota',
  'fiscal',
  'material',
  'materiais',
  'servico',
  'servicos',
  'processo',
  'despesa',
  'empenho',
  'empenha',
  'empenhado',
  'contratacao',
  'empresa',
  'destinado',
  'atender',
]);

const semAcento = texto => texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
const soDigitos = valor => String(valor ?? '').replace(/\D/g, '');
const arredonda = n => Math.round(n * CENTAVOS) / CENTAVOS;
const diasEntre = (a, b) => (Date.parse(b) - Date.parse(a)) / MS_DIA;

function chaveDoObjeto(historico) {
  const tokens = semAcento(String(historico || '').toLowerCase())
    .split(/[^a-z]+/)
    .filter(t => t.length >= TAMANHO_MIN_TOKEN && !PALAVRAS_VAZIAS.has(t));
  return tokens.slice(0, TOKENS_NO_OBJETO).join(' ');
}

function ehCandidatoValido(e) {
  const original = String(e.tipo || '')
    .toUpperCase()
    .startsWith(TIPO_ORIGINAL);
  if (!original || !e.data_empenho) {
    return false;
  }
  return !motivoExclusao({ credor_documento: e.credor_cnpj, historico: e.historico });
}

// Empenho que cita um processo presente no acervo já tem instrumento localizado: fica de fora.
function elegiveis(empenhos, processosNoAcervo) {
  return empenhos
    .filter(ehCandidatoValido)
    .filter(e => !processosNoAcervo.has(citacoesDoHistorico(e.historico).processo))
    .map(e => ({
      ...e,
      _chave: chaveDoObjeto(e.historico),
      _limite: limiteDispensa(e.exercicio_orcamento, CATEGORIAS_LIMITE.OUTROS),
    }))
    .filter(e => e._chave && e._limite && e.valor > 0 && e.valor < e._limite.valor);
}

function agrupar(lista) {
  const grupos = new Map();
  for (const e of lista) {
    const k = `${soDigitos(e.credor_cnpj)}|${e._chave}|${e.exercicio_orcamento}`;
    if (!grupos.has(k)) {
      grupos.set(k, []);
    }
    grupos.get(k).push(e);
  }
  return grupos;
}

function janelaDe(ordenados, inicio) {
  const janela = [ordenados[inicio]];
  for (let j = inicio + 1; j < ordenados.length; j += 1) {
    if (diasEntre(ordenados[inicio].data_empenho, ordenados[j].data_empenho) > JANELA_DIAS) {
      break;
    }
    janela.push(ordenados[j]);
  }
  return janela;
}

function janelasQueAtingem(grupo) {
  const ordenados = [...grupo].sort((a, b) => a.data_empenho.localeCompare(b.data_empenho));
  const limite = ordenados[0]._limite.valor;
  const achadas = [];
  let i = 0;
  while (i < ordenados.length) {
    const janela = janelaDe(ordenados, i);
    const datas = new Set(janela.map(e => e.data_empenho));
    const soma = janela.reduce((t, e) => t + e.valor, 0);
    if (datas.size >= MIN_DATAS && soma >= limite) {
      achadas.push(janela);
      i += janela.length;
    } else {
      i += 1;
    }
  }
  return achadas;
}

// Janelas do mesmo credor e ano que se sobrepõem no tempo viram um só achado (o mesmo
// fornecedor aparece por vários objetos: veículo, caminhão, retroescavadeira...).
function consolidar(janelas) {
  const porInicio = janelas
    .map(j => ({ inicio: j[0].data_empenho, fim: j[j.length - 1].data_empenho, empenhos: j }))
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
  const grupos = [];
  for (const j of porInicio) {
    const atual = grupos[grupos.length - 1];
    if (atual && j.inicio <= atual.fim) {
      atual.empenhos.push(...j.empenhos);
      atual.fim = j.fim > atual.fim ? j.fim : atual.fim;
    } else {
      grupos.push({ inicio: j.inicio, fim: j.fim, empenhos: [...j.empenhos] });
    }
  }
  return grupos.map(g => {
    const empenhos = g.empenhos.sort((a, b) => a.data_empenho.localeCompare(b.data_empenho));
    const objetos = [...new Set(empenhos.map(e => e._chave))];
    const rotulos = objetos.map(k =>
      rotuloDoObjeto(empenhos.find(e => e._chave === k).historico, k)
    );
    return { empenhos, objetos, rotulos };
  });
}

const dataBR = iso => iso.split('-').reverse().join('/');

// A chave de objeto é interna (sem acento); o texto ao cidadão usa as palavras como foram
// escritas no histórico do empenho.
function rotuloDoObjeto(historico, chave) {
  const palavras = String(historico || '')
    .toLowerCase()
    .split(/[^\p{L}]+/u);
  return chave
    .split(' ')
    .map(token => palavras.find(p => semAcento(p) === token) || token)
    .join(' ');
}

function frasesLimite(primeiro, limite) {
  if (!limite.estimado) {
    return `(limite de dispensa de ${primeiro.exercicio_orcamento})`;
  }
  return (
    `(limite de dispensa de ${limite.ano}, o último atualizado por decreto na tabela do sistema; ` +
    `o de ${primeiro.exercicio_orcamento} ainda não consta nela)`
  );
}

function textos({ janela, soma, rotulos, frases }) {
  const primeiro = janela[0];
  const ultimo = janela[janela.length - 1];
  const objeto = rotulos.slice(0, OBJETOS_NO_TEXTO).join('; ');
  const outros = rotulos.length > OBJETOS_NO_TEXTO ? ' e outros' : '';
  const periodo = `${dataBR(primeiro.data_empenho)} e ${dataBR(ultimo.data_empenho)}`;
  const parcial =
    janela.length > MAX_EVIDENCIAS
      ? ` Abaixo estão os ${MAX_EVIDENCIAS} maiores empenhos entre os ${janela.length}; a soma considera todos.`
      : '';
  return {
    titulo:
      `${primeiro.credor_nome}: ${janela.length} empenhos (${objeto}${outros}) entre ${periodo} ` +
      `somam ${formatBRL(soma)}, sem contrato ou ata localizados no acervo`,
    narrativa:
      `O sistema encontrou ${janela.length} empenhos originais de ${primeiro.credor_nome} para ` +
      `objetos semelhantes ("${objeto}${outros}") entre ${periodo}, cada um abaixo de ` +
      `${formatBRL(primeiro._limite.valor)} ${frasesLimite(primeiro, primeiro._limite)}, ` +
      `somando ${formatBRL(soma)}. ${frases.achado} A recorrência pode ter explicação ` +
      '(instrumento publicado fora do acervo, necessidade contínua); confira os empenhos e ' +
      `se existe instrumento para o objeto.${parcial}`,
  };
}

function maioresEvidencias(janela) {
  return [...janela]
    .sort((a, b) => b.valor - a.valor)
    .slice(0, MAX_EVIDENCIAS)
    .sort((a, b) => a.data_empenho.localeCompare(b.data_empenho))
    .map(evidenciaEmpenho);
}

function janelaParaCandidato({ empenhos: janela, objetos, rotulos }) {
  const primeiro = janela[0];
  const ultimo = janela[janela.length - 1];
  const soma = arredonda(janela.reduce((t, e) => t + e.valor, 0));
  const limite = primeiro._limite;
  const cnpj = soDigitos(primeiro.credor_cnpj);
  const citacoes = resumirCitacoes(janela);
  const frases = frasesDasCitacoes(citacoes);
  return {
    objeto: `${cnpj}|${primeiro.exercicio_orcamento}|${primeiro.data_empenho}`,
    ...textos({ janela, soma, rotulos, frases }),
    categoria: 'Compras e contratações',
    metrica: {
      nome: 'soma_janela',
      unidade: MOEDA,
      valor: soma,
      empenhos: janela.length,
      limite: limite.valor,
      limite_estimado: limite.estimado,
    },
    evidencias: maioresEvidencias(janela),
    periodo: { inicio: primeiro.data_empenho, fim: ultimo.data_empenho },
    severidade: frases.severidade,
    questionamentos: [
      'Existe contrato, ata de registro de preços ou licitação cobrindo esse objeto no período?',
      'Os empenhos se referem de fato ao mesmo objeto?',
    ],
    campos_a_verificar: CAMPOS_A_VERIFICAR,
    alerta: {
      tipo: 'compras_repetidas',
      subcategoria: 'compras_repetidas_sem_instrumento',
      valor_periodo_label: `Empenhado entre ${dataBR(primeiro.data_empenho)} e ${dataBR(ultimo.data_empenho)}`,
      metadados: {
        regra: 'compras_repetidas_sem_instrumento',
        unidade: MOEDA,
        credor_cnpj: cnpj,
        credor_nome: primeiro.credor_nome,
        objetos_chave: objetos,
        processos_citados: citacoes.processos,
        adesoes_citadas: citacoes.adesoes,
        campos_a_verificar: CAMPOS_A_VERIFICAR,
      },
    },
  };
}

function detectar({
  empenhos = [],
  credoresComInstrumento = new Set(),
  processosNoAcervo = new Set(),
} = {}) {
  const porCredorAno = new Map();
  for (const grupo of agrupar(elegiveis(empenhos, processosNoAcervo)).values()) {
    const cnpj = soDigitos(grupo[0].credor_cnpj);
    if (credoresComInstrumento.has(cnpj)) {
      continue;
    }
    const k = `${cnpj}|${grupo[0].exercicio_orcamento}`;
    porCredorAno.set(k, [...(porCredorAno.get(k) || []), ...janelasQueAtingem(grupo)]);
  }
  return [...porCredorAno.values()].flatMap(janelas =>
    consolidar(janelas).map(janelaParaCandidato)
  );
}

module.exports = {
  nome: 'compras-repetidas',
  versao: 1,
  criterio:
    'Quatro ou mais empenhos do mesmo credor (pessoa jurídica) e objeto semelhante em até 90 dias, cada um abaixo do limite de dispensa do ano e somando acima dele, sem contrato, ata ou licitação do credor no acervo.',
  detectar,
  chaveDoObjeto,
};
