'use strict';

/**
 * Limites de dispensa por valor (Lei 8.666 art. 24 até 2020; Lei 14.133 art. 75 desde 2021),
 * atualizados por decreto a cada ano, e a lista nomeada de gastos que as vertentes de
 * "compras repetidas" ignoram por construção (folha, tributos, concessionárias, pessoa física).
 *
 * Os valores vêm da legislação, não de dados do município: ano sem entrada usa o último
 * ano anterior e volta marcado `estimado`, para a vertente rotular isso em vez de fingir precisão.
 * Entradas copiadas dos decretos citados; confirmar contra o texto oficial ao incluir um ano novo.
 */

const CATEGORIAS_LIMITE = { OBRAS: 'obras', OUTROS: 'outros' };

const LIMITES_POR_ANO = {
  2019: { obras: 33000, outros: 17600, fonte: 'Decreto 9.412/2018 (Lei 8.666 art. 24)' },
  2020: { obras: 33000, outros: 17600, fonte: 'Decreto 9.412/2018 (Lei 8.666 art. 24)' },
  2021: { obras: 100000, outros: 50000, fonte: 'Lei 14.133/2021 art. 75 (valores-base)' },
  2023: { obras: 114416.65, outros: 57208.33, fonte: 'Decreto 11.317/2022' },
  2024: { obras: 119812.02, outros: 59906.02, fonte: 'Decreto 11.871/2023' },
  2025: { obras: 125451.15, outros: 62725.59, fonte: 'Decreto 12.343/2024' },
};

function limiteDispensa(ano, categoria) {
  const anos = Object.keys(LIMITES_POR_ANO)
    .map(Number)
    .filter(a => a <= ano)
    .sort((a, b) => b - a);
  const base = anos[0];
  const valor = base === undefined ? undefined : LIMITES_POR_ANO[base][categoria];
  if (valor === undefined) {
    return null;
  }
  return { ano: base, valor, estimado: base !== Number(ano), fonte: LIMITES_POR_ANO[base].fonte };
}

const MOTIVOS_EXCLUSAO = {
  PESSOA_FISICA: 'pessoa_fisica',
  PREVIDENCIA: 'previdencia',
  FOLHA: 'folha',
  TRIBUTOS: 'tributos',
  CONCESSIONARIA: 'concessionaria',
};

const TAMANHO_CNPJ = 14;

// Ordem importa: o primeiro padrão que casa dá o motivo.
const PADROES_EXCLUSAO = [
  [MOTIVOS_EXCLUSAO.PREVIDENCIA, /\b(inss|rpps|previdenc\w*|contribuicao patronal|fgts)\b/],
  [MOTIVOS_EXCLUSAO.FOLHA, /\b(folha de pagamento|folha pgto|salario\w*|13o salario|ferias)\b/],
  [MOTIVOS_EXCLUSAO.TRIBUTOS, /\b(iss|iptu|irrf|imposto\w*|tributo\w*|taxa de)\b/],
  [
    MOTIVOS_EXCLUSAO.CONCESSIONARIA,
    /\b(energia eletrica|energia|agua e esgoto|tarifa de agua|abastecimento de agua|saneamento|telefonia)\b/,
  ],
];

const normalizar = texto =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

function motivoExclusao({ credor_documento: documento, historico } = {}) {
  const digitos = String(documento ?? '').replace(/\D/g, '');
  if (digitos.length !== TAMANHO_CNPJ) {
    return MOTIVOS_EXCLUSAO.PESSOA_FISICA;
  }
  const texto = normalizar(historico);
  const achado = PADROES_EXCLUSAO.find(([, padrao]) => padrao.test(texto));
  return achado ? achado[0] : null;
}

module.exports = {
  CATEGORIAS_LIMITE,
  LIMITES_POR_ANO,
  limiteDispensa,
  MOTIVOS_EXCLUSAO,
  motivoExclusao,
};
