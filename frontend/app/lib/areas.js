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
];
