export const iaPageContract = {
  route: '/ia',
  files: ['page.js', 'index.js', 'styles.module.css', 'page.test.js'],
  expectations: [
    'keeps page.js as a route bridge',
    'redirects legacy public route to /admin/ia',
    'preserves query filters while redirecting'
  ],
  nextRefactorTargets: [
    'remove this legacy alias when links and bookmarks no longer depend on it'
  ]
};
