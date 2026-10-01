'use strict';

async function checkpointInput(progress, key, read) {
  const saved = progress?.load(`${key}:input`);
  if (saved) {
    return saved.rows;
  }
  progress?.checkTime();
  const rows = await read();
  progress?.save(`${key}:input`, { rows });
  return rows;
}

async function processRows(progress, key, rows, prepare, persist) {
  let state = progress?.load(`${key}:cursor`) || {
    next: 0,
    novos: 0,
    atualizados: 0,
    semAlteracao: 0,
    registros: rows.length,
  };
  if (
    state.registros !== rows.length ||
    !Number.isSafeInteger(state.next) ||
    state.next < 0 ||
    state.next > rows.length
  ) {
    throw new Error('Progresso financeiro diverge da entrada preservada');
  }
  for (let index = state.next; index < rows.length; index++) {
    progress?.checkTime();
    const prepared = await prepare(rows[index]);
    const write = () => {
      const action = persist(prepared);
      if (!['inserted', 'updated', 'unchanged'].includes(action)) {
        throw new Error('Registro financeiro recusado: identidade incompleta');
      }
      const next = { ...state, next: index + 1 };
      next[{ inserted: 'novos', updated: 'atualizados', unchanged: 'semAlteracao' }[action]]++;
      progress?.save(`${key}:cursor`, next);
      return next;
    };
    state = progress ? progress.commit(write) : write();
  }
  const { next: _next, ...stats } = state;
  return stats;
}

module.exports = { checkpointInput, processRows };
