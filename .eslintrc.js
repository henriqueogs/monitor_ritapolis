'use strict';

module.exports = {
  env: {
    node: true,
    es2022: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
  },
  extends: ['eslint:recommended'],
  rules: {
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    eqeqeq: ['error', 'always'],
    'no-var': 'error',
    'prefer-const': 'error',
    'no-throw-literal': 'error',
    curly: ['error', 'all'],
  },
  overrides: [
    {
      files: ['infrastructure/**/*.js'],
      env: { browser: true, es2022: true, serviceworker: true },
      parserOptions: { sourceType: 'module' },
    },
    {
      // Scripts operacionais podem usar console
      files: ['scripts/**/*.js'],
      rules: { 'no-console': 'off' },
    },
    {
      // Arquivos de teste: variáveis de test helpers
      // (*.contract.js = suítes de contrato das portas, executadas dentro de testes Jest)
      files: ['**/*.test.js', '**/*.spec.js', '**/*.contract.js', 'tests/**/*.js'],
      env: { jest: true },
      rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
    },
  ],
};
