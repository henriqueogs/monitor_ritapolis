'use strict';

/**
 * Remove documentos da Câmara que foram criados a partir de páginas estáticas
 * institucionais (LAI, ordem cronológica) ou que são referências a legislação
 * externa (federal / órgão de controle) e widgets de UI — sem conteúdo nem fonte
 * própria. Usa exatamente os mesmos filtros do coletor (camara.js), então o que
 * é limpo aqui é o que o coletor passou a recusar.
 *
 * Conservador: só remove documentos SEM PDF e SEM texto (contentless). Normas
 * municipais legítimas (Resolução/Portaria Legislativa) são preservadas.
 *
 * Dry-run por padrão. Uso:
 *   node scripts/limpar-camara-sem-fonte.js
 *   node scripts/limpar-camara-sem-fonte.js --apply
 */

process.loadEnvFile?.() || require('dotenv').config();

const { setupDatabase } = require('../src/db/setup');
const { db } = require('../src/db');
const { isLegislacaoExterna, isModuloInstitucional } = require('../src/coletores/camara');

function parseArgs(argv) {
  return { apply: argv.includes('--apply') };
}

function ehLixoSemFonte(doc) {
  // Só consideramos remoção de documentos sem conteúdo nenhum.
  if (doc.url_pdf || (doc.texto_completo && doc.texto_completo.trim())) {
    return false;
  }
  if (isModuloInstitucional(doc.modulo)) {
    return true;
  }
  if (isLegislacaoExterna(doc.titulo)) {
    return true;
  }
  // Widget seletor de exercício (anos concatenados)
  if (/(20\d{2}){3,}/.test(doc.titulo || '')) {
    return true;
  }
  return false;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  setupDatabase();

  const docs = db
    .prepare(
      `SELECT id, titulo, url_pdf, texto_completo,
              json_extract(dados_extras, '$.modulo') AS modulo
         FROM documentos
        WHERE fonte = 'camara' AND status_coleta = 'sem_pdf'`
    )
    .all();

  const remover = db.prepare('DELETE FROM documentos WHERE id = ?');
  const alvos = docs.filter(ehLixoSemFonte);

  console.warn(`Câmara sem_pdf avaliados: ${docs.length} · a remover: ${alvos.length}${opts.apply ? '' : ' (dry-run)'}`);
  for (const d of alvos) {
    console.warn(`  #${d.id} — ${(d.titulo || '').slice(0, 70)}`);
    if (opts.apply) {
      remover.run(d.id);
    }
  }

  const preservados = docs.filter((d) => !ehLixoSemFonte(d));
  console.warn(`\nPreservados (normas municipais legítimas): ${preservados.length}`);
  for (const d of preservados) {
    console.warn(`  #${d.id} — ${(d.titulo || '').slice(0, 70)}`);
  }
  console.warn(`\n${opts.apply ? 'Removidos' : 'Dry-run'}: ${alvos.length}`);
}

main();
