export const transparenciaPageContract = {
  route: '/transparencia',
  expectations: [
    'owns the public transparency route',
    'defaults to the current mandate period (no query params)',
    'supports ?exercicio=, ?mandato= and ?periodo=todos filters',
    'every metric label carries the explicit time period (§11.1)',
    'groups the exercises table by mandate with subtotals',
    'links top creditors to /credores/[cnpj] (Receita Federal stays on the CNPJ)',
    'links each recent empenho to Detalhamento_Despesa.php with honest fallback label',
    'delegates price-evolution analysis to /inteligencia (card link only)',
    'keeps collection status visible with clear data limits'
  ]
};
