'use strict';

const present = value => value !== null && value !== undefined && value !== '';

function matchingNumber(kind, label, values, { year = false } = {}) {
  const raw = values.filter(present);
  if (raw.some(value => !(typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))))) {
    throw new Error(`PNCP: identificador oficial invalido (${label})`);
  }
  const supplied = raw.map(value => Number(value));
  if (!supplied.length) {
    throw new Error(`PNCP: identificador oficial incompleto (${kind})`);
  }
  if (supplied.some(value => !Number.isSafeInteger(value) || value <= 0
      || (year ? value < 1000 || value > 9999 : value > 999999))) {
    throw new Error(`PNCP: identificador oficial invalido (${label})`);
  }
  if (new Set(supplied).size !== 1) {
    throw new Error(`PNCP: identificadores oficiais divergentes (${label})`);
  }
  return supplied[0];
}

function parseControl(value, kind) {
  if (!present(value)) {
    return null;
  }
  const pattern = kind === 'ata'
    ? /^(\d{14})-1-(\d{6})\/(\d{4})-(\d{6})$/
    : new RegExp(`^(\\d{14})-${kind === 'contrato' ? 2 : 1}-(\\d{6})\\/(\\d{4})$`);
  const parsed = String(value).match(pattern);
  if (!parsed) {
    throw new Error(`PNCP: identificador oficial invalido (${kind})`);
  }
  return { cnpj: parsed[1], seq: Number(parsed[2]), year: Number(parsed[3]),
    ...(kind === 'ata' ? { ata: Number(parsed[4]) } : {}) };
}

// Resolve only authoritative fields/control IDs, checking every redundant
// claim. Publication/ata year is never substituted for the purchase year.
function resolvePncpIdentity(record, orgao, kind) {
  if (!['compra', 'contrato', 'ata'].includes(kind)) {
    throw new Error('PNCP: tipo de identificador desconhecido');
  }
  const controls = (kind === 'ata'
    ? [record.numeroControlePNCPAta, record.numeroControle, record.numeroControlePNCP]
    : [record.numeroControlePNCP]).filter(present).map(value => parseControl(value, kind));
  const purchases = kind === 'ata'
    ? [record.numeroControlePNCPCompra, record.numeroControlePncpCompra]
      .filter(present).map(value => parseControl(value, 'compra')) : [];
  const cnpj = String(orgao.cnpj);
  if (!/^\d{14}$/.test(cnpj)) {
    throw new Error('PNCP: CNPJ da fonte invalido');
  }
  const reported = [record.orgaoEntidade?.cnpj, record.cnpjOrgao,
    ...controls.map(control => control.cnpj), ...purchases.map(control => control.cnpj)].filter(present);
  if (reported.some(value => String(value) !== cnpj)) {
    throw new Error('PNCP: identificador pertence a outro orgao ou diverge da fonte consultada');
  }
  const identities = [...controls, ...purchases];
  const year = matchingNumber(kind, 'ano', [kind === 'contrato' ? record.anoContrato : record.anoCompra,
    ...identities.map(control => control.year)], { year: true });
  const seq = matchingNumber(kind, 'sequencial', [kind === 'contrato' ? record.sequencialContrato : record.sequencialCompra,
    ...identities.map(control => control.seq)]);
  const ata = kind === 'ata' ? matchingNumber(kind, 'sequencialAta',
    [record.sequencialAta, ...controls.map(control => control.ata)]) : null;
  return { cnpj, year, seq, ata };
}

function buildSourceUrl(record, orgao, kind) {
  const { cnpj, year, seq, ata } = resolvePncpIdentity(record, orgao, kind);
  if (kind === 'compra') {
    return `https://pncp.gov.br/app/editais/${cnpj}/${year}/${seq}`;
  }
  if (kind === 'contrato') {
    return `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/contratos/${year}/${seq}`;
  }
  return `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/compras/${year}/${seq}/atas/${ata}`;
}

module.exports = { resolvePncpIdentity, buildSourceUrl };
