export const coberturaPageContract = {
  route: '/cobertura',
  redirect: 'next.config.js redirects() (preserva query, 307)',
  expectations: [
    'redirects legacy public route to /admin/cobertura',
    'preserves query filters while redirecting'
  ]
};
