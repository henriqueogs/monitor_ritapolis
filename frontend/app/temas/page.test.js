export const temasPageContract = {
  route: '/temas',
  files: ['page.js', 'index.js', 'styles.module.css', 'page.test.js'],
  expectations: [
    'keeps page.js as a route bridge',
    'separates topic cards into a local component',
    'separates recent analysis links into a local component',
    'labels partial and pending data availability'
  ]
};
