'use strict';

/**
 * Relatório de cobertura da base — visão geral, por ano e recorrência da coleta.
 * Fonte única para manter o COBERTURA.md atualizado.
 *
 * Uso: node scripts/relatorio-cobertura.js   (npm run cobertura:relatorio)
 */

const { setupDatabase } = require('../src/db/setup');
const { db, getCoberturaPorAno } = require('../src/db');

function get(sql) {
  return db.prepare(sql).get();
}

function pct(a, b) {
  return b ? `${Math.round((a / b) * 100)}%` : '—';
}

function main() {
  setupDatabase();

  const totEditais = get("SELECT COUNT(*) n FROM documentos WHERE tipo='edital'").n;
  const m = {
    texto: get("SELECT COUNT(*) n FROM documentos WHERE tipo='edital' AND status_coleta='ok'").n,
    resumo: get("SELECT COUNT(DISTINCT documento_id) n FROM documentos_resumos_ai WHERE status='ok' AND contrato_versao NOT LIKE '2.%' AND documento_id IN (SELECT id FROM documentos WHERE tipo='edital')").n,
    analise: get("SELECT COUNT(DISTINCT documento_id) n FROM documentos_resumos_ai WHERE status='ok' AND contrato_versao LIKE '2.%' AND documento_id IN (SELECT id FROM documentos WHERE tipo='edital')").n,
    vencedor: get("SELECT COUNT(*) n FROM licitacoes_detalhes WHERE vencedor_nome IS NOT NULL").n,
    valor: get("SELECT COUNT(*) n FROM licitacoes_detalhes WHERE valor_final>0").n,
  };

  console.warn(`\n=== COBERTURA — editais: ${totEditais} ===`);
  console.warn(`Texto extraído     ${pct(m.texto, totEditais).padStart(4)}  (${m.texto})`);
  console.warn(`Resumo IA          ${pct(m.resumo, totEditais).padStart(4)}  (${m.resumo})`);
  console.warn(`Análise integrada  ${pct(m.analise, totEditais).padStart(4)}  (${m.analise})`);
  console.warn(`Vencedor           ${pct(m.vencedor, totEditais).padStart(4)}  (${m.vencedor})`);
  console.warn(`Valor final        ${pct(m.valor, totEditais).padStart(4)}  (${m.valor})`);

  console.warn('\n=== POR ANO ===');
  console.warn('ano   editais  venc  valor  resumo  análise');
  for (const r of getCoberturaPorAno()) {
    console.warn(
      `${String(r.ano).padEnd(5)} ${String(r.total).padStart(6)}  ${String(r.vencedor_pct + '%').padStart(4)}  ${String(r.valor_pct + '%').padStart(4)}  ${String(r.resumo_pct + '%').padStart(5)}  ${String(r.analise_pct + '%').padStart(6)}`
    );
  }

  console.warn('\n=== FILAS / GAPS ===');
  const ocr = get("SELECT COUNT(*) n FROM documentos_anexos WHERE status_extracao='requer_ocr'").n;
  const semPdf = get("SELECT COUNT(*) n FROM documentos WHERE tipo='edital' AND status_coleta='sem_pdf'").n;
  const imagem = get("SELECT COUNT(*) n FROM documentos WHERE tipo='edital' AND status_coleta='imagem'").n;
  const anexosPend = get("SELECT COUNT(*) n FROM documentos_anexos WHERE status_extracao='pendente'").n;
  const elegSemAnalise = get("SELECT COUNT(*) n FROM documentos d WHERE d.tipo='edital' AND LENGTH(IFNULL(d.texto_completo,''))>100 AND EXISTS(SELECT 1 FROM licitacoes_grupo_documentos gd WHERE gd.documento_id=d.id) AND d.ano<2023 AND NOT EXISTS(SELECT 1 FROM documentos_resumos_ai r WHERE r.documento_id=d.id AND r.status='ok' AND r.contrato_versao LIKE '2.%')").n;
  console.warn(`Análise integrada elegível não feita (<2023): ${elegSemAnalise}  → npm run ai:correlacionar:lote -- --de=2017 --ate=2022`);
  console.warn(`Anexos aguardando OCR (requer_ocr):           ${ocr}`);
  console.warn(`Editais sem PDF (sem_pdf):                     ${semPdf}`);
  console.warn(`Editais PDF-imagem (imagem):                   ${imagem}`);
  console.warn(`Anexos pendentes (não-resultado):             ${anexosPend}`);

  console.warn('\n=== RECORRÊNCIA DA COLETA (últimas execuções) ===');
  const logs = db
    .prepare("SELECT fonte, MAX(inicio) ultima FROM coletas_log GROUP BY fonte ORDER BY ultima DESC")
    .all();
  for (const l of logs) {
    console.warn(`${(l.fonte || '?').padEnd(22)} última: ${l.ultima}`);
  }
  console.warn('Cadência: coleta 12h · transparência 24h · PNCP 168h · resumo IA 4h (~180 docs/dia)');
  console.warn('Status ao vivo: GET /api/scheduler/status · /admin/coletas\n');
}

main();
