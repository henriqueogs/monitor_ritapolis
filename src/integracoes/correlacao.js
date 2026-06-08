const { normalizeNumeroPncpChave } = require('../licitacoes/processo');

function parseNumber(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const text = String(value)
    .replace(/[^\d,.-]/g, '')
    .trim();

  if (!text) return null;
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text;
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function compareValores(local, remoto) {
  if (local == null || remoto == null) {
    return { status: 'ausente', divergencia_abs: null, divergencia_pct: null };
  }

  const diff = Math.abs(local - remoto);
  const pct = remoto ? diff / Math.abs(remoto) : null;

  if (diff <= 1 || (pct != null && pct <= 0.01)) {
    return { status: 'confirmado', divergencia_abs: diff, divergencia_pct: pct };
  }

  if (pct != null && pct <= 0.1) {
    return { status: 'aproximado', divergencia_abs: diff, divergencia_pct: pct };
  }

  return { status: 'divergente', divergencia_abs: diff, divergencia_pct: pct };
}

function compararLicitacaoComPncp(local, candidato = {}) {
  const campos = [];
  const localPncp = normalizeNumeroPncpChave(local?.numero_pncp);
  const remotoPncp = normalizeNumeroPncpChave(
    candidato.numeroControlePNCP || candidato.idContratacaoPNCP
  );

  if (localPncp || remotoPncp) {
    campos.push({
      campo: 'numero_pncp',
      local: local?.numero_pncp || null,
      remoto: candidato.numeroControlePNCP || candidato.idContratacaoPNCP || null,
      status:
        localPncp && remotoPncp && localPncp === remotoPncp ? 'confirmado' : 'divergente',
      divergencia_abs: null,
      divergencia_pct: null
    });
  }

  const localValor = parseNumber(local?.valor_final) ?? parseNumber(local?.valor_estimado);
  const remotoValor =
    parseNumber(candidato.valorTotalHomologado) ??
    parseNumber(candidato.valorTotalEstimado) ??
    parseNumber(candidato.valorGlobal) ??
    parseNumber(candidato.valorTotal);

  const valorCmp = compareValores(localValor, remotoValor);
  campos.push({
    campo: 'valor',
    local: localValor,
    remoto: remotoValor,
    ...valorCmp
  });

  const localObjeto = String(local?.objeto || local?.titulo || '').trim();
  const remotoObjeto = String(
    candidato.objetoCompra ||
      candidato.objetoContratacao ||
      candidato.objeto ||
      candidato.descricaoObjeto ||
      ''
  ).trim();

  campos.push({
    campo: 'objeto',
    local: localObjeto || null,
    remoto: remotoObjeto || null,
    status:
      localObjeto && remotoObjeto
        ? localObjeto.toLowerCase().includes(remotoObjeto.slice(0, 40).toLowerCase()) ||
          remotoObjeto.toLowerCase().includes(localObjeto.slice(0, 40).toLowerCase())
          ? 'aproximado'
          : 'revisar'
        : 'ausente',
    divergencia_abs: null,
    divergencia_pct: null
  });

  const alertas = campos
    .filter((item) => item.status === 'divergente')
    .map((item) => `Divergencia em ${item.campo}`);

  const confirmados = campos.filter((item) => item.status === 'confirmado').length;

  return {
    campos,
    alertas,
    resumo: {
      total_campos: campos.length,
      confirmados,
      divergentes: campos.filter((item) => item.status === 'divergente').length,
      revisar: campos.filter((item) => item.status === 'revisar').length
    }
  };
}

module.exports = {
  compararLicitacaoComPncp,
  compareValores
};
