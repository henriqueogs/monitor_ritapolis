'use strict';

/**
 * Vertente "legislação": dois sinais verificáveis só com o acervo de leis e normas coletado.
 *  - norma citada ausente: lei municipal ordinária citada por outra norma (nº e ano) que não
 *    consta no acervo;
 *  - lacuna de numeração: números sem lei entre a primeira e a última lei do mandato corrente.
 * Em ambos o texto diz "não localizada no acervo": pode ser falha de coleta ou de publicação na
 * fonte, nunca prova de irregularidade. Contexto: { leis, normas }. Candidatos sempre `info`.
 */

const crypto = require('node:crypto');
const { mandatoInicio, mandatoLabel } = require('../../utils/mandato');

const TIPO_LEI = 'lei_ordinaria';
const NUMERO_MINIMO_MUNICIPAL = 1000;
const ANO_MINIMO_CITACAO = 2010;
const MAX_EVIDENCIAS = 6;
const CONTEXTO_CHARS = 70;
const BASE_DECIMAL = 10;

// "Lei [Municipal|Ordinária] nº 1.315, de 12 de março de 2014" ou "Lei nº 1.315/2014". Lei
// Federal/Estadual/Complementar não casam: o nome entre "Lei" e o número os exclui.
const CITACAO =
  /Lei\s+(?:Municipal\s+|Ordin[aá]ria\s+(?:Municipal\s+)?)?(?:n[ºo°.]{0,2}\s*)?(\d{1,2}[.\s]?\d{3})\s*(?:,\s*de\s+[^,.;]{3,25}?\s+de\s+(\d{4})|\/(\d{4}))/gi;

const hash = texto => crypto.createHash('sha256').update(texto, 'utf8').digest('hex');
const compacta = texto => String(texto).replace(/\s+/g, ' ').trim();
const rotuloNumero = n => String(n).replace(/(\d)(\d{3})$/, '$1.$2');

function evidenciaDe({ doc, trecho, papel }) {
  return {
    fonte_id: `D${doc.id}`,
    papel,
    evidencia_hash: hash(`legislacao:${doc.id}:${trecho}`),
    trecho,
    url_origem: doc.url_origem,
    metadados: { documento_tipo: doc.tipo, documento_numero: doc.numero, documento_ano: doc.ano },
  };
}

const base = () => ({
  categoria: 'Legislação',
  severidade: 'info',
  questionamentos: [],
});

function citacoesDe(norma, numerosNoAcervo, maximo) {
  const achadas = [];
  for (const m of String(norma.texto_completo || '').matchAll(CITACAO)) {
    const numero = Number.parseInt(m[1].replace(/[.\s]/g, ''), BASE_DECIMAL);
    const ano = Number(m[2] || m[3]);
    const propria = Number(norma.numero) === numero;
    const municipal = numero >= NUMERO_MINIMO_MUNICIPAL && numero <= maximo;
    if (ano < ANO_MINIMO_CITACAO || !municipal || propria || numerosNoAcervo.has(numero)) {
      continue;
    }
    const ini = Math.max(0, m.index - CONTEXTO_CHARS);
    const trecho = compacta(
      norma.texto_completo.slice(ini, m.index + m[0].length + CONTEXTO_CHARS)
    );
    achadas.push({ numero, ano, norma, trecho });
  }
  return achadas;
}

function candidatosCitadasAusentes({ leis, normas }) {
  const numeros = new Set(leis.map(l => Number(l.numero)));
  const maximo = Math.max(0, ...numeros);
  const porLei = new Map();
  for (const norma of normas) {
    for (const c of citacoesDe(norma, numeros, maximo)) {
      const chave = `${c.numero}/${c.ano}`;
      if (!porLei.has(chave)) {
        porLei.set(chave, []);
      }
      porLei.get(chave).push(c);
    }
  }
  return [...porLei].map(([chave, citacoes]) => candidatoCitada(chave, citacoes));
}

function candidatoCitada(chave, citacoes) {
  const [numero, ano] = chave.split('/');
  const rotulo = `${rotuloNumero(numero)}/${ano}`;
  const docs = citacoes.map(c => c.norma);
  const quem = [...new Set(docs.map(d => `${d.numero}/${d.ano}`))].slice(0, 3).join(', ');
  const anoRecente = Math.max(...docs.map(d => Number(d.ano)));
  return {
    ...base(),
    objeto: `legislacao|citada-ausente|${chave}`,
    titulo: `Lei municipal nº ${rotulo}, citada em ${docs.length} norma(s), não consta no acervo`,
    narrativa:
      `A Lei municipal nº ${rotulo} é citada por norma(s) do acervo (${quem}), mas não foi localizada no acervo ` +
      'coletado de leis. Pode ser lei antiga não coletada, falha de coleta ou lacuna na publicação da fonte; ' +
      'confira no portal oficial de legislação.',
    metrica: { nome: 'normas_citadas_ausentes', unidade: 'norma', valor: 1 },
    evidencias: citacoes
      .slice(0, MAX_EVIDENCIAS)
      .map(c => evidenciaDe({ doc: c.norma, trecho: c.trecho, papel: 'citacao' })),
    periodo: { ano: anoRecente },
    campos_a_verificar: ['existência da lei no portal oficial de legislação'],
    alerta: {
      tipo: 'legislacao',
      subcategoria: 'legislacao_citada_ausente',
      metadados: { regra: 'legislacao_citada_ausente', lei_citada: rotulo },
    },
  };
}

function vizinhasDoBuraco(ordenadas, faltante) {
  const antes = [...ordenadas].reverse().find(l => Number(l.numero) < faltante);
  const depois = ordenadas.find(l => Number(l.numero) > faltante);
  return [antes, depois].filter(Boolean);
}

function candidatoLacuna({ leis }) {
  const leisOrdinarias = leis.filter(l => l.tipo === TIPO_LEI);
  if (!leisOrdinarias.length) {
    return null;
  }
  const inicio = mandatoInicio(Math.max(...leisOrdinarias.map(l => Number(l.ano))));
  const doMandato = leisOrdinarias
    .filter(l => Number(l.ano) >= inicio)
    .sort((a, b) => Number(a.numero) - Number(b.numero));
  const numeros = new Set(doMandato.map(l => Number(l.numero)));
  const menor = Number(doMandato[0]?.numero);
  const maior = Number(doMandato.at(-1)?.numero);
  const faltantes = [];
  for (let n = menor; n <= maior; n += 1) {
    if (!numeros.has(n)) {
      faltantes.push(n);
    }
  }
  if (!faltantes.length) {
    return null;
  }
  const vizinhas = new Map();
  for (const f of faltantes) {
    for (const l of vizinhasDoBuraco(doMandato, f)) {
      vizinhas.set(l.id, l);
    }
  }
  const anoFim = Math.max(...doMandato.map(l => Number(l.ano)));
  return {
    ...base(),
    objeto: `legislacao|lacuna|${inicio}`,
    titulo: `${faltantes.length} número(s) de lei sem registro no acervo no mandato ${mandatoLabel(inicio)}`,
    narrativa:
      `Entre as leis ordinárias nº ${menor} e ${maior} do mandato ${mandatoLabel(inicio)}, não foram localizados ` +
      `no acervo os números: ${faltantes.join(', ')}. Pode ser lei não coletada, não publicada na fonte ou ` +
      'numeração não utilizada; confira no portal oficial de legislação.',
    metrica: { nome: 'numeros_sem_lei', unidade: 'lei', valor: faltantes.length },
    evidencias: [...vizinhas.values()]
      .slice(0, MAX_EVIDENCIAS)
      .map(doc =>
        evidenciaDe({ doc, trecho: `Lei ordinária nº ${doc.numero}/${doc.ano}`, papel: 'vizinha' })
      ),
    periodo: { inicio: `${inicio}-01-01`, fim: `${anoFim}-12-31` },
    campos_a_verificar: ['se os números faltantes foram publicados na fonte oficial'],
    alerta: {
      tipo: 'legislacao',
      subcategoria: 'legislacao_lacuna_numeracao',
      metadados: { regra: 'legislacao_lacuna_numeracao', faltantes },
    },
  };
}

function detectar({ leis = [], normas = [] } = {}) {
  return [...candidatosCitadasAusentes({ leis, normas }), candidatoLacuna({ leis })].filter(
    Boolean
  );
}

module.exports = {
  nome: 'legislacao',
  versao: 1,
  criterio:
    'Lei municipal citada por outra norma e ausente do acervo (nº e ano, ano ≥ 2010), e números sem lei entre a primeira e a última lei ordinária do mandato corrente.',
  detectar,
};
