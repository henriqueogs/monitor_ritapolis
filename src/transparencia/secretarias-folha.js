'use strict';

// Em out/2025 a Prefeitura passou a publicar "SECRETARIA DE X" onde antes
// publicava "DEPARTAMENTO MUNICIPAL DE X". Só entram aqui os pares em que o
// nome novo é, sem ambiguidade, a mesma pasta. Nomes curtos antigos
// ("EDUCACAO", "OBRAS", "FAZENDA"), Assistência Social, Agropecuária e o
// departamento de Turismo/Cultura/Esporte NÃO são unificados: seria inventar
// equivalência que a fonte não afirma.
const ALIAS_PARA_CANONICA = Object.freeze({
  'DEPARTAMENTO MUNICIPAL DE ADMINISTRACAO': 'SECRETARIA DE ADMINISTRACAO',
  'DEPARTAMENTO MUNICIPAL DE EDUCACAO': 'SECRETARIA DE EDUCACAO',
  'DEPARTAMENTO MUNICIPAL DE FAZENDA': 'SECRETARIA DE FAZENDA',
  'DEPARTAMENTO MUNICIPAL DE SAUDE': 'SECRETARIA DE SAUDE',
  'DEPARTAMENTO MUNICIPAL DE OBRAS E URBANIS': 'SECRETARIA DE OBRAS E URBANISMO',
  'DEPARTAMENTO MUNICIPAL DE ESPORTE E LAZER': 'SECRETARIA DE ESPORTES E LAZER',
});

function canonicalizarSecretaria(nome) {
  if (nome === null || nome === undefined) { return nome ?? null; }
  const limpo = String(nome).trim();
  return ALIAS_PARA_CANONICA[limpo] || limpo;
}

/** Todos os nomes brutos (novo + antigos) que pertencem à mesma secretaria. */
function nomesOriginais(nome) {
  const canonica = canonicalizarSecretaria(nome);
  const antigos = Object.keys(ALIAS_PARA_CANONICA).filter((k) => ALIAS_PARA_CANONICA[k] === canonica);
  return [canonica, ...antigos];
}

module.exports = { ALIAS_PARA_CANONICA, canonicalizarSecretaria, nomesOriginais };
