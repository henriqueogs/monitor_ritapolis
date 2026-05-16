export const licitacoesPageContract = {
  route: '/licitacoes',
  files: ['page.js', 'index.js', 'styles.module.css', 'page.test.js'],
  expectations: [
    'keeps page.js as a small route bridge',
    'keeps filters in a local page component',
    'keeps row rendering in a local list component',
    'uses shared Pagination component'
  ]
};
