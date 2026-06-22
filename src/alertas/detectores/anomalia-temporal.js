'use strict';

// Detecta picos temporais: um ano com muito mais processos de uma categoria que
// a média dos demais anos. Sinal quando o ano tem >= minAbsoluto processos e
// >= multiplicador × a média dos outros anos da mesma categoria.
function detectarAnomaliaTemporal(docs, { multiplicador = 3, minAbsoluto = 3 } = {}) {
  const porCategoria = new Map();
  for (const doc of docs) {
    const cat = doc.categoria || 'Outros';
    if (cat === 'Outros' || doc.ano === null || doc.ano === undefined) {
      continue;
    }
    if (!porCategoria.has(cat)) {
      porCategoria.set(cat, new Map());
    }
    const anos = porCategoria.get(cat);
    anos.set(doc.ano, (anos.get(doc.ano) || 0) + 1);
  }

  const sinais = [];
  for (const [categoria, anos] of porCategoria) {
    const entradas = [...anos.entries()];
    if (entradas.length < 2) {
      continue;
    }
    for (const [ano, count] of entradas) {
      const outros = entradas.filter(([a]) => a !== ano).map(([, c]) => c);
      const media = outros.reduce((s, c) => s + c, 0) / outros.length;
      if (count >= minAbsoluto && media > 0 && count >= media * multiplicador) {
        sinais.push({
          tipo: 'anomalia_temporal',
          categoria,
          ano,
          severidade: 'atencao',
          documentos: docs.filter((d) => d.categoria === categoria && d.ano === ano).map((d) => d.id),
          motivo: `Pico: ${count} processos de ${categoria} em ${ano} (média dos outros anos: ${media.toFixed(1)})`,
        });
      }
    }
  }
  return sinais;
}

module.exports = { detectarAnomaliaTemporal };
