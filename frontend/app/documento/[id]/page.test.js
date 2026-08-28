export const documentoPageContract = {
  route: '/documento/[id]',
  files: ['page.js', 'index.js', 'styles.module.css', 'page.test.js'],
  expectations: [
    'keeps page.js as a route bridge',
    'loads full document text only in the detail route',
    'leads with the AI simple-reading summary (or the best available fallback) at the top of the page, synthesized with identification and licitation facts — never just the "open official file" button alone',
    'keeps official source preview (embedded PDF) after the synthesized summary — it is for credibility/verification, not primary content',
    'shows structured licitation products separately from the AI summary',
    'keeps detail sections split into local route components'
  ],
  nextRefactorTargets: [
    'move remaining inline AI styles into the route style module',
    'add behavior tests for document with and without IA summary'
  ]
};
