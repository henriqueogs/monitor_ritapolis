'use strict';

// Medição SOMENTE LEITURA da possível dupla contagem do valor final por ano
// (por_ano de getInteligenciaPanorama: edital + publicacao_extrato; fiscal-valores V3).
// Abre o banco com readOnly: nenhuma escrita é possível.
//
//   node scripts/medir-duplicidade-valor-ano.js            # usa config.dbPath
//   node scripts/medir-duplicidade-valor-ano.js /caminho/ritapolis.db --json
//
// Imprime, por ano: documentos com valor, soma bruta (o que a tela soma hoje) e,
// para cada chave candidata de processo (grupo, pncp, processo, modalidade), quantos
// processos distintos sobram, a soma deduplicada, o excesso e até 5 exemplos.

const { DatabaseSync } = require('node:sqlite');
const config = require('../src/config');
const { sqlValorFinalHomologado } = require('../src/transparencia/valor-final-empenho');
const { medirDuplicidadePorAno } = require('../src/licitacoes/duplicidade-valor-ano');

const VF_LD = sqlValorFinalHomologado('ld');

// Mesmo filtro e mesmo valor do por_ano do panorama.
const SQL_DOCUMENTOS = `
  SELECT d.id, d.tipo, d.ano, d.numero, d.titulo, ld.numero_pncp,
         (SELECT lgd.grupo_id FROM licitacoes_grupo_documentos lgd
           WHERE lgd.documento_id = d.id LIMIT 1) AS grupo_id,
         ${VF_LD} AS valor_final
    FROM documentos d
    JOIN licitacoes_detalhes ld ON ld.documento_id = d.id
   WHERE d.tipo IN ('edital','publicacao_extrato') AND d.ano IS NOT NULL
     AND ${VF_LD} IS NOT NULL`;

// A conferência pedida: linhas vs grupos distintos por ano.
const SQL_GRUPOS_POR_ANO = `
  SELECT d.ano, COUNT(*) AS linhas, COUNT(DISTINCT lgd.grupo_id) AS grupos_distintos,
         SUM(CASE WHEN lgd.grupo_id IS NULL THEN 1 ELSE 0 END) AS sem_grupo
    FROM documentos d
    JOIN licitacoes_detalhes ld ON ld.documento_id = d.id
    LEFT JOIN licitacoes_grupo_documentos lgd ON lgd.documento_id = d.id
   WHERE d.tipo IN ('edital','publicacao_extrato') AND d.ano IS NOT NULL
     AND ${VF_LD} IS NOT NULL
   GROUP BY d.ano ORDER BY d.ano DESC`;

function imprimirTexto({ grupos, medidas }) {
  console.warn('== linhas x grupos distintos (documentos com valor final) ==');
  console.table(grupos);
  console.warn('== soma bruta x soma deduplicada por chave ==');
  console.table(
    medidas.map(m => ({
      ano: m.ano,
      documentos: m.documentos,
      editais: m.editais,
      soma_bruta: m.soma_bruta,
      ...Object.fromEntries(
        Object.entries(m.estrategias).map(([nome, e]) => [`excesso_${nome}`, e.excesso])
      ),
    }))
  );
  medidas.forEach(m => {
    Object.entries(m.estrategias).forEach(([nome, e]) => {
      if (!e.exemplos.length) {
        return;
      }
      console.warn(`-- ${m.ano} / ${nome}: exemplos de documentos na mesma chave`);
      console.warn(JSON.stringify(e.exemplos, null, 2));
    });
  });
}

function main() {
  const args = process.argv.slice(2);
  const caminho = args.find(a => !a.startsWith('--')) || config.dbPath;
  const db = new DatabaseSync(caminho, { readOnly: true });
  try {
    const resultado = {
      banco: caminho,
      grupos: db.prepare(SQL_GRUPOS_POR_ANO).all(),
      medidas: medirDuplicidadePorAno(db.prepare(SQL_DOCUMENTOS).all()),
    };
    if (args.includes('--json')) {
      process.stdout.write(`${JSON.stringify(resultado, null, 2)}\n`);
      return;
    }
    imprimirTexto(resultado);
  } finally {
    db.close();
  }
}

main();
