export const documentosPageContract = {
  route: '/documentos',
  redirect: 'next.config.js redirects() (preserva query, 307)',
  expectations: [
    'redirects legacy public route to /acervo',
    'preserves query filters while redirecting'
  ]
};
