export const licitacoesPageContract = {
  route: '/licitacoes',
  files: ['page.js', 'index.js', 'styles.module.css', 'page.test.js'],
  expectations: [
    'keeps page.js as a small route bridge',
    'keeps filters in a local page component',
    'keeps row rendering in a local list component',
    'shows annual product coverage before the licitation list',
    'keeps product extraction separate from external validation',
    'shows group, PNCP and integrated-reading indicators in each licitation row',
    'uses shared Pagination component'
  ]
};
