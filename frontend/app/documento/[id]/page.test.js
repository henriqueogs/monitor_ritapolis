export const documentoPageContract = {
  route: '/documento/[id]',
  files: ['page.js', 'index.js', 'styles.module.css', 'page.test.js'],
  expectations: [
    'keeps page.js as a route bridge',
    'loads full document text only in the detail route',
    'shows official source before IA interpretation',
    'shows integrated licitation reading above the individual PDF summary when available',
    'keeps IA summary validation visible',
    'shows structured licitation products separately from the AI summary',
    'keeps detail sections split into local route components'
  ],
  nextRefactorTargets: [
    'move remaining inline AI styles into the route style module',
    'add behavior tests for document with and without IA summary'
  ]
};
