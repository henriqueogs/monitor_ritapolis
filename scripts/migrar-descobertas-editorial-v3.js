#!/usr/bin/env node
'use strict';

require('../src/db');
const repo = require('../src/db/alertas-repo');

function planoMigracao(alerta) {
  const discoveryV3 = alerta.metadados?.discovery_v3;
  if (discoveryV3?.qualidade?.factual_status === 'aprovado') {
    return {
      estado: alerta.estado_editorial || 'revisao',
      motivos: alerta.qualidade_motivos || [],
      versao: discoveryV3.qualidade.versao || 'discovery-quality-v3',
    };
  }
  if (alerta.metadados?.discovery_kind === 'investigacao_factual') {
    return {
      estado: 'candidato',
      motivos: ['PENDING_V3_REPROCESSING'],
      versao: 'discovery-quality-v3',
    };
  }
  return {
    estado: 'revisao',
    motivos: ['LEGACY_NO_QUALITY_GATE'],
    versao: 'discovery-quality-v3',
  };
}

function main() {
  const apply = process.argv.includes('--apply');
  const resultado = repo.listarAlertas({ status: 'ativo', pagina: 1, limite: 10000 });
  const resumo = {
    modo: apply ? 'apply' : 'dry-run',
    total: resultado.dados.length,
    candidato: 0,
    revisao: 0,
    publicado: 0,
    rejeitado: 0,
    historicos_criados: 0,
  };

  for (const item of resultado.dados) {
    const alerta = repo.getAlerta(item.id);
    const plano = planoMigracao(alerta);
    resumo[plano.estado] = (resumo[plano.estado] || 0) + 1;
    if (!apply) {continue;}

    const persistido = {
      ...alerta,
      estado_editorial: plano.estado,
      estado_editorial_origem: 'migration-v3',
      qualidade_motivos: plano.motivos,
      qualidade_versao: plano.versao,
      publicado_em: plano.estado === 'publicado' ? alerta.publicado_em : null,
    };
    repo.upsertAlerta(persistido, alerta.documentos || [], alerta.evidencias || []);
    const atualizado = repo.getAlerta(alerta.id);
    if (repo.garantirHistoricoEditorialInicial(alerta.id, {
      estado: atualizado.estado_editorial,
      origem: 'migration-v3',
      motivos: atualizado.qualidade_motivos,
      evidenciasHash: atualizado.evidencias_hash,
    })) {
      resumo.historicos_criados += 1;
    }
  }

  console.log(JSON.stringify(resumo, null, 2));
  if (!apply) {
    console.log('Nenhuma alteração foi gravada. Use --apply para executar a migração.');
  }
}

main();
