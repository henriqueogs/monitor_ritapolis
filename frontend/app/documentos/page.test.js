export const documentosPageContract = {
  route: '/documentos',
  files: ['page.js', 'index.js', 'styles.module.css', 'page.test.js'],
  expectations: [
    'keeps page.js as a small route bridge',
    'keeps filters in a local page component',
    'keeps year navigation in a local page component',
    'uses shared DocumentList and Pagination components'
  ]
};
