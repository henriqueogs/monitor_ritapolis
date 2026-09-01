#!/usr/bin/env node
'use strict';

// A migração pro contrato discovery_v3 (docs/planejamento-descobertas-investigativas.md
// §10) previa rejeitar os cestos anuais genéricos ("Serviços — 4 processos em 2026")
// marcados LEGACY_NO_QUALITY_GATE — esse passo nunca rodou. Eles ficaram acumulando em
// 'revisao' pra sempre (nunca eram público, o gate já bloqueava certo), só poluindo a
// fila editorial do admin: 51 dos 55 itens em revisão hoje são esse lixo legado, e
// afogam os poucos candidatos reais (árvores, eventos, recorrência de fornecedor).
//
// Não exclui nada — só move estado_editorial pra 'rejeitado' (status continua 'ativo',
// histórico fica registrado). Reversível via /admin/alertas se algum for reaberto por engano.

require('../src/db');
const repo = require('../src/db/alertas-repo');

function main() {
  const apply = process.argv.includes('--apply');
  const emRevisao = repo.listarAlertas({
    status: 'ativo',
    estadoEditorial: 'revisao',
    pagina: 1,
    limite: 10000,
  }).dados;

  const alvos = emRevisao.filter((item) =>
    (item.qualidade_motivos || []).includes('LEGACY_NO_QUALITY_GATE')
  );

  const resultado = { modo: apply ? 'apply' : 'dry-run', total_em_revisao: emRevisao.length, alvos: alvos.length, itens: [] };

  for (const item of alvos) {
    resultado.itens.push({ id: item.id, titulo: item.titulo, categoria: item.categoria });
    if (!apply) {continue;}
    repo.setEstadoEditorial(item.id, 'rejeitado', {
      origem: 'migracao_legado',
      motivos: ['LEGACY_NO_QUALITY_GATE'],
      exigirGateFactual: false,
    });
  }

  console.log(JSON.stringify(resultado, null, 2));
  if (!apply) {console.log('Nenhuma alteração foi gravada. Use --apply pra rejeitar de fato.');}
}

main();
