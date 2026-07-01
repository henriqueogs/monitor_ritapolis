'use strict';

const { collectMetrics } = require('./lib/monitor-metrics');

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function section(title) {
  console.log(`\n## ${title}`);
}

function printTable(rows, columns) {
  if (!rows.length) {
    console.log('Nenhum registro.');
    return;
  }
  const widths = columns.map((column) =>
    Math.max(
      column.label.length,
      ...rows.map((row) => String(column.value(row) ?? '').length)
    )
  );
  console.log(columns.map((column, i) => column.label.padEnd(widths[i])).join('  '));
  console.log(widths.map((width) => '-'.repeat(width)).join('  '));
  for (const row of rows) {
    console.log(columns.map((column, i) => String(column.value(row) ?? '').padEnd(widths[i])).join('  '));
  }
}

function buildIssues(metrics) {
  const issues = [];

  if (metrics.qualidade.orfaos.anexos || metrics.qualidade.orfaos.resumos || metrics.qualidade.orfaos.produtos) {
    issues.push({
      nivel: 'critico',
      titulo: 'Registros orfaos encontrados',
      detalhe: JSON.stringify(metrics.qualidade.orfaos),
    });
  }

  if (metrics.qualidade.duplicatas_pdf.length) {
    issues.push({
      nivel: 'alto',
      titulo: 'PDF duplicado entre documentos',
      detalhe: `${metrics.qualidade.duplicatas_pdf.length} URL(s) repetida(s)`,
    });
  }

  if (metrics.ia.resumos_sem_texto.length) {
    issues.push({
      nivel: 'alto',
      titulo: 'Resumo IA sem texto-fonte atual',
      detalhe: `${metrics.ia.resumos_sem_texto.length} documento(s) precisam de revalidacao de rastreabilidade`,
    });
  }

  if (metrics.documentos.editais_sem_pdf_sem_texto) {
    issues.push({
      nivel: 'medio',
      titulo: 'Editais sem PDF e sem texto',
      detalhe: `${metrics.documentos.editais_sem_pdf_sem_texto} edital(is) sem arquivo e sem texto-fonte capturado`,
    });
  }

  if (metrics.documentos.editais_sem_pdf_com_texto) {
    issues.push({
      nivel: 'baixo',
      titulo: 'Editais sem PDF, com texto da fonte',
      detalhe: `${metrics.documentos.editais_sem_pdf_com_texto} edital(is) preservam texto oficial da pagina, mas sem arquivo PDF publicado`,
    });
  }

  if (metrics.licitacoes.editais_sem_produtos) {
    issues.push({
      nivel: 'medio',
      titulo: 'Editais sem produtos estruturados',
      detalhe: `${metrics.licitacoes.editais_sem_produtos} edital(is) sem itens em licitacoes_produtos`,
    });
  }

  if (metrics.documentos.sem_data) {
    issues.push({
      nivel: 'baixo',
      titulo: 'Documentos sem data_publicacao',
      detalhe: `${metrics.documentos.sem_data} documento(s)`,
    });
  }

  if (metrics.qualidade.duplicatas_hash.length) {
    issues.push({
      nivel: 'baixo',
      titulo: 'Hash de conteudo repetido',
      detalhe: `${metrics.qualidade.duplicatas_hash.length} hash(es) repetido(s); pode ser upload duplicado ou publicacao equivalente`,
    });
  }

  return issues;
}

function main() {
  const metrics = collectMetrics();
  const issues = buildIssues(metrics);

  if (hasFlag('json')) {
    console.log(JSON.stringify({ issues, metrics }, null, 2));
    return;
  }

  console.log('Auditoria de qualidade dos dados');
  console.log(`Gerado em: ${metrics.generated_at}`);

  section('Resumo');
  console.log(`Documentos: ${metrics.documentos.total} (${metrics.documentos.editais} editais)`);
  console.log(`Texto extraido: ${metrics.documentos.com_texto}/${metrics.documentos.total} (${metrics.documentos.com_texto_pct}%)`);
  console.log(`Detalhes de licitacao: ${metrics.licitacoes.detalhes.total}`);
  console.log(`Vencedor identificado: ${metrics.licitacoes.detalhes.vencedor}/${metrics.documentos.editais} (${metrics.licitacoes.vencedor_pct}%)`);
  console.log(`Valor final identificado: ${metrics.licitacoes.detalhes.valor}/${metrics.documentos.editais} (${metrics.licitacoes.valor_pct}%)`);
  console.log(`Produtos estruturados: ${metrics.licitacoes.produtos.total} em ${metrics.licitacoes.produtos.documentos} documento(s)`);

  section('Achados');
  printTable(issues, [
    { label: 'nivel', value: (row) => row.nivel },
    { label: 'achado', value: (row) => row.titulo },
    { label: 'detalhe', value: (row) => row.detalhe },
  ]);

  section('Resumos IA sem texto-fonte');
  printTable(metrics.ia.resumos_sem_texto, [
    { label: 'id', value: (row) => row.id },
    { label: 'ano', value: (row) => row.ano },
    { label: 'status', value: (row) => row.status_coleta },
    { label: 'resumos', value: (row) => row.resumos },
    { label: 'titulo', value: (row) => String(row.titulo || '').slice(0, 70) },
  ]);

  section('Integridade referencial');
  console.log(`Orfaos: anexos=${metrics.qualidade.orfaos.anexos}, resumos=${metrics.qualidade.orfaos.resumos}, produtos=${metrics.qualidade.orfaos.produtos}`);
  console.log(`PDFs duplicados: ${metrics.qualidade.duplicatas_pdf.length}`);
  console.log(`Hashes duplicados: ${metrics.qualidade.duplicatas_hash.length}`);

  section('Armazenamento');
  console.log(`data/: ${metrics.armazenamento.total_data_human}`);
  console.log(`Backups SQLite: ${metrics.armazenamento.backup_files.length} arquivo(s), ${metrics.armazenamento.backup_human}`);

  if (hasFlag('fail-on-critical') && issues.some((issue) => issue.nivel === 'critico' || issue.nivel === 'alto')) {
    process.exitCode = 1;
  }
}

main();
