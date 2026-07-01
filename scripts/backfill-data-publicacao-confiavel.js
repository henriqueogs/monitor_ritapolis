'use strict';

const { db } = require('../src/db/connection');

const MESES = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  março: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function isoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseNumericDate(value) {
  const match = String(value).match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (!match) { return null; }
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900) { return null; }
  return isoDate(year, month, day);
}

function parseLongDate(value) {
  const normalized = String(value).replace(/\s+/g, ' ').trim().toLowerCase();
  const match = normalized.match(/\b(\d{1,2})\s+de\s+([a-zçã]+)\s+de\s+(\d{4})\b/i);
  if (!match) { return null; }
  const day = Number(match[1]);
  const month = MESES[match[2]];
  const year = Number(match[3]);
  if (!month || day < 1 || day > 31) { return null; }
  return isoDate(year, month, day);
}

function extractDates(text) {
  const dates = new Set();
  const source = String(text || '').replace(/\s+/g, ' ');
  const regex = /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b\d{1,2}\s+de\s+[a-zçã]+\s+de\s+\d{4}\b/gi;
  for (const match of source.matchAll(regex)) {
    const parsed = parseNumericDate(match[0]) || parseLongDate(match[0]);
    if (parsed) { dates.add(parsed); }
  }
  return [...dates].sort();
}

function main() {
  const apply = hasFlag('apply');
  const rows = db
    .prepare(
      `SELECT id, ano, tipo, titulo, texto_completo
         FROM documentos
        WHERE IFNULL(data_publicacao, '') = ''
        ORDER BY ano DESC, id DESC`
    )
    .all();

  const candidates = [];
  const skipped = [];

  for (const row of rows) {
    const titleDates = extractDates(row.titulo);
    const textDates = extractDates(String(row.texto_completo || '').slice(0, 4000));
    const allDates = [...new Set([...titleDates, ...textDates])].sort();
    const sameYear = allDates.filter((date) => Number(date.slice(0, 4)) === Number(row.ano));

    const chosen =
      titleDates.length === 1 && Number(titleDates[0].slice(0, 4)) === Number(row.ano)
        ? titleDates[0]
        : sameYear.length === 1
          ? sameYear[0]
          : null;

    if (chosen) {
      candidates.push({
        id: row.id,
        ano: row.ano,
        tipo: row.tipo,
        titulo: row.titulo,
        data: chosen,
      });
    } else {
      skipped.push({
        id: row.id,
        ano: row.ano,
        titulo: row.titulo,
        datas_mesmo_ano: sameYear,
        datas_encontradas: allDates,
      });
    }
  }

  console.log(`${apply ? 'Aplicando' : 'Dry-run'} backfill conservador de data_publicacao`);
  console.log(`Candidatos confiaveis: ${candidates.length}`);
  candidates.forEach((item) => {
    console.log(`#${item.id} ${item.ano} -> ${item.data} ${item.titulo.slice(0, 90)}`);
  });
  console.log(`Ignorados por ambiguidade/ausencia: ${skipped.length}`);

  if (!apply) {
    console.log('\nUse: npm run dados:backfill-datas -- --apply');
    return;
  }

  const update = db.prepare(
    `UPDATE documentos
        SET data_publicacao = @data_publicacao,
            atualizado_em = CURRENT_TIMESTAMP
      WHERE id = @id
        AND IFNULL(data_publicacao, '') = ''`
  );

  let updated = 0;
  for (const item of candidates) {
    updated += update.run({ id: item.id, data_publicacao: item.data }).changes || 0;
  }
  console.log(`Datas preenchidas: ${updated}`);
}

main();
