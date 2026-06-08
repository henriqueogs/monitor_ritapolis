const { getAuditoria } = require('../src/db');

function readFlag(name, fallback = null) {
  const prefix = `--${name}=`;
  const arg = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function bar(value, max, width = 20) {
  const filled = Math.round((value / max) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function main() {
  const ano = readFlag('ano');
  const tipo = readFlag('tipo');
  const fonte = readFlag('fonte');

  console.log('Auditoria de prontidão para inteligência');
  if (ano || tipo || fonte) {
    console.log(`Filtros: ${[ano && `ano=${ano}`, tipo && `tipo=${tipo}`, fonte && `fonte=${fonte}`].filter(Boolean).join(' | ')}`);
  }
  console.log('');

  const resultado = getAuditoria({ ano, tipo, fonte });
  const { visao_geral, por_faixa, lacunas, por_ano, por_tipo, piores } = resultado;

  // Visão geral
  console.log('── Visão geral ──────────────────────────────────');
  console.log(`Total documentos : ${visao_geral.total}`);
  console.log(`Score médio      : ${visao_geral.score_medio.toFixed(1)} / 100`);
  console.log(`Prontos (≥75)    : ${visao_geral.prontos} (${((visao_geral.prontos / visao_geral.total) * 100).toFixed(1)}%)`);
  console.log(`Críticos (≤25)   : ${visao_geral.criticos} (${((visao_geral.criticos / visao_geral.total) * 100).toFixed(1)}%)`);
  console.log('');

  // Distribuição por faixa
  console.log('── Distribuição de score ────────────────────────');
  for (const faixa of por_faixa) {
    const pct = visao_geral.total > 0 ? (faixa.total / visao_geral.total) * 100 : 0;
    console.log(
      `${String(faixa.faixa).padEnd(12)} ${bar(faixa.total, visao_geral.total)} ${String(faixa.total).padStart(4)} (${pct.toFixed(1)}%)`
    );
  }
  console.log('');

  // Lacunas por campo
  console.log('── Lacunas por campo ────────────────────────────');
  for (const lacuna of lacunas) {
    console.log(`${lacuna.campo.padEnd(18)} : ${lacuna.ausentes} documentos sem o campo (${lacuna.pct.toFixed(1)}%)`);
  }
  console.log('');

  // Por ano
  if (por_ano.length > 1) {
    console.log('── Score por ano ────────────────────────────────');
    for (const item of por_ano) {
      console.log(
        `${String(item.ano || 'sem_ano').padEnd(8)} score=${item.score_medio.toFixed(1).padStart(5)} | total=${item.total} | prontos=${item.prontos} | criticos=${item.criticos}`
      );
    }
    console.log('');
  }

  // Por tipo
  if (por_tipo.length > 1) {
    console.log('── Score por tipo ───────────────────────────────');
    for (const item of por_tipo) {
      console.log(
        `${String(item.tipo).padEnd(22)} score=${item.score_medio.toFixed(1).padStart(5)} | total=${item.total}`
      );
    }
    console.log('');
  }

  // Piores documentos
  if (piores.length) {
    console.log('── Documentos com score mais baixo ──────────────');
    for (const doc of piores.slice(0, 15)) {
      const lacunasDoc = [
        !doc.tem_texto && 'sem_texto',
        !doc.tem_resumo_ai && 'sem_resumo_ai',
        !doc.tem_data && 'sem_data',
        !doc.tem_arquivo && 'sem_arquivo',
        doc.e_licitacao && !doc.tem_produtos && 'sem_produtos',
        doc.e_licitacao && !doc.tem_vencedor && 'sem_vencedor'
      ]
        .filter(Boolean)
        .join(', ');
      console.log(
        `[${doc.score.toString().padStart(3)}] #${doc.id} ${doc.ano || '????'} ${String(doc.tipo).padEnd(20)} ${doc.titulo.slice(0, 45).padEnd(45)} | ${lacunasDoc}`
      );
    }
    console.log('');
  }

  console.log('Concluído.');
}

main();
