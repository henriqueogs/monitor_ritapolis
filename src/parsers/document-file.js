const mammoth = require('mammoth');
const WordExtractor = require('word-extractor');
const XLSX = require('xlsx');
const { extractPdfText } = require('./pdf');
const { normalizeText } = require('../utils/text');

const SPREADSHEET_MAX_SHEETS = 12;
const SPREADSHEET_MAX_ROWS_PER_SHEET = 3000;
const SPREADSHEET_MAX_COLS = 60;
const SPREADSHEET_MAX_CHARS = 1500000;

function inferFileExtension({ filename = '', url = '' } = {}) {
  const sources = [filename, url].filter(Boolean).map((value) => String(value).toLowerCase());

  for (const source of sources) {
    const cleanSource = source.split('#')[0];
    const matches = [
      ...cleanSource.matchAll(
        /\.(pdf|jpe?g|png|tiff?|bmp|docx|doc|txt|csv|xml|rtf|log|xls|xlsx|ods|zip|rar|7z|dwg|dxf|exe)(?=$|[^\w])/gi
      )
    ];
    const lastMatch = matches.at(-1);

    if (lastMatch) {
      return lastMatch[1].toLowerCase();
    }
  }

  return null;
}

function normalizeWhitespace(text) {
  return normalizeText(text).replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim();
}

function extractPlainText(buffer, extension) {
  let text = buffer.toString('utf8');

  if (extension === 'rtf') {
    text = text
      .replace(/\\'[0-9a-f]{2}/gi, ' ')
      .replace(/\\[a-z]+-?\d* ?/gi, ' ')
      .replace(/[{}]/g, ' ');
  }

  return {
    text: normalizeWhitespace(text),
    pages: 0,
    info: {
      parser: 'plain-text',
      tipo_arquivo: extension
    },
    error: null
  };
}

function unsupportedFile(extension, statusSugerido, message) {
  return {
    text: '',
    pages: 0,
    info: {
      parser: 'unsupported-file',
      tipo_arquivo: extension,
      unsupported: true,
      status_sugerido: statusSugerido
    },
    error: message
  };
}

function normalizeCellValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  return normalizeWhitespace(String(value))
    .replace(/\|/g, '/')
    .replace(/\n+/g, ' ')
    .trim();
}

function isEmptySpreadsheetRow(row) {
  return !row.some((cell) => normalizeCellValue(cell));
}

function pushSpreadsheetLine(lines, line, state) {
  if (state.chars >= SPREADSHEET_MAX_CHARS) {
    state.truncated = true;
    return false;
  }

  const next = String(line || '');
  lines.push(next);
  state.chars += next.length + 1;
  return true;
}

function extractSpreadsheetText(buffer, extension) {
  try {
    const workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: true,
      dense: false
    });
    const lines = [
      `[PLANILHA ${extension}]`,
      'Formato: cada linha abaixo preserva as celulas como valores separados por | para extracao automatica.'
    ];
    const state = { chars: lines.join('\n').length, truncated: false };
    const sheetNames = workbook.SheetNames.slice(0, SPREADSHEET_MAX_SHEETS);

    for (const sheetName of sheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {continue;}

      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: false,
        defval: '',
        blankrows: false
      });
      const nonEmptyRows = rows
        .map((row) => row.slice(0, SPREADSHEET_MAX_COLS).map(normalizeCellValue))
        .filter((row) => !isEmptySpreadsheetRow(row));

      if (!nonEmptyRows.length) {continue;}

      if (!pushSpreadsheetLine(lines, '', state)) {break;}
      if (!pushSpreadsheetLine(lines, `[ABA] ${normalizeCellValue(sheetName)}`, state)) {break;}

      const limitedRows = nonEmptyRows.slice(0, SPREADSHEET_MAX_ROWS_PER_SHEET);
      limitedRows.forEach((row, index) => {
        pushSpreadsheetLine(lines, `LINHA ${index + 1} | ${row.join(' | ')}`, state);
      });

      if (nonEmptyRows.length > limitedRows.length) {
        pushSpreadsheetLine(lines, `[ABA TRUNCADA] ${nonEmptyRows.length - limitedRows.length} linhas omitidas`, state);
      }

      if (state.truncated) {break;}
    }

    if (workbook.SheetNames.length > sheetNames.length) {
      pushSpreadsheetLine(lines, `[PLANILHA TRUNCADA] ${workbook.SheetNames.length - sheetNames.length} abas omitidas`, state);
    }

    if (state.truncated) {
      lines.push('[TEXTO TRUNCADO] limite de caracteres atingido');
    }

    return {
      text: normalizeWhitespace(lines.join('\n')),
      pages: sheetNames.length,
      info: {
        parser: 'xlsx',
        tipo_arquivo: extension,
        sheets: workbook.SheetNames.length,
        truncated: state.truncated
      },
      error: null
    };
  } catch (error) {
    return {
      text: '',
      pages: 0,
      info: {
        parser: 'xlsx',
        tipo_arquivo: extension
      },
      error: error.message
    };
  }
}

async function extractDocxText(buffer) {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return {
      text: normalizeWhitespace(result.value || ''),
      pages: 0,
      info: {
        parser: 'mammoth',
        tipo_arquivo: 'docx',
        warnings: result.messages || []
      },
      error: null
    };
  } catch (error) {
    return {
      text: '',
      pages: 0,
      info: {
        parser: 'mammoth',
        tipo_arquivo: 'docx'
      },
      error: error.message
    };
  }
}

async function extractDocText(buffer) {
  try {
    const extractor = new WordExtractor();
    const document = await extractor.extract(buffer);
    const body = document.getBody();
    const footnotes = document.getFootnotes?.() || '';
    const endnotes = document.getEndnotes?.() || '';
    const headers = document.getHeaders?.() || '';
    const footers = document.getFooters?.() || '';
    const text = [headers, body, footers, footnotes, endnotes].filter(Boolean).join('\n\n');

    return {
      text: normalizeWhitespace(text),
      pages: 0,
      info: {
        parser: 'word-extractor',
        tipo_arquivo: 'doc'
      },
      error: null
    };
  } catch (error) {
    return {
      text: '',
      pages: 0,
      info: {
        parser: 'word-extractor',
        tipo_arquivo: 'doc'
      },
      error: error.message
    };
  }
}

async function extractOfficialFileText(buffer, metadata = {}) {
  const extension = inferFileExtension(metadata);

  if (['txt', 'csv', 'xml', 'rtf', 'log'].includes(extension)) {
    return extractPlainText(buffer, extension);
  }

  if (['xls', 'xlsx', 'ods'].includes(extension)) {
    return extractSpreadsheetText(buffer, extension);
  }

  if (['zip', 'rar', '7z', 'dwg', 'dxf', 'exe'].includes(extension)) {
    return unsupportedFile(extension, 'ignorado_sem_texto_util', `arquivo ${extension} nao e OCRavel`);
  }

  if (extension === 'docx') {
    return extractDocxText(buffer);
  }

  if (extension === 'doc') {
    return extractDocText(buffer);
  }

  const pdf = await extractPdfText(buffer);
  return {
    ...pdf,
    info: {
      ...(pdf.info || {}),
      tipo_arquivo: 'pdf'
    }
  };
}

module.exports = {
  extractDocText,
  extractDocxText,
  extractSpreadsheetText,
  extractOfficialFileText,
  inferFileExtension
};
