'use strict';

const fs = require('fs');
const path = require('path');
const { serializarJsonLd } = require('../frontend/lib/json-ld');

describe('serializarJsonLd', () => {
  it('não deixa texto de dados fechar o <script> (XSS via JSON-LD)', () => {
    // Arrange: nome vindo de fonte externa (Portal/Câmara) com payload
    const dado = { name: '</script><script>alert(1)</script>' };

    // Act
    const html = serializarJsonLd(dado);

    // Assert
    expect(html).not.toMatch(/<\/script/i);
    expect(html).not.toContain('<');
  });

  it('continua sendo JSON válido e equivalente ao original', () => {
    const dado = { '@type': 'Person', name: 'JOSÉ <da> SILVA & filhos', n: 3 };
    expect(JSON.parse(serializarJsonLd(dado))).toEqual(dado);
  });

  it('escapa também separadores de linha U+2028/U+2029', () => {
    const html = serializarJsonLd({ name: 'a\u2028b\u2029c' });
    expect(html).not.toMatch(/[\u2028\u2029]/);
    expect(JSON.parse(html).name).toBe('a\u2028b\u2029c');
  });

  it('nenhum bloco ld+json do frontend usa JSON.stringify direto', () => {
    const arquivos = [
      'app/components/BreadcrumbJsonLd.js',
      'app/credores/[cnpj]/index.js',
      'app/documento/[id]/index.js',
      'app/layout.js',
    ];
    for (const rel of arquivos) {
      const src = fs.readFileSync(path.resolve(__dirname, '../frontend', rel), 'utf8');
      expect({ rel, cru: /__html:\s*JSON\.stringify/.test(src) }).toEqual({ rel, cru: false });
    }
  });
});
