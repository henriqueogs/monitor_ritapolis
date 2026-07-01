'use strict';

const fs = require('fs');
const { collectMetrics } = require('./lib/monitor-metrics');

function formatMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  });
}

function table(rows, columns) {
  const header = `| ${columns.map((column) => column.label).join(' | ')} |`;
  const sep = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${columns.map((column) => column.value(row)).join(' | ')} |`);
  return [header, sep, ...body].join('\n');
}

function replaceSection(content, startHeading, endHeading, replacement) {
  const start = content.indexOf(startHeading);
  if (start === -1) {
    throw new Error(`Secao inicial nao encontrada: ${startHeading}`);
  }
  const end = content.indexOf(endHeading, start + startHeading.length);
  if (end === -1) {
    throw new Error(`Secao final nao encontrada: ${endHeading}`);
  }
  return `${content.slice(0, start)}${replacement.trim()}\n\n${content.slice(end)}`;
}

function buildReadmeState(metrics) {
  const activeAlerts = metrics.alertas.find((item) => item.status === 'ativo')?.n || 0;
  const lacunasPreco = metrics.licitacoes.lacunas_preco_produtos;
  return `
## Estado atual (gerado automaticamente)

Atualizado em: ${metrics.generated_at.slice(0, 10)}. Gere novamente com \`npm run docs:dados\`.

- ${metrics.documentos.total} documentos: ${metrics.documentos.por_fonte.map((r) => `${r.n} de ${r.fonte}`).join(', ')}
- ${metrics.documentos.editais} editais; ${metrics.documentos.com_texto}/${metrics.documentos.total} documentos com texto extraido (${metrics.documentos.com_texto_pct}%)
- ${metrics.ia.resumos.ok || 0} resumos IA ok; ${metrics.ia.resumos_sem_texto.length} resumo(s) exigem revalidacao por falta de texto-fonte atual
- ${metrics.licitacoes.detalhes.vencedor || 0}/${metrics.documentos.editais} editais com vencedor (${metrics.licitacoes.vencedor_pct}%)
- ${metrics.licitacoes.detalhes.valor || 0}/${metrics.documentos.editais} editais com valor final (${metrics.licitacoes.valor_pct}%)
- ${metrics.licitacoes.produtos.total} produtos estruturados em ${metrics.licitacoes.produtos.documentos} documento(s); ${metrics.licitacoes.editais_sem_produtos} editais ainda sem produtos
- ${lacunasPreco.total} edital(is) do mandato atual com produtos sem preço final por item: ${lacunasPreco.por_tipo.map((r) => `${r.tipo}=${r.n}`).join(', ') || '0'}
- ${metrics.transparencia.fornecedores} fornecedores consolidados; ${metrics.transparencia.categorias} categorias ativas
- ${activeAlerts} descobertas/alertas ativos; automação ${metrics.alertas_automacao.enabled && metrics.alertas_automacao.scheduler_enabled ? 'ligada' : 'desligada'}; pendente=${metrics.alertas_automacao.pendente ? 'sim' : 'não'}
- ${metrics.anexos.requer_ocr} anexo(s) aguardando OCR; ${metrics.documentos.editais_sem_pdf} edital(is) sem PDF (${metrics.documentos.editais_sem_pdf_sem_texto} sem texto, ${metrics.documentos.editais_sem_pdf_com_texto} com texto oficial da pagina)
- Diretório \`data/\`: ${metrics.armazenamento.total_data_human}, incluindo ${metrics.armazenamento.backup_files.length} backup(s) SQLite (${metrics.armazenamento.backup_human})
`;
}

function buildCobertura(metrics) {
  const coberturaRows = metrics.licitacoes.cobertura_por_ano.map((row) => ({
    ...row,
    vencedor: `${row.vencedor_pct}%`,
    valor: `${row.valor_pct}%`,
    resumo: `${row.resumo_pct}%`,
    analise: `${row.analise_pct}%`,
  }));
  const mandatoRows = metrics.licitacoes.cobertura_por_mandato.map((row) => ({
    ...row,
    vencedor: `${row.vencedor_pct}%`,
    valor: `${row.valor_pct}%`,
    resumo: `${row.resumo_pct}%`,
    analise: `${row.analise_pct}%`,
  }));
  const iaRows = metrics.ia.cobertura_resumo_analise_por_mandato.map((row) => ({
    ...row,
    resumo: `${row.resumo_pct}%`,
    analise: `${row.analise_pct}%`,
    ambos_pct_fmt: `${row.ambos_pct}%`,
    so_resumo_pct_fmt: `${row.so_resumo_pct}%`,
  }));
  const qualidadeIaRows = metrics.ia.qualidade_analise_por_mandato.map((row) => ({
    ...row,
    alta_fmt: `${row.alta} (${row.alta_pct}%)`,
    media_fmt: `${row.media} (${row.media_pct}%)`,
    baixa_fmt: `${row.baixa} (${row.baixa_pct}%)`,
  }));
  const despesasRows = metrics.transparencia.despesas_por_ano.map((row) => ({
    ...row,
    total_fmt: formatMoney(row.total),
    vinculadas_pct: `${Math.round(((row.vinculadas || 0) / row.n) * 100)}%`,
  }));
  const lacunasPrecoRows = metrics.licitacoes.lacunas_preco_produtos.por_detalhe.map((row) => ({
    detalhe: row.detalhe,
    total: row.n,
  }));
  const lacunasPrecoAmostraRows = metrics.licitacoes.lacunas_preco_produtos.itens.map((row) => ({
    ...row,
    titulo_curto: String(row.titulo || '').slice(0, 90),
    valor_fmt: row.valor_final ? formatMoney(row.valor_final) : 'n/a',
    lacuna: `${row.codigo}:${row.detalhe}`,
  }));

  return `# Cobertura de Dados — Monitor Ritápolis

Relatório gerado automaticamente a partir de \`data/ritapolis.db\`.

Atualizado em: ${metrics.generated_at.slice(0, 10)}. Gere novamente com \`npm run docs:dados\`.

## Visão Geral

- Documentos: **${metrics.documentos.total}**
- Editais: **${metrics.documentos.editais}**
- Texto extraído: **${metrics.documentos.com_texto}/${metrics.documentos.total} (${metrics.documentos.com_texto_pct}%)**
- Vencedor identificado: **${metrics.licitacoes.detalhes.vencedor || 0}/${metrics.documentos.editais} (${metrics.licitacoes.vencedor_pct}%)**
- Valor final identificado: **${metrics.licitacoes.detalhes.valor || 0}/${metrics.documentos.editais} (${metrics.licitacoes.valor_pct}%)**
- Produtos estruturados: **${metrics.licitacoes.produtos.total}** em **${metrics.licitacoes.produtos.documentos}** documento(s)
- Lacunas classificadas de preço por item no mandato atual: **${metrics.licitacoes.lacunas_preco_produtos.total}**
- Fornecedores consolidados: **${metrics.transparencia.fornecedores}**
- Descobertas/alertas: **${metrics.alertas.map((r) => `${r.status}: ${r.n}`).join(', ') || '0'}**
- Automação de descobertas: **${metrics.alertas_automacao.enabled && metrics.alertas_automacao.scheduler_enabled ? 'ligada' : 'desligada'}**; último ciclo: **${metrics.alertas_automacao.ultimo_ciclo || 'nunca'}**; pendente: **${metrics.alertas_automacao.pendente ? 'sim' : 'não'}**

## Cobertura Por Ano (Editais)

${table(coberturaRows, [
  { label: 'Ano', value: (row) => row.ano },
  { label: 'Editais', value: (row) => row.total },
  { label: 'Vencedor', value: (row) => row.vencedor },
  { label: 'Valor', value: (row) => row.valor },
  { label: 'Resumo', value: (row) => row.resumo },
  { label: 'Análise', value: (row) => row.analise },
])}

## Cobertura Por Mandato (Editais)

${table(mandatoRows, [
  { label: 'Mandato', value: (row) => row.mandato },
  { label: 'Anos no banco', value: (row) => row.anos },
  { label: 'Editais', value: (row) => row.total },
  { label: 'Vencedor', value: (row) => row.vencedor },
  { label: 'Valor', value: (row) => row.valor },
  { label: 'Resumo', value: (row) => row.resumo },
  { label: 'Análise', value: (row) => row.analise },
])}

## Cobertura IA: Resumo vs Análise Integrada

Resumo IA organiza o documento individual: objeto, datas, valores, partes, itens e campos não encontrados.
Análise integrada deve agregar valor diferente: cruza fontes estruturadas, produtos, grupo da licitação, PNCP/ata/contrato quando houver, e transforma isso em consistências, lacunas e alertas.

${table(iaRows, [
  { label: 'Mandato', value: (row) => row.mandato },
  { label: 'Editais', value: (row) => row.total },
  { label: 'Resumo', value: (row) => `${row.resumo_v1} (${row.resumo})` },
  { label: 'Análise', value: (row) => `${row.analise_v2} (${row.analise})` },
  { label: 'Ambos', value: (row) => `${row.ambos} (${row.ambos_pct_fmt})` },
  { label: 'Só resumo', value: (row) => `${row.so_resumo} (${row.so_resumo_pct_fmt})` },
  { label: 'Sem IA', value: (row) => row.nenhum },
])}

## Qualidade da Análise Integrada

Classificação por confiança da última análise integrada: alta ≥ 0,70; média 0,45–0,69; baixa < 0,45.

${table(qualidadeIaRows, [
  { label: 'Mandato', value: (row) => row.mandato },
  { label: 'Análises', value: (row) => row.com_analise },
  { label: 'Alta', value: (row) => row.alta_fmt },
  { label: 'Média', value: (row) => row.media_fmt },
  { label: 'Baixa', value: (row) => row.baixa_fmt },
  { label: 'Confiança média', value: (row) => row.confianca_media ?? 'n/a' },
])}

## Qualidade de Produtos e Preços

Esta seção separa falta de dado acionável de casos em que preço por item não deve ser inventado. A regra é conservadora: orçamento estimado de edital não vira preço final, valor global não é rateado sem base documental, e leilão/concessão/autorização de uso não entram como preço unitário comum.

${table(lacunasPrecoRows, [
  { label: 'Classificação', value: (row) => row.detalhe },
  { label: 'Total', value: (row) => row.total },
])}

${table(lacunasPrecoAmostraRows, [
  { label: 'Doc', value: (row) => `#${row.id}` },
  { label: 'Ano', value: (row) => row.ano },
  { label: 'Produtos', value: (row) => row.produtos_total },
  { label: 'Valor global', value: (row) => row.valor_fmt },
  { label: 'Lacuna', value: (row) => row.lacuna },
  { label: 'Ação', value: (row) => row.acao },
])}

## Gaps Prioritários

${table([
  { gap: 'Editais sem PDF e sem texto', total: metrics.documentos.editais_sem_pdf_sem_texto, acao: 'Recoleta dirigida ou marcar lacuna irrecuperável da fonte' },
  { gap: 'Editais sem PDF, com texto da página', total: metrics.documentos.editais_sem_pdf_com_texto, acao: 'Manter como lacuna explícita de arquivo, com texto oficial preservado' },
  { gap: 'Resumos IA sem texto-fonte atual', total: metrics.ia.resumos_sem_texto.length, acao: 'Revalidar rastreabilidade antes de exibir como verificável' },
  { gap: 'Editais sem produtos estruturados', total: metrics.licitacoes.editais_sem_produtos, acao: 'Rodar estruturação/enriquecimento em lotes por ano' },
  { gap: 'Produtos sem preço final por item no mandato atual', total: metrics.licitacoes.lacunas_preco_produtos.total, acao: 'Priorizar resultado_final_nao_publicado, anexos pendentes e parser_pendente; não ratear valor global sem base' },
  { gap: 'Anexos aguardando OCR', total: metrics.anexos.requer_ocr, acao: 'Rodar OCR local ou fornecedor visão' },
  { gap: 'Documentos sem data_publicacao', total: metrics.documentos.sem_data, acao: 'Backfill por título/fonte quando confiável' },
  {
    gap: 'Análises integradas média/baixa no mandato atual',
    total: (metrics.ia.qualidade_analise_por_mandato[0]?.media || 0) + (metrics.ia.qualidade_analise_por_mandato[0]?.baixa || 0),
    acao: 'Rodar dados:analises-fracas e atacar causas: produtos, valores, PNCP, grupo ou PDF'
  },
], [
  { label: 'Gap', value: (row) => row.gap },
  { label: 'Total', value: (row) => row.total },
  { label: 'Ação', value: (row) => row.acao },
])}

## Transparência

${table(despesasRows, [
  { label: 'Ano', value: (row) => row.ano },
  { label: 'Empenhos', value: (row) => row.n },
  { label: 'Total', value: (row) => row.total_fmt },
  { label: 'Credores', value: (row) => row.credores },
  { label: 'Vinculadas', value: (row) => `${row.vinculadas} (${row.vinculadas_pct})` },
])}

## Integridade

- Registros órfãos: anexos=${metrics.qualidade.orfaos.anexos}, resumos=${metrics.qualidade.orfaos.resumos}, produtos=${metrics.qualidade.orfaos.produtos}
- PDFs duplicados: ${metrics.qualidade.duplicatas_pdf.length}
- Hashes de conteúdo duplicados: ${metrics.qualidade.duplicatas_hash.length}
- Tamanho de \`data/\`: ${metrics.armazenamento.total_data_human}; backups SQLite: ${metrics.armazenamento.backup_files.length} (${metrics.armazenamento.backup_human})

## Comandos

\`\`\`bash
npm run dados:status
npm run dados:auditar
npm run dados:analises-fracas
npm run dados:produtos-lacunas
npm run docs:dados
npm run dados:organizar-backups -- --apply
\`\`\`
`;
}

function main() {
  const metrics = collectMetrics();

  const readmePath = 'README.md';
  const readme = fs.readFileSync(readmePath, 'utf8');
  fs.writeFileSync(
    readmePath,
    replaceSection(readme, '## Estado atual', '## Limitações conhecidas', buildReadmeState(metrics))
  );

  fs.writeFileSync('COBERTURA.md', buildCobertura(metrics));
  console.log('README.md e COBERTURA.md atualizados com dados do banco.');
}

main();
