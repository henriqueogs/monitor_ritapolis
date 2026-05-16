export const estatisticasPageContract = {
  route: '/estatisticas',
  files: ['page.js', 'index.js', 'styles.module.css', 'page.test.js'],
  expectations: [
    'keeps summary metrics in a local component',
    'uses a local table component for repeated count tables',
    'keeps operational collection status visible'
  ]
};
