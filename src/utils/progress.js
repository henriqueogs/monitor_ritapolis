'use strict';

// Rastreador de progresso reaproveitável para scripts de longa duração.
// Produz dois artefatos em logs/ (acompanháveis por `tail -f`):
//   - progresso-<nome>.log         → linhas com timestamp (início, heartbeat, fim)
//   - progresso-<nome>.status.json → estado atual (processados, taxa, ETA,
//                                     atualizado_em) com escrita atômica
// O campo `atualizado_em` é a chave para detectar travamento: se não avança há
// muito tempo e `concluido` é false, o job pode estar preso/em loop.

const fs = require('fs');
const path = require('path');
const config = require('../config');

const HEARTBEAT_MS = 15000; // intervalo mínimo entre linhas de heartbeat no log

function fmtDuracao(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  if (h) {
    return `${h}h${String(m).padStart(2, '0')}m`;
  }
  if (m) {
    return `${m}m${String(seg).padStart(2, '0')}s`;
  }
  return `${seg}s`;
}

function criarProgresso(nome, { total = null, dir = config.logDir } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const slug = String(nome).replace(/[^\w.-]+/g, '-');
  const logPath = path.join(dir, `progresso-${slug}.log`);
  const statusPath = path.join(dir, `progresso-${slug}.status.json`);

  const inicio = Date.now();
  let processados = 0;
  let ultimoHeartbeat = 0;
  const contadores = {};

  function escreverLinha(linha) {
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${linha}\n`);
  }

  function escreverStatus(extra = {}) {
    const decorrido = Date.now() - inicio;
    const taxaPorMin = processados > 0 ? processados / (decorrido / 60000) : 0;
    const restante = total !== null ? Math.max(0, total - processados) : null;
    const etaSeg = taxaPorMin > 0 && restante !== null ? Math.round((restante / taxaPorMin) * 60) : null;
    const status = {
      nome,
      pid: process.pid,
      total,
      processados,
      contadores,
      iniciado_em: new Date(inicio).toISOString(),
      atualizado_em: new Date().toISOString(),
      decorrido_s: Math.round(decorrido / 1000),
      taxa_por_min: Number(taxaPorMin.toFixed(1)),
      eta_s: etaSeg,
      concluido: Boolean(extra.concluido),
      ...extra,
    };
    // Escrita atômica (tmp + rename) — leitor nunca vê JSON pela metade.
    const tmp = `${statusPath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(status, null, 2));
    fs.renameSync(tmp, statusPath);
    return status;
  }

  escreverLinha(`INÍCIO ${nome}${total !== null ? ` — ${total} itens` : ''} (pid ${process.pid})`);
  escreverStatus();

  return {
    logPath,
    statusPath,

    // Marca avanço de 1 item. `info` (opcional) vira linha no log; `categoria`
    // (opcional) incrementa um contador nomeado (ex.: 'ok', 'erro').
    tick(info = null, categoria = null) {
      processados += 1;
      if (categoria) {
        contadores[categoria] = (contadores[categoria] || 0) + 1;
      }
      const st = escreverStatus();
      if (Date.now() - ultimoHeartbeat >= HEARTBEAT_MS) {
        ultimoHeartbeat = Date.now();
        const alvo = total !== null ? `/${total}` : '';
        const eta = st.eta_s !== null ? ` · ETA ${fmtDuracao(st.eta_s * 1000)}` : '';
        escreverLinha(`progresso ${processados}${alvo} · ${st.taxa_por_min}/min${eta}${info ? ` · ${info}` : ''}`);
      } else if (info) {
        escreverLinha(info);
      }
    },

    // Evento avulso, sem incrementar processados (ex.: aviso, erro pontual).
    log(linha) {
      escreverLinha(linha);
      escreverStatus();
    },

    finish(resumo = null) {
      escreverLinha(
        `FIM — ${processados} processados em ${fmtDuracao(Date.now() - inicio)}${resumo ? ` · ${resumo}` : ''}`
      );
      return escreverStatus({ concluido: true, resumo });
    },
  };
}

const LIMITE_TRAVADO_S = 180;

// Lê todos os status de progresso em `dir` e anota idade e estado
// (ativo / concluido / travado). Compartilhado pelo CLI e pela API admin.
function lerStatusProgresso(dir = config.logDir, { travadoS = LIMITE_TRAVADO_S } = {}) {
  let arquivos = [];
  try {
    arquivos = fs.readdirSync(dir).filter((f) => f.endsWith('.status.json'));
  } catch {
    return [];
  }
  const agora = Date.now();
  return arquivos
    .map((f) => {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        const idadeS = Math.round((agora - new Date(j.atualizado_em).getTime()) / 1000);
        const estado = j.concluido ? 'concluido' : idadeS > travadoS ? 'travado' : 'ativo';
        return { ...j, idade_s: idadeS, estado };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.atualizado_em).localeCompare(String(a.atualizado_em)));
}

module.exports = { criarProgresso, fmtDuracao, lerStatusProgresso, LIMITE_TRAVADO_S };
