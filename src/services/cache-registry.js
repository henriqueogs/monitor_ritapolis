'use strict';

// Registro central dos memos TTL dos agregados pesados (painel, transparência,
// gastos). Schedulers chamam `invalidarTodos()` ao fim de uma coleta
// bem-sucedida, sem precisar conhecer cada service individualmente.
const memos = new Set();

function registrar(memo) {
  memos.add(memo);
  return memo;
}

function invalidarTodos() {
  for (const memo of memos) {
    memo.invalidate();
  }
}

module.exports = { registrar, invalidarTodos };
