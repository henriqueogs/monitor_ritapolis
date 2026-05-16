export const analisesPageContract = {
  route: '/analises',
  files: ['page.js', 'index.js', 'styles.module.css', 'page.test.js'],
  expectations: [
    'keeps page.js as a route bridge',
    'keeps filters in a local component',
    'keeps analysis rows in a local list component',
    'only renders IA analyses backed by saved summaries'
  ]
};
