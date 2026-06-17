'use strict';

/**
 * Mostra o estado de todos os jobs de longa duração que usam o rastreador de
 * progresso (logs/progresso-*.status.json). Detecta possível travamento: se um
 * job não-concluído não atualiza há mais que o limite, é sinalizado.
 *
 * Uso:
 *   node scripts/status-progresso.js                 # snapshot
 *   node scripts/status-progresso.js --travado-s=180 # limite de staleness
 *   node scripts/status-progresso.js --watch         # atualiza a cada 5s
 */

const fs = require('fs');
const path = require('path');
const config = require('../src/config');
const { fmtDuracao } = require('../src/utils/progress');

const LIMITE_TRAVADO_S_PADRAO = 180;

function parseArgs(argv) {
  const o = { watch: false, travadoS: LIMITE_TRAVADO_S_PADRAO };
  for (const a of argv) {
    if (a === '--watch') {
      o.watch = true;
    } else if (a.startsWith('--travado-s=')) {
      o.travadoS = Number(a.split('=')[1]);
    }
  }
  return o;
}

function lerStatus() {
  let arquivos = [];
  try {
    arquivos = fs.readdirSync(config.logDir).filter((f) => f.endsWith('.status.json'));
  } catch {
    return [];
  }
  return arquivos
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(config.logDir, f), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.atualizado_em).localeCompare(String(a.atualizado_em)));
}

function render(travadoS) {
  const jobs = lerStatus();
  const linhas = [];
  linhas.push(`Jobs de progresso (${config.logDir}) — ${new Date().toLocaleTimeString()}`);
  if (!jobs.length) {
    linhas.push('  (nenhum job registrado)');
    return linhas.join('\n');
  }
  for (const j of jobs) {
    const idadeS = Math.round((Date.now() - new Date(j.atualizado_em).getTime()) / 1000);
    const alvo = j.total !== null ? `/${j.total}` : '';
    const pct = j.total ? ` (${Math.round((j.processados / j.total) * 100)}%)` : '';
    const eta = j.eta_s !== null ? ` · ETA ${fmtDuracao(j.eta_s * 1000)}` : '';
    let estado;
    if (j.concluido) {
      estado = '✓ concluído';
    } else if (idadeS > travadoS) {
      estado = `⚠ POSSÍVEL TRAVAMENTO (sem avanço há ${fmtDuracao(idadeS * 1000)})`;
    } else {
      estado = `▶ ativo (há ${fmtDuracao(idadeS * 1000)})`;
    }
    linhas.push(`  ${j.nome} [pid ${j.pid}] — ${estado}`);
    linhas.push(`     ${j.processados}${alvo}${pct} · ${j.taxa_por_min}/min${eta} · ${JSON.stringify(j.contadores || {})}`);
  }
  return linhas.join('\n');
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.watch) {
    console.log(render(opts.travadoS));
    return;
  }
  const tick = () => {
    process.stdout.write('\x1Bc'); // limpa a tela
    console.log(render(opts.travadoS));
  };
  tick();
  setInterval(tick, 5000);
}

main();
