export const adminCoberturaPageContract = {
  route: '/admin/cobertura',
  expectations: [
    'owns coverage checks under the admin namespace',
    'compares prefeitura source files with local records',
    'keeps missing files visible'
  ]
};
