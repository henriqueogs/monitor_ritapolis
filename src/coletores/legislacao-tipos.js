'use strict';

// Taxonomia de tipo de legislação compartilhada entre os coletores de
// legislação da Prefeitura (site-prefeitura-legislacao.js) e da Câmara
// (camara-legislacao.js) — mapa único em vez de duplicado, mesmo bug-pattern
// já visto com tipo_nome (dois mapas de label desalinhados).

const { normalizeText } = require('../utils/text');

function normalizeSpaces(value) {
  return normalizeText(String(value || '')).replace(/\s+/g, ' ').trim();
}

function chaveTipo(rotulo) {
  return normalizeSpaces(rotulo)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// Rótulo em português (normalizado por chaveTipo) -> `documentos.tipo`
// (snake_case). 'promulgada' do combo de tipos da Câmara é um filtro de
// status, não um tipo de item de verdade — nunca aparece como rótulo de
// registro, por isso não tem entrada aqui (cai no fallback documento_publico
// se algum dia aparecer).
const TIPO_MAP = {
  'decreto': 'decreto',
  'lei ordinaria': 'lei_ordinaria',
  'lei complementar': 'lei_complementar',
  'portaria': 'portaria',
  'resolucao': 'resolucao',
  'instrucao normativa': 'instrucao_normativa',
  'lei organica': 'lei_organica',
  'atas': 'ata',
  'regimento interno': 'regimento_interno',
  'estatuto': 'estatuto',
  'ata de comissao': 'ata_comissao',
  'projeto de lei': 'projeto_lei',
  'lei': 'lei',
  'deliberacao': 'deliberacao',
  'decreto legislativo': 'decreto_legislativo',
  'portaria do legislativo': 'portaria_legislativo',
  'projeto de lei complementar': 'projeto_lei_complementar',
  'oficio': 'oficio',
  // Novos, achados em buscarTiposDeLegislacao (Câmara) em 08/09/2026.
  'indicacao': 'indicacao',
  'requerimento': 'requerimento',
  'ata ordinaria': 'ata_ordinaria',
  'ata extraordinaria': 'ata_extraordinaria',
  'ata solene': 'ata_solene',
  'ata audiencia publica': 'ata_audiencia_publica',
  'ato da mesa': 'ato_da_mesa',
  'emenda a lei organica': 'emenda_lei_organica',
  // Projeto em tramitação (buscarProjetos.php da Câmara, achado 09/09/2026 --
  // rótulo diferente de "Projeto de Lei"/"Projeto de Lei Complementar" acima,
  // que já existiam pro caso raro de aparecerem como legislação promulgada).
  'projeto de lei substitutivo': 'projeto_lei_substitutivo',
  'projeto de resolucao': 'projeto_resolucao',
  'projeto de emenda a lei organica': 'projeto_emenda_lei_organica',
};

function normalizarTipo(rotulo) {
  return TIPO_MAP[chaveTipo(rotulo)] || 'documento_publico';
}

module.exports = { TIPO_MAP, normalizarTipo, normalizeSpaces, chaveTipo };
