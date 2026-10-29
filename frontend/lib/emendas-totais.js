'use strict';

// CommonJS de propósito (mesmo padrão de lib/intervalo-anos.js): testável pelo Jest da raiz.
//
// Cards de /emendas: o destaque é um ano só (o do filtro ou o mais recente); o acumulado de
// vários anos fica secundário e sempre com o intervalo (CLAUDE.md §11.1, fiscal-datas D3).

const { rotuloIntervaloAnos } = require('./intervalo-anos');

const ESFERA_INDEFINIDA = 'indefinida';

function vazio() {
  return { total_emendas: 0, soma_repasse: 0 };
}

function resumirTotaisPorEsfera(totais = [], anoSelecionado = null) {
  const anos = totais.map((t) => t.ano).filter(Boolean);
  if (anos.length === 0) { return { anoDestaque: null, esferas: {} }; }
  const anoDestaque = Number(anoSelecionado) || Math.max(...anos);

  const esferas = {};
  for (const t of totais) {
    const esfera = t.esfera || ESFERA_INDEFINIDA;
    if (!esferas[esfera]) {
      esferas[esfera] = { ano: vazio(), acumulado: { ...vazio(), anos: [] }, semAno: vazio() };
    }
    const alvo = esferas[esfera];
    // Sem ano não entra no acumulado: o intervalo do rótulo não o cobriria (§11.1).
    if (!t.ano) {
      alvo.semAno.total_emendas += t.total_emendas || 0;
      alvo.semAno.soma_repasse += t.soma_repasse || 0;
      continue;
    }
    alvo.acumulado.total_emendas += t.total_emendas || 0;
    alvo.acumulado.soma_repasse += t.soma_repasse || 0;
    alvo.acumulado.anos.push(t.ano);
    if (t.ano === anoDestaque) {
      alvo.ano.total_emendas += t.total_emendas || 0;
      alvo.ano.soma_repasse += t.soma_repasse || 0;
    }
  }

  for (const alvo of Object.values(esferas)) {
    const { anos: anosEsfera, ...somas } = alvo.acumulado;
    alvo.acumulado = {
      ...somas,
      intervalo: anosEsfera.length ? rotuloIntervaloAnos(Math.min(...anosEsfera), Math.max(...anosEsfera)) : '',
    };
  }

  return { anoDestaque, esferas };
}

module.exports = { resumirTotaisPorEsfera };
