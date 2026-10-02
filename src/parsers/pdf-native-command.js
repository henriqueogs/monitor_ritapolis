'use strict';
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { PipelineYield } = require('../pipeline/progress');
const execute = promisify(execFile);
async function runPdfCommand(command, args, { progress, maxBuffer = 2 * 1024 * 1024 } = {}) {
  if (!['pdfinfo', 'pdftotext', 'pdftoppm'].includes(command))
    {throw new Error('PDF: comando nao permitido');}
  if (process.platform !== 'linux') {throw new Error('PDF: extracao grande requer isolamento Linux');}
  progress?.checkTime();
  if (progress && progress.remainingMs() < 31000) {throw new PipelineYield();}
  const timeout = Math.min(30000, progress ? progress.remainingMs() - 1000 : 30000);
  try {
    const result = await execute(
      'prlimit',
      ['--as=268435456', '--cpu=25', '--', command, ...args],
      { timeout, maxBuffer, encoding: 'utf8', windowsHide: true }
    );
    return result.stdout;
  } catch (e) {
    if (progress && e.killed && progress.remainingMs() <= 1000) {throw new PipelineYield();}
    if (e.killed) {throw new Error('PDF: timeout na extracao por pagina');}
    if (e.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER')
      {throw new Error('PDF: pagina excede limite de texto');}
    throw new Error(`PDF: falha no parser isolado ${command} (${e.code || e.signal || 'erro'})`);
  }
}
module.exports = { runPdfCommand };
