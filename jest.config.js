'use strict';

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/src/**/*.test.js', '**/tests/**/*.test.js'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/db/setup.js',
    '!src/db/schema.sql',
    '!src/logger.js',
    '!src/config.js',
    '!src/api/server.js',
  ],
  coverageThreshold: {
    // Módulos com testes — thresholds activos
    'src/parsers/licitacao.js': { lines: 90 },
    'src/licitacoes/grupos.js': { lines: 85 },
    'src/licitacoes/processo.js': { lines: 85 },
    'src/ai/validate-summary.js': { lines: 85 },
    // TODO (Prioridade 4): adicionar testes e thresholds para:
    //   src/parsers/decreto.js, licitacao-detalhes.js, licitacao-produtos.js, pdf.js
    //   src/db/*-repo.js (integração SQLite :memory:)
    //   src/api/server.js (supertest)
  },
  // ESM-only packages (p-limit v7, yocto-queue) precisam de transform:
  // arquivos que importam p-limit devem mockar: jest.mock('p-limit', () => (n) => (fn) => fn())
  transformIgnorePatterns: ['/node_modules/'],
  testPathIgnorePatterns: ['/node_modules/', '/frontend/'],
};
