export const homePageContract = {
  route: '/',
  files: ['page.js', '_home/index.js', '_home/styles.module.css'],
  expectations: [
    'renders one unified recent updates list',
    'does not render a separate purchases list on the home page',
    'keeps full document text out of list payloads',
    'keeps operational admin controls outside public content',
    'renders the Prefeitura auto-sync as a client component that fires in useEffect, never blocking the home render'
  ]
};
