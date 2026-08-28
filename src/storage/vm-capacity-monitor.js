'use strict';

/**
 * Avalia se a VM de produção (Oracle Cloud, hoje VM.Standard.E2.1.Micro,
 * 1 OCPU / 1GB) está sob pressão real de recursos — o gatilho pra sequer
 * cogitar migrar pra um shape maior (A1.Flex). Migrar sem essa pressão
 * seria trocar uma VM que funciona por uma que talvez nem tenha
 * capacidade disponível na região (ver memory reference_portal_...
 * project_render_suspenso_migracao_oracle — A1.Flex já deu "Out of host
 * capacity" uma vez).
 *
 * Entrada: a saída de texto de `report-capacity.sh` na VM (free -m + df -h
 * / + uptime), lida via SSH pelo workflow — este módulo só faz o parsing
 * e a avaliação, sem I/O.
 */

const LIMIAR_MEMORIA_PERCENT = 85;
const LIMIAR_DISCO_PERCENT = 85;
const LIMIAR_SWAP_MB = 500;

function parseRelatorioCapacidade(texto) {
  const linhas = String(texto || '').split(/\r?\n/);

  const linhaMem = linhas.find((l) => /^Mem:/.test(l.trim()));
  const linhaSwap = linhas.find((l) => /^Swap:/.test(l.trim()));
  const linhaDisco = linhas.find((l) => /%\s+\/\s*$/.test(l.trim()));
  const linhaCarga = linhas.find((l) => /load average/i.test(l));

  if (!linhaMem || !linhaDisco) {
    return null;
  }

  const memPartes = linhaMem.trim().split(/\s+/).map(Number);
  const [, memTotalMb, memUsedMb, memFreeMb] = memPartes;

  const swapPartes = linhaSwap ? linhaSwap.trim().split(/\s+/).map(Number) : [];
  const swapUsedMb = swapPartes[2] || 0;

  const discoMatch = linhaDisco.match(/(\d+)%/);
  const diskUsedPercent = discoMatch ? Number(discoMatch[1]) : null;

  const cargaMatch = linhaCarga ? linhaCarga.match(/load average:\s*([\d.]+)/i) : null;
  const loadAvg1m = cargaMatch ? Number(cargaMatch[1]) : null;

  return {
    memTotalMb,
    memUsedMb,
    memFreeMb,
    memUsedPercent: memTotalMb ? Math.round((memUsedMb / memTotalMb) * 100) : null,
    swapUsedMb,
    diskUsedPercent,
    loadAvg1m,
  };
}

/**
 * @returns {{status: 'ok'|'pressao', motivos: string[]}}
 */
function avaliarCapacidade(relatorio, limiares = {}) {
  const {
    memoriaPercent = LIMIAR_MEMORIA_PERCENT,
    discoPercent = LIMIAR_DISCO_PERCENT,
    swapMb = LIMIAR_SWAP_MB,
  } = limiares;

  const motivos = [];
  if (relatorio.memUsedPercent !== null && relatorio.memUsedPercent !== undefined && relatorio.memUsedPercent >= memoriaPercent) {
    motivos.push(`Memoria em ${relatorio.memUsedPercent}% (limiar ${memoriaPercent}%)`);
  }
  if (relatorio.diskUsedPercent !== null && relatorio.diskUsedPercent !== undefined && relatorio.diskUsedPercent >= discoPercent) {
    motivos.push(`Disco em ${relatorio.diskUsedPercent}% (limiar ${discoPercent}%)`);
  }
  if (relatorio.swapUsedMb !== null && relatorio.swapUsedMb !== undefined && relatorio.swapUsedMb >= swapMb) {
    motivos.push(`Swap em uso: ${relatorio.swapUsedMb}MB (limiar ${swapMb}MB)`);
  }

  return { status: motivos.length ? 'pressao' : 'ok', motivos };
}

module.exports = { parseRelatorioCapacidade, avaliarCapacidade, LIMIAR_MEMORIA_PERCENT, LIMIAR_DISCO_PERCENT, LIMIAR_SWAP_MB };
