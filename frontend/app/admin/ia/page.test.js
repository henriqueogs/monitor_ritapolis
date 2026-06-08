export const adminIaPageContract = {
  route: '/admin/ia',
  expectations: [
    'owns the IA operational page under the admin namespace',
    'shows IA coverage and jobs from real endpoints',
    'keeps batch actions operational',
    'splits filters, coverage, pending rows, jobs and providers into local components'
  ],
  nextRefactorTargets: [
    'move repeated IA table styling out of globals',
    'add behavior tests for filtered job status views'
  ]
};
