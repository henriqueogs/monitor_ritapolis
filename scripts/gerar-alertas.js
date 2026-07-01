#!/usr/bin/env node
'use strict';

// CLI para disparar a geração de alertas manualmente.
// Uso:
//   node scripts/gerar-alertas.js [--since=ISO] [--dry-run] [--limite=N] [--full]
//   --full: rebuild completo (varre todo o acervo + reconcilia o feed com os
//           thresholds atuais). Use após ajustar configs em /admin/alertas.

const { generateAlerts } = require('../src/alertas/alert-generator');
const { extrairFatosInteligencia } = require('../src/inteligencia/fatos-runner');

function parseArgs(argv) {
  const out = { since: null, dryRun: false, limite: 200, full: false, extrairFatos: true };
  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run') {
      out.dryRun = true;
    } else if (arg === '--full') {
      out.full = true;
      out.limite = 5000;
    } else if (arg === '--sem-fatos') {
      out.extrairFatos = false;
    } else if (arg.startsWith('--since=')) {
      out.since = arg.slice('--since='.length);
    } else if (arg.startsWith('--limite=')) {
      out.limite = Number(arg.slice('--limite='.length)) || 200;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  console.log('Gerador de alertas — iniciando', args);
  if (args.full && args.extrairFatos) {
    const fatos = extrairFatosInteligencia({ limite: args.limite, apply: !args.dryRun });
    console.log('Fatos atualizados:', {
      documentos: fatos.documentos,
      fatos_salvos: fatos.fatos_salvos,
      anexos: fatos.anexos,
      resumos_anexos: fatos.resumos_anexos,
      dryRun: !fatos.apply,
    });
  }
  const resultado = await generateAlerts(args);
  console.log('Resultado:', {
    total: resultado.total,
    gerados: resultado.gerados,
    atualizados: resultado.atualizados,
    removidos: resultado.removidos || 0,
    erros: resultado.erros,
    dryRun: resultado.dryRun || false,
  });
  if (args.dryRun && resultado.alertas.length) {
    console.log('\n--- Alertas candidatos (dry-run) ---');
    for (const a of resultado.alertas) {
      console.log(`[${a.severidade}] ${a.titulo}`);
      console.log(`  chave: ${a.chave_unica}`);
      if (a.metadados?.investigacao_tipo) {
        console.log(`  investigacao: ${a.metadados.investigacao_tipo}`);
      }
      if (a.metadados?.discovery_v2) {
        console.log(`  ia: ${a.metadados.discovery_v2.status} (${a.metadados.discovery_v2.motivo_publicacao || 'sem motivo'})`);
      }
      console.log(`  documentos: ${a.documentos_ids?.join(', ')}`);
      if (a.valor_total) {
        const unidade = a.metadados?.unidade;
        const valor = unidade === 'R$' ? `R$ ${a.valor_total}` : unidade ? `${a.valor_total} ${unidade}` : `R$ ${a.valor_total}`;
        console.log(`  valor: ${valor} (${a.valor_periodo_label})`);
      }
      if (a.questionamentos?.length) {
        console.log(`  questionamentos: ${a.questionamentos.join('; ')}`);
      }
      console.log('');
    }
  }
}

main().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
