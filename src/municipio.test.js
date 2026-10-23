'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  lerMunicipio,
  listarMunicipios,
  exportarMunicipios,
  SLUG_PADRAO,
  RAIZ_MUNICIPIOS,
} = require('./municipio');

const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(RAIZ_MUNICIPIOS, 'municipio.schema.json'), 'utf8')
);

function raizTemporaria(arquivos) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'municipios-'));
  for (const [relativo, conteudo] of Object.entries(arquivos)) {
    const destino = path.join(raiz, relativo);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, conteudo);
  }
  return raiz;
}

describe('municipio (configuração do município em arquivo)', () => {
  describe('lerMunicipio', () => {
    it('sem slug, lê o município padrão do projeto', () => {
      // Act
      const municipio = lerMunicipio();

      // Assert
      expect(SLUG_PADRAO).toBe('ritapolis');
      expect(municipio.slug).toBe(SLUG_PADRAO);
      expect(municipio.nome).toBe('Ritápolis');
      expect(municipio.uf).toBe('MG');
    });

    it('lê o município de exemplo pelo slug', () => {
      const municipio = lerMunicipio({ slug: '_exemplo' });

      expect(municipio.slug).toBe('_exemplo');
      expect(municipio.nome).toBe('Cidade Exemplo');
    });

    it('slug inexistente derruba com o caminho procurado', () => {
      expect(() => lerMunicipio({ slug: 'nao-existe' })).toThrow(
        /municipios[\\/]nao-existe[\\/]municipio\.json/
      );
    });

    it('recusa slug que sairia da pasta de municípios', () => {
      expect(() => lerMunicipio({ slug: '../src' })).toThrow(/slug de município inválido/);
    });

    it('JSON malformado derruba com o caminho do arquivo', () => {
      // Arrange
      const raiz = raizTemporaria({ 'quebrado/municipio.json': '{ "nome": ' });

      // Act + Assert
      expect(() => lerMunicipio({ slug: 'quebrado', raiz })).toThrow(
        /quebrado[\\/]municipio\.json/
      );
    });

    it('campo obrigatório ausente derruba com o nome do campo', () => {
      const raiz = raizTemporaria({
        'incompleto/municipio.json': JSON.stringify({ slug: 'incompleto', nome: 'X' }),
      });

      expect(() => lerMunicipio({ slug: 'incompleto', raiz })).toThrow(/uf/);
    });

    it('slug do arquivo diferente da pasta derruba (cópia esquecida de outro município)', () => {
      const original = fs.readFileSync(
        path.join(RAIZ_MUNICIPIOS, '_exemplo', 'municipio.json'),
        'utf8'
      );
      const raiz = raizTemporaria({ 'copiado/municipio.json': original });

      expect(() => lerMunicipio({ slug: 'copiado', raiz })).toThrow(/slug/);
    });
  });

  describe('listarMunicipios', () => {
    it('lista as pastas com municipio.json, incluindo o exemplo', () => {
      expect(listarMunicipios()).toEqual(expect.arrayContaining(['ritapolis', '_exemplo']));
    });
  });

  describe('exportarMunicipios', () => {
    it('devolve todos os municípios por slug, sem o campo $schema', () => {
      const todos = exportarMunicipios();

      expect(Object.keys(todos).sort()).toEqual(listarMunicipios());
      expect(todos.ritapolis.nome).toBe('Ritápolis');
      expect(Object.values(todos).some(m => '$schema' in m)).toBe(false);
    });
  });

  describe('municipio.schema.json', () => {
    it.each(listarMunicipios())('%s tem todos os campos obrigatórios do schema', slug => {
      const municipio = lerMunicipio({ slug });

      for (const campo of SCHEMA.required) {
        expect({ slug, campo, presente: campo in municipio }).toEqual({
          slug,
          campo,
          presente: true,
        });
      }
    });

    it('o carregador exige exatamente os campos que o schema declara obrigatórios', () => {
      const { CAMPOS_OBRIGATORIOS } = require('./municipio');

      expect([...CAMPOS_OBRIGATORIOS].sort()).toEqual([...SCHEMA.required].sort());
    });
  });
});
