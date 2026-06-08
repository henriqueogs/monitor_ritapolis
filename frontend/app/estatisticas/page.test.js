export const estatisticasPageContract = {
  route: '/estatisticas',
  files: ['page.js', 'index.js', 'styles.module.css', 'page.test.js'],
  expectations: [
    'redirects legacy public route to /transparencia'
  ]
};
