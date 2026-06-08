export const coberturaPageContract = {
  route: '/cobertura',
  files: ['page.js', 'index.js', 'styles.module.css', 'page.test.js'],
  expectations: [
    'redirects legacy public route to /admin/cobertura',
    'preserves query filters while redirecting'
  ]
};
