'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const config = require('../../src/config');
const { classifyProdutoPrecoLacuna } = require('./produtos-lacunas');

const db = new DatabaseSync(config.dbPath, { readOnly: true, timeout: 15000 });
db.exec('PRAGMA query_only = ON;');
db.exec('PRAGMA busy_timeout = 15000;');

function getOne(sql, params = {}) {
  return db.prepare(sql).get(params);
}

function getAll(sql, params = {}) {
  return db.prepare(sql).all(params);
}

function pct(value, total) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function bytesToHuman(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = Number(bytes || 0);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function listDataFiles() {
  const dataDir = path.resolve('data');
  if (!fs.existsSync(dataDir)) { return []; }
  const files = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(filePath);
      } else if (entry.isFile()) {
        const stat = fs.statSync(filePath);
        files.push({
          name: entry.name,
          relative_path: path.relative(dataDir, filePath),
          path: filePath,
          bytes: stat.size,
          human: bytesToHuman(stat.size),
        });
      }
    }
  };
  visit(dataDir);
  return files.sort((a, b) => a.relative_path.localeCompare(b.relative_path));
}

function acaoLacunaPreco(codigo, detalhe) {
  if (codigo === 'resultado_final_nao_publicado') {
    return 'Aguardar/publicar resultado final; manter orçamento como estimado';
  }
  if (codigo === 'anexo_resultado_pendente') {
    return 'Extrair texto do anexo de resultado e reenriquecer produtos';
  }
  if (codigo === 'parser_pendente') {
    return 'Aprimorar parser ou mapear manualmente o resultado já extraído';
  }
  if (codigo === 'valor_global_sem_rateio') {
    return 'Não ratear; buscar documento com subtotal por item/lote';
  }
  if (codigo === 'preco_item_nao_aplicavel' && detalhe === 'leilao_bens_inserviveis') {
    return 'Tratar como alienação/leilão, não compra com preço por item';
  }
  if (codigo === 'preco_item_nao_aplicavel') {
    return 'Tratar como concessão/autorização de uso, não preço unitário comum';
  }
  return 'Confirmar se a fonte publica detalhamento por item';
}

function isLacunaPrecoAcionavel(classificacao) {
  if (!classificacao) {
    return false;
  }

  return !['preco_item_nao_aplicavel', 'valor_global_sem_rateio'].includes(classificacao.codigo);
}

function getLacunasPrecoProdutos() {
  const rows = getAll(`
    WITH produtos AS (
      SELECT documento_id,
             COUNT(*) AS produtos_total,
             SUM(CASE WHEN valor_total_final IS NOT NULL
                        OR valor_unitario_final IS NOT NULL
                        OR valor_lote_final IS NOT NULL
                        OR valor_global_final IS NOT NULL THEN 1 ELSE 0 END) AS produtos_com_preco
        FROM licitacoes_produtos
       GROUP BY documento_id
    ),
    anexos AS (
      SELECT documento_id,
             SUM(CASE WHEN tipo IN ('ata_resultado', 'resultado', 'homologacao', 'contrato', 'extrato_contrato')
                       AND status_extracao = 'ok'
                      THEN 1 ELSE 0 END) AS resultado_ok,
             SUM(CASE WHEN tipo IN ('ata_resultado', 'resultado', 'homologacao', 'contrato', 'extrato_contrato')
                       AND status_extracao <> 'ok'
                      THEN 1 ELSE 0 END) AS resultado_pendente,
             SUM(CASE WHEN tipo IN ('edital', 'termo_referencia', 'projeto_basico', 'planilha_orcamentaria', 'outro')
                       AND status_extracao = 'ok'
                      THEN 1 ELSE 0 END) AS anexo_edital_ou_tecnico_ok
        FROM documentos_anexos
       GROUP BY documento_id
    )
    SELECT d.id,
           d.ano,
           d.titulo,
           IFNULL(ld.valor_final, 0) AS valor_final,
           IFNULL(produtos.produtos_total, 0) AS produtos_total,
           IFNULL(produtos.produtos_com_preco, 0) AS produtos_com_preco,
           IFNULL(anexos.resultado_ok, 0) AS resultado_ok,
           IFNULL(anexos.resultado_pendente, 0) AS resultado_pendente,
           IFNULL(anexos.anexo_edital_ou_tecnico_ok, 0) AS anexo_edital_ou_tecnico_ok
      FROM documentos d
      JOIN produtos ON produtos.documento_id = d.id
      LEFT JOIN licitacoes_detalhes ld ON ld.documento_id = d.id
      LEFT JOIN anexos ON anexos.documento_id = d.id
     WHERE d.tipo = 'edital'
       AND d.ano BETWEEN 2025 AND 2028
       AND produtos.produtos_total > 0
       AND IFNULL(produtos.produtos_com_preco, 0) = 0
     ORDER BY d.ano DESC, d.id DESC
  `);

  const itens = rows
    .map((row) => ({ ...row, classificacao: classifyProdutoPrecoLacuna(row) }))
    .filter((row) => row.classificacao);
  const itensAcionaveis = itens.filter((item) => isLacunaPrecoAcionavel(item.classificacao));
  const itensJustificados = itens.filter((item) => !isLacunaPrecoAcionavel(item.classificacao));
  const porTipo = {};
  const porTipoAcionavel = {};
  const porTipoJustificado = {};
  const porDetalhe = {};
  for (const item of itens) {
    porTipo[item.classificacao.codigo] = (porTipo[item.classificacao.codigo] || 0) + 1;
    const bucket = isLacunaPrecoAcionavel(item.classificacao) ? porTipoAcionavel : porTipoJustificado;
    bucket[item.classificacao.codigo] = (bucket[item.classificacao.codigo] || 0) + 1;
    const detalhe = `${item.classificacao.codigo}:${item.classificacao.detalhe}`;
    porDetalhe[detalhe] = (porDetalhe[detalhe] || 0) + 1;
  }

  return {
    total: itens.length,
    total_acionavel: itensAcionaveis.length,
    total_justificado: itensJustificados.length,
    por_tipo: Object.entries(porTipo).map(([tipo, n]) => ({ tipo, n })).sort((a, b) => b.n - a.n),
    por_tipo_acionavel: Object.entries(porTipoAcionavel).map(([tipo, n]) => ({ tipo, n })).sort((a, b) => b.n - a.n),
    por_tipo_justificado: Object.entries(porTipoJustificado).map(([tipo, n]) => ({ tipo, n })).sort((a, b) => b.n - a.n),
    por_detalhe: Object.entries(porDetalhe).map(([detalhe, n]) => ({ detalhe, n })).sort((a, b) => b.n - a.n),
    itens: itens.slice(0, 20).map((item) => ({
      id: item.id,
      ano: item.ano,
      titulo: item.titulo,
      produtos_total: item.produtos_total,
      valor_final: item.valor_final || null,
      codigo: item.classificacao.codigo,
      detalhe: item.classificacao.detalhe,
      acionavel: isLacunaPrecoAcionavel(item.classificacao),
      acao: acaoLacunaPreco(item.classificacao.codigo, item.classificacao.detalhe),
    })),
  };
}

function collectMetrics() {
  const totalDocs = getOne('SELECT COUNT(*) n FROM documentos').n;
  const totalEditais = getOne("SELECT COUNT(*) n FROM documentos WHERE tipo='edital'").n;
  const docsComTexto = getOne("SELECT COUNT(*) n FROM documentos WHERE LENGTH(TRIM(IFNULL(texto_completo,''))) > 0").n;
  const editaisSemPdfRow = getOne(`
    SELECT COUNT(*) n,
           SUM(CASE WHEN LENGTH(TRIM(IFNULL(texto_completo,''))) = 0 THEN 1 ELSE 0 END) sem_texto,
           SUM(CASE WHEN LENGTH(TRIM(IFNULL(texto_completo,''))) > 0 THEN 1 ELSE 0 END) com_texto
      FROM documentos
     WHERE tipo='edital' AND (status_coleta='sem_pdf' OR IFNULL(url_pdf,'')='')
  `);
  const editaisSemPdf = editaisSemPdfRow.n || 0;
  const docsSemData = getOne("SELECT COUNT(*) n FROM documentos WHERE IFNULL(data_publicacao,'')=''").n;
  const detalhes = getOne(`
    SELECT COUNT(*) total,
           SUM(CASE WHEN IFNULL(vencedor_nome,'') <> '' THEN 1 ELSE 0 END) vencedor,
           SUM(CASE WHEN valor_final IS NOT NULL AND valor_final > 0 THEN 1 ELSE 0 END) valor
      FROM licitacoes_detalhes
  `);
  const produtos = getOne(`
    SELECT COUNT(*) total,
           COUNT(DISTINCT documento_id) documentos,
           SUM(CASE WHEN IFNULL(fornecedor_nome,'') <> '' THEN 1 ELSE 0 END) fornecedor,
           SUM(CASE WHEN valor_total_final IS NOT NULL
                      OR valor_unitario_final IS NOT NULL
                      OR valor_lote_final IS NOT NULL
                      OR valor_global_final IS NOT NULL
                    THEN 1 ELSE 0 END) valor_final
      FROM licitacoes_produtos
  `);
  const editaisSemProdutos = getOne(`
    SELECT COUNT(*) n
      FROM documentos d
     WHERE d.tipo = 'edital'
       AND NOT EXISTS (SELECT 1 FROM licitacoes_produtos p WHERE p.documento_id = d.id)
  `).n;
  const resumos = getOne(`
    SELECT COUNT(*) total,
           SUM(CASE WHEN status='ok' THEN 1 ELSE 0 END) ok,
           SUM(CASE WHEN status<>'ok' THEN 1 ELSE 0 END) erro
      FROM documentos_resumos_ai
  `);
  const resumosSemTexto = getAll(`
    SELECT d.id, d.ano, d.tipo, d.status_coleta, d.titulo, COUNT(r.id) resumos
      FROM documentos d
      JOIN documentos_resumos_ai r ON r.documento_id = d.id AND r.status = 'ok'
     WHERE LENGTH(TRIM(IFNULL(d.texto_completo,''))) = 0
     GROUP BY d.id
     ORDER BY d.ano DESC, d.id DESC
  `);
  const anexosStatus = getAll(`
    SELECT status_extracao, COUNT(*) n
      FROM documentos_anexos
     GROUP BY status_extracao
     ORDER BY n DESC
  `);
  const despesasPorAno = getAll(`
    SELECT exercicio_orcamento ano,
           COUNT(*) n,
           ROUND(SUM(valor), 2) total,
           COUNT(DISTINCT credor_cnpj) credores,
           SUM(CASE WHEN documento_id IS NOT NULL THEN 1 ELSE 0 END) vinculadas
      FROM transparencia_despesas
     GROUP BY exercicio_orcamento
     ORDER BY ano DESC
  `);
  const receitasPorAno = getAll(`
    SELECT exercicio ano, COUNT(*) n, ROUND(SUM(valor_previsto), 2) total
      FROM transparencia_receitas
     GROUP BY exercicio
     ORDER BY ano DESC
  `);
  const alertas = getAll('SELECT status, COUNT(*) n FROM alertas GROUP BY status ORDER BY n DESC');
  const descobertasInvestigacao = {
    por_status: getAll(`
      SELECT COALESCE(json_extract(metadados_json, '$.discovery_v2.status'), 'sem_ia') status,
             COUNT(*) n
        FROM alertas
       WHERE status='ativo'
         AND json_extract(metadados_json, '$.discovery_kind')='investigacao_factual'
       GROUP BY status
       ORDER BY n DESC
    `),
    pendentes: getOne(`
      SELECT COUNT(*) n
        FROM alertas
       WHERE status='ativo'
         AND json_extract(metadados_json, '$.discovery_kind')='investigacao_factual'
         AND (
           json_extract(metadados_json, '$.discovery_v2.status') IS NULL
           OR json_extract(metadados_json, '$.discovery_v2.status') IN ('fallback','limite_ciclo','revisao_admin','desativado')
         )
    `).n,
    ultimo_ciclo: (getOne("SELECT ultimo_processado_em FROM alertas_watermark WHERE chave='descobertas:investigacao_ultimo_ciclo'") || {}).ultimo_processado_em || null,
  };
  const alertasWatermark = getOne("SELECT ultimo_processado_em, atualizado_em FROM alertas_watermark WHERE chave='alertas:ultimo_ciclo'") || {};
  const ultimoResumoAi = getOne(`
    SELECT MAX(COALESCE(atualizado_em, criado_em)) ultimo_resumo_ai
      FROM documentos_resumos_ai
     WHERE status='ok' AND provider <> 'mock'
  `);
  const alertasPendentes = Boolean(
    ultimoResumoAi?.ultimo_resumo_ai &&
    (!alertasWatermark.ultimo_processado_em ||
      new Date(ultimoResumoAi.ultimo_resumo_ai).getTime() > new Date(alertasWatermark.ultimo_processado_em).getTime())
  );
  const grupos = getOne(`
    SELECT COUNT(*) grupos,
           SUM(CASE WHEN total_documentos > 1 THEN 1 ELSE 0 END) multi,
           SUM(total_documentos) documentos
      FROM licitacoes_grupos
  `);
  const duplicatasHash = getAll(`
    SELECT hash_conteudo, COUNT(*) n, GROUP_CONCAT(id) ids
      FROM documentos
     WHERE IFNULL(hash_conteudo,'') <> ''
     GROUP BY hash_conteudo
    HAVING COUNT(*) > 1
     ORDER BY n DESC
     LIMIT 20
  `);
  const duplicatasPdf = getAll(`
    SELECT url_pdf, COUNT(*) n, GROUP_CONCAT(id) ids
      FROM documentos
     WHERE IFNULL(url_pdf,'') <> ''
     GROUP BY url_pdf
    HAVING COUNT(*) > 1
     ORDER BY n DESC
     LIMIT 20
  `);
  const orfaos = {
    anexos: getOne('SELECT COUNT(*) n FROM documentos_anexos a LEFT JOIN documentos d ON d.id=a.documento_id WHERE d.id IS NULL').n,
    resumos: getOne('SELECT COUNT(*) n FROM documentos_resumos_ai r LEFT JOIN documentos d ON d.id=r.documento_id WHERE d.id IS NULL').n,
    produtos: getOne('SELECT COUNT(*) n FROM licitacoes_produtos p LEFT JOIN documentos d ON d.id=p.documento_id WHERE d.id IS NULL').n,
  };
  const jobs = getAll('SELECT status, COUNT(*) n FROM documentos_resumos_ai_jobs GROUP BY status ORDER BY n DESC');
  const fornecedores = getOne('SELECT COUNT(*) n FROM fornecedores_perfil').n;
  const categorias = getOne("SELECT COUNT(DISTINCT categoria) n FROM licitacoes_categorias WHERE categoria <> 'Outros'").n;
  const resumoAnalisePorAno = getCoberturaResumoAnalisePorAnoLocal();
  const qualidadeAnalisePorAno = getQualidadeAnalisePorAnoLocal();
  const dataFiles = listDataFiles();
  const backupFiles = dataFiles.filter((file) => /^ritapolis-backup-.*\.db$/i.test(file.name));
  const rootBackupFiles = backupFiles.filter((file) => !file.relative_path.includes(path.sep) && !file.relative_path.includes('/'));
  const totalDataBytes = dataFiles.reduce((sum, file) => sum + file.bytes, 0);
  const backupsBytes = backupFiles.reduce((sum, file) => sum + file.bytes, 0);
  const coberturaPorAno = getCoberturaPorAnoLocal();
  const lacunasPrecoProdutos = getLacunasPrecoProdutos();

  return {
    generated_at: new Date().toISOString(),
    documentos: {
      total: totalDocs,
      editais: totalEditais,
      com_texto: docsComTexto,
      com_texto_pct: pct(docsComTexto, totalDocs),
      editais_sem_pdf: editaisSemPdf,
      editais_sem_pdf_sem_texto: editaisSemPdfRow.sem_texto || 0,
      editais_sem_pdf_com_texto: editaisSemPdfRow.com_texto || 0,
      sem_data: docsSemData,
      por_tipo: getAll('SELECT tipo, COUNT(*) n FROM documentos GROUP BY tipo ORDER BY n DESC'),
      por_fonte: getAll('SELECT fonte, COUNT(*) n FROM documentos GROUP BY fonte ORDER BY n DESC'),
      por_status: getAll('SELECT status_coleta, COUNT(*) n FROM documentos GROUP BY status_coleta ORDER BY n DESC'),
    },
    licitacoes: {
      detalhes,
      vencedor_pct: pct(detalhes.vencedor || 0, totalEditais),
      valor_pct: pct(detalhes.valor || 0, totalEditais),
      produtos,
      lacunas_preco_produtos: lacunasPrecoProdutos,
      editais_sem_produtos: editaisSemProdutos,
      grupos,
      cobertura_por_ano: coberturaPorAno,
      cobertura_por_mandato: getCoberturaPorMandatoLocal(coberturaPorAno),
    },
    ia: {
      resumos,
      jobs,
      resumos_sem_texto: resumosSemTexto,
      cobertura_resumo_analise_por_ano: resumoAnalisePorAno,
      cobertura_resumo_analise_por_mandato: getCoberturaResumoAnalisePorMandatoLocal(resumoAnalisePorAno),
      qualidade_analise_por_ano: qualidadeAnalisePorAno,
      qualidade_analise_por_mandato: getQualidadeAnalisePorMandatoLocal(qualidadeAnalisePorAno),
    },
    anexos: {
      por_status: anexosStatus,
      requer_ocr: anexosStatus.find((item) => item.status_extracao === 'requer_ocr')?.n || 0,
      pendentes: anexosStatus.find((item) => item.status_extracao === 'pendente')?.n || 0,
    },
    transparencia: {
      despesas_por_ano: despesasPorAno,
      receitas_por_ano: receitasPorAno,
      fornecedores,
      categorias,
    },
    alertas,
    descobertas_investigacao: descobertasInvestigacao,
    alertas_automacao: {
      enabled: config.alertasEnabled,
      scheduler_enabled: config.alertasSchedulerEnabled,
      ultimo_ciclo: alertasWatermark.ultimo_processado_em || null,
      ultimo_resumo_ai: ultimoResumoAi?.ultimo_resumo_ai || null,
      pendente: alertasPendentes,
      limite_por_ciclo: config.alertasLimitePorCiclo,
    },
    qualidade: {
      duplicatas_hash: duplicatasHash,
      duplicatas_pdf: duplicatasPdf,
      orfaos,
    },
    armazenamento: {
      data_files: dataFiles,
      backup_files: backupFiles,
      root_backup_files: rootBackupFiles,
      total_data_bytes: totalDataBytes,
      total_data_human: bytesToHuman(totalDataBytes),
      backup_bytes: backupsBytes,
      backup_human: bytesToHuman(backupsBytes),
    },
  };
}

function mandatoInicio(ano) {
  return 2025 + Math.floor((Number(ano) - 2025) / 4) * 4;
}

function mandatoLabel(inicio) {
  return `${inicio}-${inicio + 3}`;
}

function getCoberturaPorAnoLocal() {
  return getAll(`
    SELECT d.ano,
           COUNT(*) AS total,
           SUM(CASE WHEN ld.vencedor_nome IS NOT NULL AND ld.vencedor_nome <> '' THEN 1 ELSE 0 END) AS com_vencedor,
           SUM(CASE WHEN ld.valor_final IS NOT NULL AND ld.valor_final > 0 THEN 1 ELSE 0 END) AS com_valor,
           SUM(CASE WHEN EXISTS (
             SELECT 1 FROM documentos_resumos_ai r
              WHERE r.documento_id = d.id AND r.status = 'ok' AND r.provider <> 'mock'
                AND r.contrato_versao NOT LIKE '2.%'
           ) THEN 1 ELSE 0 END) AS com_resumo,
           SUM(CASE WHEN EXISTS (
             SELECT 1 FROM documentos_resumos_ai r
              WHERE r.documento_id = d.id AND r.status = 'ok' AND r.provider <> 'mock'
                AND r.contrato_versao LIKE '2.%'
           ) THEN 1 ELSE 0 END) AS com_analise
      FROM documentos d
      LEFT JOIN licitacoes_detalhes ld ON ld.documento_id = d.id
     WHERE d.tipo = 'edital' AND d.ano IS NOT NULL
     GROUP BY d.ano
     ORDER BY d.ano DESC
  `).map((row) => ({
    ano: row.ano,
    total: row.total,
    com_vencedor: row.com_vencedor || 0,
    com_valor: row.com_valor || 0,
    com_resumo: row.com_resumo || 0,
    com_analise: row.com_analise || 0,
    vencedor_pct: pct(row.com_vencedor || 0, row.total),
    valor_pct: pct(row.com_valor || 0, row.total),
    resumo_pct: pct(row.com_resumo || 0, row.total),
    analise_pct: pct(row.com_analise || 0, row.total),
  }));
}

function getCoberturaPorMandatoLocal(coberturaPorAno) {
  const porMandato = new Map();
  for (const row of coberturaPorAno) {
    const inicio = mandatoInicio(row.ano);
    const key = mandatoLabel(inicio);
    const atual = porMandato.get(key) || {
      mandato: key,
      inicio,
      fim: inicio + 3,
      anos: [],
      total: 0,
      com_vencedor: 0,
      com_valor: 0,
      com_resumo: 0,
      com_analise: 0,
    };
    atual.anos.push(row.ano);
    atual.total += row.total || 0;
    atual.com_vencedor += row.com_vencedor || 0;
    atual.com_valor += row.com_valor || 0;
    atual.com_resumo += row.com_resumo || 0;
    atual.com_analise += row.com_analise || 0;
    porMandato.set(key, atual);
  }

  return [...porMandato.values()]
    .sort((a, b) => b.inicio - a.inicio)
    .map((row) => ({
      ...row,
      anos: row.anos.sort((a, b) => b - a).join(', '),
      vencedor_pct: pct(row.com_vencedor, row.total),
      valor_pct: pct(row.com_valor, row.total),
      resumo_pct: pct(row.com_resumo, row.total),
      analise_pct: pct(row.com_analise, row.total),
    }));
}

function getCoberturaResumoAnalisePorAnoLocal() {
  return getAll(`
    SELECT d.ano,
           COUNT(*) AS total,
           SUM(CASE WHEN EXISTS (
             SELECT 1 FROM documentos_resumos_ai r
              WHERE r.documento_id=d.id AND r.status='ok' AND r.provider<>'mock'
                AND r.contrato_versao NOT LIKE '2.%'
           ) THEN 1 ELSE 0 END) AS resumo_v1,
           SUM(CASE WHEN EXISTS (
             SELECT 1 FROM documentos_resumos_ai r
              WHERE r.documento_id=d.id AND r.status='ok' AND r.provider<>'mock'
                AND r.contrato_versao LIKE '2.%'
           ) THEN 1 ELSE 0 END) AS analise_v2,
           SUM(CASE WHEN EXISTS (
             SELECT 1 FROM documentos_resumos_ai r
              WHERE r.documento_id=d.id AND r.status='ok' AND r.provider<>'mock'
                AND r.contrato_versao NOT LIKE '2.%'
           ) AND EXISTS (
             SELECT 1 FROM documentos_resumos_ai r
              WHERE r.documento_id=d.id AND r.status='ok' AND r.provider<>'mock'
                AND r.contrato_versao LIKE '2.%'
           ) THEN 1 ELSE 0 END) AS ambos,
           SUM(CASE WHEN EXISTS (
             SELECT 1 FROM documentos_resumos_ai r
              WHERE r.documento_id=d.id AND r.status='ok' AND r.provider<>'mock'
                AND r.contrato_versao NOT LIKE '2.%'
           ) AND NOT EXISTS (
             SELECT 1 FROM documentos_resumos_ai r
              WHERE r.documento_id=d.id AND r.status='ok' AND r.provider<>'mock'
                AND r.contrato_versao LIKE '2.%'
           ) THEN 1 ELSE 0 END) AS so_resumo,
           SUM(CASE WHEN NOT EXISTS (
             SELECT 1 FROM documentos_resumos_ai r
              WHERE r.documento_id=d.id AND r.status='ok' AND r.provider<>'mock'
           ) THEN 1 ELSE 0 END) AS nenhum
      FROM documentos d
     WHERE d.tipo='edital' AND d.ano IS NOT NULL
     GROUP BY d.ano
     ORDER BY d.ano DESC
  `).map((row) => ({
    ...row,
    resumo_pct: pct(row.resumo_v1 || 0, row.total),
    analise_pct: pct(row.analise_v2 || 0, row.total),
    ambos_pct: pct(row.ambos || 0, row.total),
    so_resumo_pct: pct(row.so_resumo || 0, row.total),
  }));
}

function getCoberturaResumoAnalisePorMandatoLocal(rows) {
  const porMandato = new Map();
  for (const row of rows) {
    const inicio = mandatoInicio(row.ano);
    const key = mandatoLabel(inicio);
    const atual = porMandato.get(key) || {
      mandato: key,
      inicio,
      fim: inicio + 3,
      anos: [],
      total: 0,
      resumo_v1: 0,
      analise_v2: 0,
      ambos: 0,
      so_resumo: 0,
      nenhum: 0,
    };
    atual.anos.push(row.ano);
    atual.total += row.total || 0;
    atual.resumo_v1 += row.resumo_v1 || 0;
    atual.analise_v2 += row.analise_v2 || 0;
    atual.ambos += row.ambos || 0;
    atual.so_resumo += row.so_resumo || 0;
    atual.nenhum += row.nenhum || 0;
    porMandato.set(key, atual);
  }

  return [...porMandato.values()]
    .sort((a, b) => b.inicio - a.inicio)
    .map((row) => ({
      ...row,
      anos: row.anos.sort((a, b) => b - a).join(', '),
      resumo_pct: pct(row.resumo_v1, row.total),
      analise_pct: pct(row.analise_v2, row.total),
      ambos_pct: pct(row.ambos, row.total),
      so_resumo_pct: pct(row.so_resumo, row.total),
    }));
}

function getQualidadeAnalisePorAnoLocal() {
  return getAll(`
    WITH latest AS (
      SELECT r.documento_id, r.id, json_extract(r.resumo_json, '$.confianca') AS confianca
        FROM documentos_resumos_ai r
       WHERE r.status = 'ok'
         AND r.provider <> 'mock'
         AND r.contrato_versao LIKE '2.%'
         AND r.id = (
           SELECT r2.id
             FROM documentos_resumos_ai r2
            WHERE r2.documento_id = r.documento_id
              AND r2.status = 'ok'
              AND r2.provider <> 'mock'
              AND r2.contrato_versao LIKE '2.%'
            ORDER BY datetime(r2.criado_em) DESC, r2.id DESC
            LIMIT 1
         )
    )
    SELECT d.ano,
           COUNT(*) AS total,
           SUM(CASE WHEN latest.documento_id IS NOT NULL THEN 1 ELSE 0 END) AS com_analise,
           SUM(CASE WHEN CAST(IFNULL(latest.confianca, 0) AS REAL) >= 0.70 THEN 1 ELSE 0 END) AS alta,
           SUM(CASE WHEN CAST(IFNULL(latest.confianca, 0) AS REAL) >= 0.45
                      AND CAST(IFNULL(latest.confianca, 0) AS REAL) < 0.70 THEN 1 ELSE 0 END) AS media,
           SUM(CASE WHEN latest.documento_id IS NOT NULL
                      AND CAST(IFNULL(latest.confianca, 0) AS REAL) < 0.45 THEN 1 ELSE 0 END) AS baixa,
           ROUND(AVG(CASE WHEN latest.documento_id IS NOT NULL THEN CAST(IFNULL(latest.confianca, 0) AS REAL) END), 3) AS confianca_media
      FROM documentos d
      LEFT JOIN latest ON latest.documento_id = d.id
     WHERE d.tipo = 'edital' AND d.ano IS NOT NULL
     GROUP BY d.ano
     ORDER BY d.ano DESC
  `).map((row) => ({
    ...row,
    alta_pct: pct(row.alta || 0, row.com_analise || 0),
    media_pct: pct(row.media || 0, row.com_analise || 0),
    baixa_pct: pct(row.baixa || 0, row.com_analise || 0),
  }));
}

function getQualidadeAnalisePorMandatoLocal(rows) {
  const porMandato = new Map();
  for (const row of rows) {
    const inicio = mandatoInicio(row.ano);
    const key = mandatoLabel(inicio);
    const atual = porMandato.get(key) || {
      mandato: key,
      inicio,
      fim: inicio + 3,
      anos: [],
      total: 0,
      com_analise: 0,
      alta: 0,
      media: 0,
      baixa: 0,
      confianca_soma: 0,
    };
    atual.anos.push(row.ano);
    atual.total += row.total || 0;
    atual.com_analise += row.com_analise || 0;
    atual.alta += row.alta || 0;
    atual.media += row.media || 0;
    atual.baixa += row.baixa || 0;
    atual.confianca_soma += Number(row.confianca_media || 0) * (row.com_analise || 0);
    porMandato.set(key, atual);
  }

  return [...porMandato.values()]
    .sort((a, b) => b.inicio - a.inicio)
    .map((row) => ({
      ...row,
      anos: row.anos.sort((a, b) => b - a).join(', '),
      confianca_media: row.com_analise > 0 ? Number((row.confianca_soma / row.com_analise).toFixed(3)) : null,
      alta_pct: pct(row.alta, row.com_analise),
      media_pct: pct(row.media, row.com_analise),
      baixa_pct: pct(row.baixa, row.com_analise),
    }));
}

module.exports = {
  bytesToHuman,
  collectMetrics,
  pct,
};
