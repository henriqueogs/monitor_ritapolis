'use strict';

const { collectMetrics } = require('./lib/monitor-metrics');

function countStatus(rows, status) {
  return rows.find((row) => row.status === status || row.status_extracao === status)?.n || 0;
}

function main() {
  const m = collectMetrics();
  const jobsOk = countStatus(m.ia.jobs, 'ok');
  const jobsErro = countStatus(m.ia.jobs, 'erro');
  const mandatoAtual = m.licitacoes.cobertura_por_mandato[0];
  const iaMandatoAtual = m.ia.cobertura_resumo_analise_por_mandato[0];
  const qualidadeMandatoAtual = m.ia.qualidade_analise_por_mandato[0];

  console.log('Monitor Ritapolis — status do pipeline');
  console.log(`Gerado em: ${m.generated_at}`);
  console.log('');

  console.log('1. Coleta e acervo');
  console.log(
    `   documentos=${m.documentos.total} | editais=${m.documentos.editais} | com_texto=${m.documentos.com_texto} (${m.documentos.com_texto_pct}%) | ` +
    `editais_sem_pdf=${m.documentos.editais_sem_pdf} (${m.documentos.editais_sem_pdf_sem_texto} sem texto, ${m.documentos.editais_sem_pdf_com_texto} com texto)`
  );
  console.log(`   fontes=${m.documentos.por_fonte.map((r) => `${r.fonte}:${r.n}`).join(', ')}`);
  console.log('');

  console.log('2. IA e leitura integrada');
  console.log(`   resumos_ok=${m.ia.resumos.ok || 0} | resumos_erro=${m.ia.resumos.erro || 0} | jobs_ok=${jobsOk} | jobs_erro=${jobsErro}`);
  console.log(`   resumos_sem_texto_fonte=${m.ia.resumos_sem_texto.length}`);
  if (iaMandatoAtual) {
    console.log(
      `   mandato_atual=${iaMandatoAtual.mandato} | resumo=${iaMandatoAtual.resumo_pct}% | analise=${iaMandatoAtual.analise_pct}% | so_resumo=${iaMandatoAtual.so_resumo}`
    );
  }
  if (qualidadeMandatoAtual) {
    console.log(
      `   qualidade_analise=${qualidadeMandatoAtual.alta} alta/${qualidadeMandatoAtual.media} media/${qualidadeMandatoAtual.baixa} baixa | confianca_media=${qualidadeMandatoAtual.confianca_media}`
    );
  }
  console.log('');

  console.log('3. Licitacoes');
  console.log(`   detalhes=${m.licitacoes.detalhes.total} | vencedor=${m.licitacoes.detalhes.vencedor} (${m.licitacoes.vencedor_pct}%) | valor=${m.licitacoes.detalhes.valor} (${m.licitacoes.valor_pct}%)`);
  console.log(`   produtos=${m.licitacoes.produtos.total} | docs_com_produtos=${m.licitacoes.produtos.documentos} | editais_sem_produtos=${m.licitacoes.editais_sem_produtos}`);
  console.log(
    `   lacunas_preco_produtos=${m.licitacoes.lacunas_preco_produtos.total_acionavel} acionaveis ` +
    `(${m.licitacoes.lacunas_preco_produtos.total} brutas, ${m.licitacoes.lacunas_preco_produtos.total_justificado} justificadas) | ` +
    `${m.licitacoes.lacunas_preco_produtos.por_tipo_acionavel.map((r) => `${r.tipo}:${r.n}`).join(', ') || '0'}`
  );
  console.log(`   grupos=${m.licitacoes.grupos.grupos || 0} | grupos_multi=${m.licitacoes.grupos.multi || 0}`);
  if (mandatoAtual) {
    console.log(`   mandato_atual=${mandatoAtual.mandato} | editais=${mandatoAtual.total} | analise=${mandatoAtual.analise_pct}%`);
  }
  console.log('');

  console.log('4. Anexos e OCR');
  console.log(`   pendentes=${m.anexos.pendentes} | requer_ocr=${m.anexos.requer_ocr}`);
  console.log('');

  console.log('5. Transparencia e inteligencia');
  console.log(`   fornecedores=${m.transparencia.fornecedores} | categorias=${m.transparencia.categorias}`);
  console.log(`   alertas=${m.alertas.map((r) => `${r.status}:${r.n}`).join(', ') || '0'}`);
  console.log(
    `   descobertas_auto=${m.alertas_automacao.enabled && m.alertas_automacao.scheduler_enabled ? 'on' : 'off'} | ` +
    `ultimo_ciclo=${m.alertas_automacao.ultimo_ciclo || 'nunca'} | pendente=${m.alertas_automacao.pendente ? 'sim' : 'nao'}`
  );
  console.log(
    `   descobertas_ia=${m.descobertas_investigacao.por_status.map((r) => `${r.status}:${r.n}`).join(', ') || '0'} | ` +
    `pendentes=${m.descobertas_investigacao.pendentes} | ultimo_ciclo=${m.descobertas_investigacao.ultimo_ciclo || 'nunca'}`
  );
  console.log('');

  console.log('6. Armazenamento');
  console.log(`   data=${m.armazenamento.total_data_human} | backups=${m.armazenamento.backup_files.length} (${m.armazenamento.backup_human})`);
  console.log('');

  console.log('Proximas acoes sugeridas');
  if (m.ia.resumos_sem_texto.length) {
    console.log('   - Revisar resumos sem texto-fonte: npm run dados:auditar');
  }
  if (m.documentos.editais_sem_pdf) {
    console.log('   - Recoleta dirigida dos editais sem PDF ou confirmar lacuna da fonte.');
  }
  if (m.anexos.requer_ocr) {
    console.log('   - Rodar OCR dos anexos/documentos marcados como requer_ocr.');
  }
  if (m.licitacoes.editais_sem_produtos) {
    console.log('   - Processar estruturação/enriquecimento dos editais sem produtos, por ano e com dry-run quando disponível.');
  }
  if (m.licitacoes.lacunas_preco_produtos.por_tipo.some((row) => row.tipo === 'resultado_final_nao_publicado' || row.tipo === 'anexo_resultado_pendente' || row.tipo === 'parser_pendente')) {
    console.log('   - Atacar lacunas de preço por item que ainda dependem de resultado, anexo ou parser.');
  }
  if (qualidadeMandatoAtual?.baixa || qualidadeMandatoAtual?.media) {
    console.log('   - Revisar qualidade das análises: npm run dados:analises-fracas');
  }
  if (m.armazenamento.root_backup_files.length) {
    console.log('   - Arquivar backups locais: npm run dados:organizar-backups -- --apply');
  }
}

main();
