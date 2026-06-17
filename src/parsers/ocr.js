'use strict';

// OCR local, sem IA: pdftoppm (poppler/MiKTeX) rasteriza o PDF em PNG e o
// tesseract.js (WASM, português) reconhece o texto. Para anexos que já são
// imagem (.jpg/.png), o tesseract roda direto. Nada disso é LLM — é OCR óptico
// tradicional, offline (após o download único do idioma 'por').

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { createWorker } = require('tesseract.js');
const { limparRuidoOcr } = require('../utils/text');

const DPI_PADRAO = 200;
const MAX_PAGINAS_PADRAO = 12;

let workerPromise = null;

// Worker reutilizado entre chamadas (carregar o idioma é caro).
async function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('por');
  }
  return workerPromise;
}

async function encerrarWorker() {
  if (workerPromise) {
    const w = await workerPromise;
    await w.terminate();
    workerPromise = null;
  }
}

function tmpDir() {
  const dir = path.join(os.tmpdir(), `ocr-${crypto.randomBytes(6).toString('hex')}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// PDF (buffer) → array de caminhos PNG (uma por página, até maxPaginas).
function rasterizarPdf(buffer, dir, { dpi = DPI_PADRAO, maxPaginas = MAX_PAGINAS_PADRAO } = {}) {
  const pdfPath = path.join(dir, 'in.pdf');
  fs.writeFileSync(pdfPath, buffer);
  const prefix = path.join(dir, 'pg');
  execFileSync(
    'pdftoppm',
    ['-png', '-r', String(dpi), '-l', String(maxPaginas), pdfPath, prefix],
    { stdio: 'ignore' }
  );
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('pg') && f.endsWith('.png'))
    .sort()
    .map((f) => path.join(dir, f));
}

async function ocrImagens(caminhos) {
  const worker = await getWorker();
  const partes = [];
  for (const caminho of caminhos) {
    const { data } = await worker.recognize(caminho);
    // Remove o ruído por página (brasão/carimbo/logo que vira caractere aleatório)
    // antes de juntar — mantém só o conteúdo legível de cada imagem.
    const limpo = limparRuidoOcr(data.text);
    if (limpo) {
      partes.push(limpo);
    }
  }
  return partes.join('\n\n');
}

// OCR de um buffer de PDF. Retorna o texto reconhecido (pode ser vazio).
async function ocrPdfBuffer(buffer, opcoes = {}) {
  const dir = tmpDir();
  try {
    const pngs = rasterizarPdf(buffer, dir, opcoes);
    if (pngs.length === 0) {
      return { texto: '', paginas: 0 };
    }
    const texto = await ocrImagens(pngs);
    return { texto, paginas: pngs.length };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// OCR de um buffer de imagem (jpg/png/tiff).
async function ocrImagemBuffer(buffer) {
  const dir = tmpDir();
  try {
    const img = path.join(dir, 'img');
    fs.writeFileSync(img, buffer);
    const texto = await ocrImagens([img]);
    return { texto, paginas: 1 };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = {
  ocrPdfBuffer,
  ocrImagemBuffer,
  encerrarWorker,
};
