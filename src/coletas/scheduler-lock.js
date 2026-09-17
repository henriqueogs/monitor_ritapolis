'use strict';

/**
 * Mutex em processo compartilhado entre os schedulers de background
 * (collection-scheduler, daily-scheduler, ai-daily-scheduler,
 * descobertas-scheduler) -- todos rodam no mesmo processo Node, cada um
 * com seu proprio timer independente, sem coordenacao entre si.
 *
 * Achado real 17/09/2026: os 4 disparam o primeiro ciclo 30s-180s após o
 * boot (cada um com seu proprio delay fixo) -- se mais de um estiver "due"
 * no mesmo restart (comum: intervalos de 4h-24h, VM reinicia por deploy ou
 * pelo timer semanal), rodam concorrentes e derrubam a VM de 2 vCPU/954MB
 * em memory/IO thrashing real (confirmado ao vivo: swap-out ativo, node em
 * estado D, timeouts em cascata no PNCP/portal_transparencia -- efeito, não
 * causa). Este lock serializa os ciclos: se um scheduler ja esta rodando,
 * os outros pulam o tick (tentam de novo no proximo check, nao empilham).
 */

let dono = null;

function tryAcquire(nome) {
  if (dono) {
    return false;
  }
  dono = nome;
  return true;
}

function release(nome) {
  if (dono === nome) {
    dono = null;
  }
}

function isLocked() {
  return dono !== null;
}

function getDono() {
  return dono;
}

module.exports = { tryAcquire, release, isLocked, getDono };
