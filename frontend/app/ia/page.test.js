export const iaPageContract = {
  route: '/ia',
  redirect: 'next.config.js redirects() (preserva query, 307)',
  expectations: [
    'redirects legacy public route to /admin/ia',
    'preserves query filters while redirecting'
  ],
  nextRefactorTargets: [
    'remove this legacy alias when links and bookmarks no longer depend on it'
  ]
};
