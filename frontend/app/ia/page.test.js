export const iaPageContract = {
  route: '/ia',
  files: ['page.js', 'index.js', 'styles.module.css', 'page.test.js'],
  expectations: [
    'keeps page.js as a route bridge',
    'shows IA coverage and jobs from real endpoints',
    'keeps batch actions operational',
    'splits filters, coverage, pending rows, jobs and providers into local components'
  ],
  nextRefactorTargets: [
    'move repeated IA table styling out of globals',
    'add behavior tests for filtered job status views'
  ]
};
