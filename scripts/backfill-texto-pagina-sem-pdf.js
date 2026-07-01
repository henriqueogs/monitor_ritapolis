'use strict';

const crypto = require('crypto');
const { db } = require('../src/db/connection');

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseJson(value) {
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
}

function parseDateBr(value) {
  const match = clean(value).match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (!match) { return null; }
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900) { return null; }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function montarTexto(row) {
  const extras = parseJson(row.dados_extras);
  const campos = extras.campos || {};
  const processo = clean(campos['Processo nº'] || campos['Processo n°'] || campos.Processo || row.numero);
  const modalidade = clean(campos['Modalidade nº'] || campos['Modalidade n°'] || campos.Modalidade);
  const data = clean(campos.Data);
  const objeto = clean(campos.Objeto);
  const link = clean(campos['Link do processo']);

  const linhas = [
    clean(row.titulo),
    processo ? `Processo: ${processo}` : null,
    modalidade ? `Modalidade: ${modalidade}` : null,
    data ? `Data informada na fonte: ${data}` : null,
    objeto ? `Objeto: ${objeto}` : null,
    link && link !== 'http://' ? `Link do processo: ${link}` : null,
    'Fonte: campos oficiais da pagina de editais da Prefeitura; sem anexo/PDF publicado no cadastro.',
  ].filter(Boolean);

  return {
    texto: linhas.join('\n'),
    dataPublicacao: parseDateBr(data),
  };
}

function main() {
  const apply = hasFlag('apply');
  const rows = db.prepare(`
    SELECT id, ano, numero, titulo, dados_extras
      FROM documentos
     WHERE tipo = 'edital'
       AND (status_coleta = 'sem_pdf' OR IFNULL(url_pdf, '') = '')
       AND LENGTH(TRIM(IFNULL(texto_completo, ''))) = 0
     ORDER BY ano DESC, id
  `).all();

  const candidates = rows
    .map((row) => ({ ...row, ...montarTexto(row) }))
    .filter((row) => row.texto.length >= 80);

  console.log(`${apply ? 'Aplicando' : 'Dry-run'} backfill de texto oficial de pagina para editais sem PDF`);
  console.log(`Candidatos: ${candidates.length}`);
  for (const row of candidates) {
    console.log(`#${row.id} ${row.ano} ${row.numero} · ${row.texto.length} chars`);
  }

  if (!apply) {
    console.log('\nUse: npm run dados:backfill-texto-pagina -- --apply');
    return;
  }

  const update = db.prepare(`
    UPDATE documentos
       SET texto_completo = @texto,
           hash_conteudo = @hash,
           data_publicacao = COALESCE(data_publicacao, @data_publicacao),
           atualizado_em = CURRENT_TIMESTAMP
     WHERE id = @id
       AND LENGTH(TRIM(IFNULL(texto_completo, ''))) = 0
  `);

  let updated = 0;
  for (const row of candidates) {
    updated += update.run({
      id: row.id,
      texto: row.texto,
      hash: crypto.createHash('sha256').update(row.texto).digest('hex'),
      data_publicacao: row.dataPublicacao,
    }).changes || 0;
  }

  console.log(`Documentos atualizados: ${updated}`);
}

main();
