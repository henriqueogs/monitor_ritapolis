'use strict';

/**
 * Corrige grafias erradas conhecidas do nome do município em textos copiados da fonte
 * (ex.: ementa publicada pela Câmara com "Eitápois"). Lista explícita e revisada: correção
 * por similaridade reescreveria nomes de outros municípios reais (Itápolis, SP).
 * Quem usa deve guardar o texto original (`*_original`) para a procedência não se perder.
 */

const { ente } = require('../ente');

const GRAFIAS_ERRADAS = ['eitapois'];

const semAcento = texto => texto.normalize('NFD').replace(/[̀-ͯ]/g, '');

function corrigirGrafiaDoEnte(texto) {
  if (!texto) {
    return { texto: texto ?? null, corrigido: false };
  }
  let corrigido = false;
  const resultado = texto.replace(/[\p{L}]+/gu, palavra => {
    if (!GRAFIAS_ERRADAS.includes(semAcento(palavra).toLowerCase())) {
      return palavra;
    }
    corrigido = true;
    return ente.nome;
  });
  return { texto: resultado, corrigido };
}

module.exports = { corrigirGrafiaDoEnte };
