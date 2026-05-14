const mammoth = require('mammoth');
const WordExtractor = require('word-extractor');
const { extractPdfText } = require('./pdf');
const { normalizeText } = require('../utils/text');

function inferFileExtension({ filename = '', url = '' } = {}) {
  const sources = [filename, url].filter(Boolean).map((value) => String(value).toLowerCase());

  for (const source of sources) {
    const cleanSource = source.split('#')[0];
    const matches = [...cleanSource.matchAll(/\.(pdf|docx|doc)(?=$|[^\w])/gi)];
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
  extractOfficialFileText,
  inferFileExtension
};
