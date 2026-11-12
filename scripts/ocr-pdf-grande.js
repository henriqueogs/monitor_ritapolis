'use strict';

/**
 * OCR local, página a página, de um PDF grande que já está em disco (acima do teto de download
 * da coleta, ex.: LOA de 100+ MB). Retomável: o texto de cada página fica num arquivo ao lado do
 * JSON de saída. O JSON segue o formato de `ocr-documentos-imagem.js --exportar`, então a
 * produção aplica com `scripts/aplicar-ocr-exportado.js` (casa por url_pdf).
 *
 * Uso:
 *   node scripts/ocr-pdf-grande.js --arquivo=loa.pdf --url-pdf=<URL> --exportar=loa.json [--ate=N]
 */

process.loadEnvFile?.() || require('dotenv').config();

const fs = require('fs');
const { execFileSync } = require('child_process');
const { ocrPdfFilePage, encerrarWorker } = require('../src/parsers/ocr');

const argumento = nome => {
  const par = process.argv.find(a => a.startsWith(`--${nome}=`));
  return par ? par.slice(nome.length + 3) : undefined;
};

function contarPaginas(arquivo) {
  const saida = execFileSync('pdfinfo', [arquivo], { encoding: 'utf8' });
  const m = saida.match(/^Pages:\s+(\d+)/m);
  if (!m) {
    throw new Error('pdfinfo não informou o número de páginas');
  }
  return Number(m[1]);
}

async function main() {
  const arquivo = argumento('arquivo');
  const urlPdf = argumento('url-pdf');
  const saida = argumento('exportar');
  if (!arquivo || !urlPdf || !saida) {
    throw new Error('uso: --arquivo=<pdf> --url-pdf=<url> --exportar=<json> [--ate=N]');
  }
  const total = contarPaginas(arquivo);
  const ate = Math.min(Number(argumento('ate')) || total, total);
  const progresso = `${saida}.paginas.json`;
  const feitas = fs.existsSync(progresso) ? JSON.parse(fs.readFileSync(progresso, 'utf8')) : {};
  console.warn(`${total} páginas; OCR até a ${ate}; ${Object.keys(feitas).length} já feitas`);

  for (let pagina = 1; pagina <= ate; pagina += 1) {
    if (feitas[pagina] !== undefined) {
      continue;
    }
    feitas[pagina] = await ocrPdfFilePage(arquivo, pagina);
    fs.writeFileSync(progresso, JSON.stringify(feitas));
    console.warn(`página ${pagina}/${ate}: ${feitas[pagina].length} caracteres`);
  }

  const texto = Array.from({ length: ate }, (_, i) => feitas[i + 1] || '')
    .filter(Boolean)
    .join('\n\n');
  fs.writeFileSync(saida, JSON.stringify([{ id: null, url_pdf: urlPdf, texto, paginas: ate }]));
  console.warn(`exportado: ${texto.length} caracteres em ${ate} páginas`);
  await encerrarWorker?.();
}

main().catch(erro => {
  console.error(erro.message);
  process.exitCode = 1;
});
