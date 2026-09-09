// Tipos de `documentos.tipo` que compoem cada um dos dois hubs da home
// (Dinheiro publico / Atos oficiais). Fonte unica -- usado pra escopar
// busca, "analise em destaque" e "Na Lupa" de cada area, alem dos cards
// da home e do filtro de /legislacao. Nao duplicar essas listas em outro
// lugar (ja rendeu bug de mapa de label duplicado antes).
export const TIPOS_DINHEIRO_PUBLICO = ['edital', 'contrato', 'emenda_parlamentar', 'publicacao_extrato'];

export const TIPOS_LEGISLACAO = [
  'decreto', 'lei_ordinaria', 'lei_complementar', 'portaria', 'resolucao',
  'instrucao_normativa', 'lei_organica', 'ata', 'regimento_interno',
  'estatuto', 'ata_comissao', 'projeto_lei', 'lei', 'deliberacao',
  'decreto_legislativo', 'portaria_legislativo', 'projeto_lei_complementar', 'oficio',
  // Legislação da Câmara (site-prefeitura-legislacao.js + camara-legislacao.js
  // compartilham a mesma taxonomia — ver src/coletores/legislacao-tipos.js).
  'indicacao', 'requerimento', 'ata_ordinaria', 'ata_extraordinaria',
  'ata_solene', 'ata_audiencia_publica', 'ato_da_mesa', 'emenda_lei_organica',
];
