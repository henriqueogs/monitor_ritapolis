#!/usr/bin/env node
'use strict';

require('../src/db');
const repo = require('../src/db/alertas-repo');
const {
  validarFactual,
  validarEditorial,
  normalizarInvestigacaoEditorial,
} = require('../src/alertas/discovery-quality');

function main() {
  const apply = process.argv.includes('--apply');
  const publicados = repo.listarAlertas({
    status: 'ativo',
    estadoEditorial: 'publicado',
    pagina: 1,
    limite: 10000,
  }).dados;
  const resultado = { modo: apply ? 'apply' : 'dry-run', total: publicados.length, aprovados: 0, revisao: 0, itens: [] };

  for (const item of publicados) {
    const alerta = repo.getAlerta(item.id);
    if (alerta.metadados?.discovery_kind !== 'investigacao_factual') {continue;}
    const investigation = normalizarInvestigacaoEditorial(alerta.metadados?.discovery_v3 || {});
    const factual = validarFactual(alerta);
    const editorial = validarEditorial(alerta, investigation, factual);
    const motivos = [...new Set([...factual.motivos, ...editorial.motivos])];
    if (factual.aprovado && editorial.aprovado) {
      resultado.aprovados += 1;
      continue;
    }
    resultado.revisao += 1;
    resultado.itens.push({ id: alerta.id, titulo: alerta.titulo, motivos });
    if (!apply) {continue;}
    const discoveryV3 = {
      ...investigation,
      qualidade: {
        ...(investigation.qualidade || {}),
        factual_status: factual.status,
        editorial_status: editorial.status,
        status: 'reprovado',
        motivos,
        diagnostico_editorial: editorial.diagnostico || {},
        verificado_em: new Date().toISOString(),
      },
    };
    repo.upsertAlerta({
      ...alerta,
      estado_editorial: 'revisao',
      estado_editorial_origem: 'revalidacao-gate-v3',
      qualidade_motivos: motivos,
      publicado_em: null,
      metadados: { ...(alerta.metadados || {}), discovery_v3: discoveryV3 },
    }, alerta.documentos || [], alerta.evidencias || []);
  }

  console.log(JSON.stringify(resultado, null, 2));
  if (!apply) {console.log('Nenhuma alteração foi gravada. Use --apply para mover reprovações para revisão.');}
}

main();
