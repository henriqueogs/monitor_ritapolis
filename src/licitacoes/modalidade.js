'use strict';

// Identidade de modalidade de licitação {tipo, numero, ano}, usada para vincular
// empenhos do portal de transparência ao edital correto. O vínculo por número
// solto (LIKE no título) casava o número da modalidade com o número do PROCESSO
// e ignorava o tipo — gerando ~46% de links errados. Aqui a correspondência é
// exata: tipo canônico + número + ano.

const { normalizeText } = require('../utils/text');

// Ordem importa: padrões mais específicos primeiro.
const TIPOS = [
  ['pregao', /preg[aã]o/],
  ['adesao', /ades[aã]o/],
  ['inexigibilidade', /inexig/],
  ['dispensa', /dispensa/],
  ['tomada', /tomada\s+de\s+pre/],
  ['concorrencia', /concorr[eê]ncia/],
  ['chamamento', /chamada\s+p[uú]blica|chamamento|credenciamento/],
  ['leilao', /leil[aã]o/],
  ['concurso', /concurso/],
];

function normalizarTexto(value) {
  return normalizeText(String(value || ''))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function normalizarTipoModalidade(value) {
  const texto = normalizarTexto(value);
  if (!texto.trim()) {
    return null;
  }
  for (const [canonico, regex] of TIPOS) {
    // testa o regex sobre a versão sem acentos (regex já usa classes flexíveis)
    if (regex.test(value) || regex.test(texto)) {
      return canonico;
    }
  }
  return null;
}

// Despesa: "Pregão - 00482023" → {tipo:'pregao', numero:48, ano:2023}
function parseModalidadeDespesa(modalidade) {
  if (!modalidade) {
    return null;
  }
  const m = String(modalidade).match(/^(.+?)\s*-\s*(\d{6,8})\s*$/);
  if (!m) {
    return null;
  }
  const tipo = normalizarTipoModalidade(m[1]);
  const codigo = m[2];
  const ano = Number(codigo.slice(-4));
  if (!tipo || ano < 2010 || ano > 2050) {
    return null;
  }
  return { tipo, numero: Number(codigo.slice(0, -4)), ano };
}

// Edital: "Processo 0107/2023 - Pregão - 0048/2023 - ..." → modalidade após o
// processo. Pega o segmento de modalidade (ignora o "Processo NNNN/AAAA") e o
// primeiro NNN/AAAA que aparece DEPOIS do tipo (ignora "RP" e "nº").
function parseModalidadeEdital(titulo) {
  if (!titulo) {
    return null;
  }

  const segmentos = String(titulo)
    .split(/\s+[-–]\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (let i = 0; i < segmentos.length; i += 1) {
    const seg = segmentos[i];
    if (/^processo/i.test(seg)) {
      continue;
    }
    const tipo = normalizarTipoModalidade(seg);
    if (!tipo) {
      continue;
    }
    // número no próprio segmento da modalidade...
    let num = seg.match(/(\d{1,4})\s*\/\s*(\d{2,4})/);
    // ...ou no segmento seguinte quando ele é só o número ("Pregão - 0048/2023")
    if (!num) {
      const proximo = segmentos[i + 1] || '';
      const soNumero = proximo.match(/^(?:n[ºo°]\s*)?(\d{1,4})\s*\/\s*(\d{2,4})$/i);
      if (soNumero) {
        num = soNumero;
      }
    }
    if (!num) {
      return { tipo, numero: null, ano: null };
    }
    let ano = Number(num[2]);
    if (ano < 100) {
      ano += 2000;
    }
    return { tipo, numero: Number(num[1]), ano };
  }

  return null;
}

function modalidadesCorrespondem(a, b) {
  if (!a || !b) {
    return false;
  }
  if (a.numero === null || a.numero === undefined || b.numero === null || b.numero === undefined) {
    return false;
  }
  return a.tipo === b.tipo && a.numero === b.numero && a.ano === b.ano;
}

module.exports = {
  normalizarTipoModalidade,
  parseModalidadeDespesa,
  parseModalidadeEdital,
  modalidadesCorrespondem,
};
