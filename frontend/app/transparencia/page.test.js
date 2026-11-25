export const transparenciaPageContract = {
  route: '/transparencia',
  expectations: [
    'owns the public transparency route',
    'defaults to the current mandate period (no query params)',
    'supports ?exercicio=, ?mandato= and ?periodo=todos filters',
    'every metric label carries the explicit time period (§11.1)',
    'groups the exercises table by mandate with subtotals',
    'links top creditors to /credores/[cnpj] (Receita Federal stays on the CNPJ)',
    'opens with the area module grid from lib/modulos.js (same map as home and top nav)',
    'recent empenhos live in /transparencia/empenhos (date desc, portal link per row)',
    'merges destination views (finalidade / tipo de despesa) into one tabbed block',
    'keeps analyst tables and collection status in collapsible sections'
  ]
};
