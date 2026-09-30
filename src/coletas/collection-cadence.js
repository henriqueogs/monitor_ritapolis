'use strict';

const config = require('../config');

function utcTimestamp(value) {
  if (!value) { return 0; }
  // SQLite CURRENT_TIMESTAMP is UTC, including on a Windows/local-time host.
  const iso = String(value).replace(' ', 'T');
  return Date.parse(/[zZ]$|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`) || 0;
}

function intervalHours(ano, now = new Date()) {
  const age = now.getUTCFullYear() - ano;
  if (age === 0) { return config.dailySchedulerTransparenciaIntervalHoras; }
  return age === 1 ? 720 : 2160;
}

// The current year is always first. At most one historical year per day is
// reconciled, so old data remains checkable without monopolizing daily work.
function planCollectionYears({ anoInicio, getLog, now = new Date(), force = false }) {
  const current = now.getUTCFullYear();
  const years = [];
  for (let ano = current; ano >= anoInicio; ano -= 1) { years.push(ano); }
  if (force) { return years; }
  const entries = years.map((ano) => ({ ano, log: getLog(ano) }));
  const due = entries.filter(({ ano, log }) => {
    const elapsed = now.getTime() - utcTimestamp(log?.coletado_em);
    // Retry failed years after six hours, not on every scheduler tick.
    const hours = log && log.status !== 'ok' ? 6 : intervalHours(ano, now);
    return !log || elapsed >= hours * 3600000;
  });
  const recent = due.filter(({ ano }) => ano === current).map(({ ano }) => ano);
  const historicalWorkedToday = entries.some(({ ano, log }) => ano < current
    && utcTimestamp(log?.coletado_em) >= now.getTime() - 24 * 3600000);
  if (!historicalWorkedToday) {
    const historical = due.filter(({ ano }) => ano < current);
    // The previous year is more likely to receive financial corrections;
    // remaining years rotate by oldest verification (missing years first).
    historical.sort((a, b) => (b.ano === current - 1) - (a.ano === current - 1)
      || utcTimestamp(a.log?.coletado_em) - utcTimestamp(b.log?.coletado_em)
      || b.ano - a.ano);
    if (historical[0]) { recent.push(historical[0].ano); }
  }
  return recent;
}

module.exports = { planCollectionYears, intervalHours, utcTimestamp };
