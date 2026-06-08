export const documentosPageContract = {
  route: '/documentos',
  files: ['page.js', 'index.js', 'styles.module.css', 'page.test.js'],
  expectations: [
    'keeps page.js as a small route bridge',
    'redirects legacy public route to /acervo',
    'preserves query filters while redirecting'
  ]
};
