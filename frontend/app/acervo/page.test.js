export const acervoPageContract = {
  route: '/acervo',
  expectations: [
    'owns the public document collection route',
    'renders filters, year navigation, grouped documents and pagination',
    'uses /documentos only as the backend API contract'
  ]
};
