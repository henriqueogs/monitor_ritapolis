'use strict';

/**
 * Resultado da eleição para vereador a partir dos dados abertos do TSE (dataset resultados-<ano>,
 * arquivo votacao_candidato_munzona_<ano>_<UF>.csv dentro de um zip nacional).
 *
 * Usa o arquivo de votação, não o de candidatos (consulta_cand): ele já traz partido, votos e
 * situação final, e não tem CPF, e-mail nem dados pessoais além da candidatura.
 * O TSE identifica o município por código próprio (SG_UE), diferente do IBGE: vem de `ente.codigoTse`.
 */

const zlib = require('zlib');
const axios = require('axios');
const config = require('../config');

const BASE_URL = 'https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona';
const CD_CARGO_VEREADOR = '13';
const SITUACOES = Object.freeze({
  ELEITO: 'ELEITO',
  ELEITO_QP: 'ELEITO POR QP',
  ELEITO_MEDIA: 'ELEITO POR MÉDIA',
  SUPLENTE: 'SUPLENTE',
});
const SITUACOES_IMPORTADAS = new Set(Object.values(SITUACOES));
const COLUNAS = [
  'ANO_ELEICAO',
  'SG_UE',
  'CD_CARGO',
  'SQ_CANDIDATO',
  'NR_CANDIDATO',
  'NM_CANDIDATO',
  'NM_URNA_CANDIDATO',
  'SG_PARTIDO',
  'QT_VOTOS_NOMINAIS',
  'DS_SIT_TOT_TURNO',
];
const TIMEOUT_DOWNLOAD_MS = 5 * 60 * 1000;
const ASSINATURA_DIRETORIO_CENTRAL = 0x02014b50;
const ASSINATURA_FIM_DIRETORIO = 0x06054b50;
const TAMANHO_MIN_FIM_DIRETORIO = 22;
const METODO_DEFLATE = 8;

const urlDatasetResultados = ano => `https://dadosabertos.tse.jus.br/dataset/resultados-${ano}`;
const urlZipVotacao = ano => `${BASE_URL}/votacao_candidato_munzona_${ano}.zip`;
const nomeArquivoVotacao = (ano, uf) => `votacao_candidato_munzona_${ano}_${uf}.csv`;

/**
 * Lê uma entrada de um zip pelo diretório central (sem zip64: os arquivos do TSE têm < 4 GB).
 * shortcut: só "stored" e "deflate"; trocar por uma lib de zip se o TSE mudar o formato.
 */
function extrairArquivoZip(buffer, nome) {
  let fim = buffer.length - TAMANHO_MIN_FIM_DIRETORIO;
  while (fim >= 0 && buffer.readUInt32LE(fim) !== ASSINATURA_FIM_DIRETORIO) {
    fim -= 1;
  }
  if (fim < 0) {
    throw new Error('zip do TSE inválido: fim do diretório central não encontrado');
  }
  const total = buffer.readUInt16LE(fim + 10);
  let pos = buffer.readUInt32LE(fim + 16);
  for (let i = 0; i < total && buffer.readUInt32LE(pos) === ASSINATURA_DIRETORIO_CENTRAL; i += 1) {
    const metodo = buffer.readUInt16LE(pos + 10);
    const tamanho = buffer.readUInt32LE(pos + 20);
    const tamNome = buffer.readUInt16LE(pos + 28);
    const tamExtra = buffer.readUInt16LE(pos + 30);
    const tamComentario = buffer.readUInt16LE(pos + 32);
    const local = buffer.readUInt32LE(pos + 42);
    if (buffer.toString('latin1', pos + 46, pos + 46 + tamNome) === nome) {
      const inicio = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
      const dados = buffer.subarray(inicio, inicio + tamanho);
      return metodo === METODO_DEFLATE ? zlib.inflateRawSync(dados) : dados;
    }
    pos += 46 + tamNome + tamExtra + tamComentario;
  }
  throw new Error(`arquivo ${nome} não encontrado no zip do TSE`);
}

/** Linha "a";"b";3 → ['a','b','3'] (aspas duplas, separador ';'). */
function separarCampos(linha) {
  const campos = [];
  let atual = '';
  let dentroDeAspas = false;
  for (const char of linha) {
    if (char === '"') {
      dentroDeAspas = !dentroDeAspas;
    } else if (char === ';' && !dentroDeAspas) {
      campos.push(atual);
      atual = '';
    } else {
      atual += char;
    }
  }
  campos.push(atual);
  return campos;
}

function indiceColunas(cabecalho) {
  const campos = separarCampos(cabecalho);
  const indice = Object.fromEntries(COLUNAS.map(c => [c, campos.indexOf(c)]));
  const faltando = COLUNAS.filter(c => indice[c] < 0);
  if (faltando.length) {
    throw new Error(`CSV de votação do TSE sem as colunas: ${faltando.join(', ')}`);
  }
  return indice;
}

/**
 * Vereadores eleitos e suplentes do município, um por candidatura (votos somados entre zonas).
 * @param {string} texto CSV já decodificado (o TSE publica em latin1)
 */
function parsearVotacaoVereadores(texto, { codigoMunicipio }) {
  const [cabecalho, ...linhas] = String(texto || '').split(/\r?\n/);
  const col = indiceColunas(cabecalho);
  const porCandidato = new Map();
  for (const linha of linhas) {
    const c = separarCampos(linha);
    const doMunicipio =
      c[col.SG_UE] === String(codigoMunicipio) && c[col.CD_CARGO] === CD_CARGO_VEREADOR;
    if (!doMunicipio || !SITUACOES_IMPORTADAS.has(c[col.DS_SIT_TOT_TURNO])) {
      continue;
    }
    const sq = c[col.SQ_CANDIDATO];
    const anterior = porCandidato.get(sq);
    porCandidato.set(sq, {
      sq_candidato: sq,
      ano_eleicao: Number(c[col.ANO_ELEICAO]),
      numero: c[col.NR_CANDIDATO],
      nome: c[col.NM_CANDIDATO],
      nome_urna: c[col.NM_URNA_CANDIDATO],
      partido: c[col.SG_PARTIDO],
      votos: (anterior?.votos || 0) + Number(c[col.QT_VOTOS_NOMINAIS]),
      situacao: c[col.DS_SIT_TOT_TURNO],
    });
  }
  return [...porCandidato.values()];
}

/** Baixa o zip nacional do ano e devolve o CSV da UF já decodificado de latin1. */
async function baixarVotacaoUf({ ano, uf }) {
  const resposta = await axios.get(urlZipVotacao(ano), {
    responseType: 'arraybuffer',
    timeout: TIMEOUT_DOWNLOAD_MS,
    headers: { 'User-Agent': config.collectorUserAgent },
  });
  return extrairArquivoZip(Buffer.from(resposta.data), nomeArquivoVotacao(ano, uf)).toString(
    'latin1'
  );
}

module.exports = {
  SITUACOES,
  urlDatasetResultados,
  urlZipVotacao,
  extrairArquivoZip,
  parsearVotacaoVereadores,
  baixarVotacaoUf,
};
