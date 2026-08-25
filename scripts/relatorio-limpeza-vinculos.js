'use strict';

/**
 * Gera um inventário dry-run dos vínculos empenho -> documento.
 *
 * O script nunca grava no banco nem altera a API. Por padrão consulta a
 * produção, classifica apenas por correspondência exata (tipo + número + ano)
 * e grava o relatório em validation/, diretório ignorado pelo Git.
 *
 * Uso:
 *   node scripts/relatorio-limpeza-vinculos.js
 *   RITAPOLIS_AUDIT_API=https://.../api node scripts/relatorio-limpeza-vinculos.js
 */

const fs = require('fs');
const path = require('path');
const {
  parseModalidadeDespesa,
  parseModalidadeEdital,
} = require('../src/licitacoes/modalidade');

const API_BASE = String(process.env.RITAPOLIS_AUDIT_API || 'https://monitor-ritapolis-api.onrender.com/api').replace(/\/$/, '');
const USAR_BANCO_LOCAL = process.argv.includes('--local');
const OUTPUT_DIR = path.resolve(__dirname, '..', 'validation');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const JSON_OUTPUT = path.join(OUTPUT_DIR, `relatorio-vinculos-${timestamp}.json`);
const CSV_OUTPUT = path.join(OUTPUT_DIR, `relatorio-vinculos-${timestamp}.csv`);
const LIMITE = 100;

function chave(parsed) {
  return parsed ? `${parsed.tipo}|${parsed.numero}|${parsed.ano}` : null;
}

function valorNumerico(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function resumoTexto(value, limite = 280) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limite ? `${text.slice(0, limite - 1)}…` : text;
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`GET ${url} retornou HTTP ${response.status}`);
  }
  return response.json();
}

async function listar(endpoint) {
  const primeira = await getJson(`${API_BASE}/${endpoint}?limite=${LIMITE}&pagina=1`);
  const total = Number(primeira.total) || 0;
  const paginas = Math.ceil(total / LIMITE);
  const registros = Array.isArray(primeira.dados) ? [...primeira.dados] : [];
  const tamanhoLote = 8;

  for (let inicio = 2; inicio <= paginas; inicio += tamanhoLote) {
    const lote = [];
    for (let pagina = inicio; pagina < inicio + tamanhoLote && pagina <= paginas; pagina += 1) {
      lote.push(getJson(`${API_BASE}/${endpoint}?limite=${LIMITE}&pagina=${pagina}`));
    }
    const respostas = await Promise.all(lote);
    for (const data of respostas) {
      if (Array.isArray(data.dados)) {
        registros.push(...data.dados);
      }
    }
  }

  return { total: registros.length, registros };
}

function listarDoBancoLocal(endpoint) {
  const { db } = require('../src/db');
  if (endpoint === 'documentos') {
    return {
      total: db.prepare("SELECT COUNT(*) AS n FROM documentos WHERE tipo IN ('edital', 'publicacao_extrato')").get().n,
      registros: db.prepare("SELECT id, fonte, tipo, numero, ano, titulo FROM documentos WHERE tipo IN ('edital', 'publicacao_extrato') ORDER BY id ASC").all(),
    };
  }
  return {
    total: db.prepare('SELECT COUNT(*) AS n FROM transparencia_despesas').get().n,
    registros: db.prepare(`
      SELECT id, exercicio_orcamento, empenho, credor_nome, credor_cnpj, valor,
             modalidade, licitacao_ref, historico, documento_id
      FROM transparencia_despesas
      ORDER BY id ASC
    `).all(),
  };
}

function indexarDocumentos(documentos) {
  const porId = new Map(documentos.map((documento) => [Number(documento.id), documento]));
  const porChave = new Map();

  for (const documento of documentos) {
    if (!['edital', 'publicacao_extrato'].includes(documento.tipo)) {
      continue;
    }
    const parsed = parseModalidadeEdital(documento.titulo);
    const key = chave(parsed);
    if (!key) {
      continue;
    }
    if (!porChave.has(key)) {
      porChave.set(key, []);
    }
    porChave.get(key).push({
      id: Number(documento.id),
      titulo: documento.titulo,
      numero: documento.numero || null,
      ano: documento.ano || null,
      chave: key,
    });
  }

  return { porId, porChave };
}

function classificarDespesa(despesa, indices) {
  const modalidade = parseModalidadeDespesa(despesa.modalidade);
  const modalidadeChave = chave(modalidade);
  const atual = despesa.documento_id ? indices.porId.get(Number(despesa.documento_id)) : null;
  const atualParsed = atual ? parseModalidadeEdital(atual.titulo) : null;
  const atualChave = chave(atualParsed);
  const candidatos = modalidadeChave ? (indices.porChave.get(modalidadeChave) || []) : [];
  const exato = Boolean(modalidadeChave && atualChave && modalidadeChave === atualChave);

  let status;
  let acao;
  if (exato) {
    status = 'exato';
    acao = 'manter';
  } else if (candidatos.length === 1) {
    status = despesa.documento_id ? 'corrigir_para_documento_exato' : 'vincular_documento_exato';
    acao = 'aplicar_somente_apos_backup_e_aprovacao';
  } else if (candidatos.length > 1) {
    status = 'ambiguo_multiplos_documentos_exatos';
    acao = 'revisao_manual_obrigatoria';
  } else if (despesa.documento_id) {
    status = atual ? 'remover_vinculo_sem_documento_exato' : 'vinculo_orfao_sem_documento';
    acao = 'remover_vinculo_publico_apos_revisao';
  } else {
    status = modalidadeChave ? 'sem_vinculo_sem_candidato_exato' : 'modalidade_nao_parseavel';
    acao = 'nao_vincular';
  }

  return {
    status,
    acao,
    empenho_id: Number(despesa.id),
    exercicio: Number(despesa.exercicio_orcamento) || null,
    empenho: despesa.empenho || null,
    credor_nome: despesa.credor_nome || null,
    credor_cnpj: despesa.credor_cnpj || null,
    valor: valorNumerico(despesa.valor),
    modalidade: despesa.modalidade || null,
    modalidade_chave: modalidadeChave,
    licitacao_ref: despesa.licitacao_ref || null,
    historico_resumo: resumoTexto(despesa.historico),
    documento_atual_id: despesa.documento_id ? Number(despesa.documento_id) : null,
    documento_atual_titulo: atual?.titulo || null,
    documento_atual_chave: atualChave,
    candidatos_exatos: candidatos,
  };
}

function agruparDivergencias(itens) {
  const grupos = new Map();
  for (const item of itens) {
    if (item.status === 'exato') {
      continue;
    }
    const key = `${item.modalidade_chave || 'sem-modalidade'} -> ${item.documento_atual_chave || 'sem-documento'}`;
    const atual = grupos.get(key) || {
      chave: key,
      quantidade: 0,
      valor_total: 0,
      status: item.status,
      modalidade: item.modalidade,
      documento_atual_id: item.documento_atual_id,
      documento_atual_titulo: item.documento_atual_titulo,
    };
    atual.quantidade += 1;
    atual.valor_total += item.valor;
    grupos.set(key, atual);
  }
  return [...grupos.values()]
    .sort((a, b) => b.quantidade - a.quantidade || b.valor_total - a.valor_total)
    .map((grupo) => ({ ...grupo, valor_total: Number(grupo.valor_total.toFixed(2)) }));
}

function somarPorStatus(itens) {
  const resumo = {};
  for (const item of itens) {
    if (!resumo[item.status]) {
      resumo[item.status] = { quantidade: 0, valor_total: 0 };
    }
    resumo[item.status].quantidade += 1;
    resumo[item.status].valor_total += item.valor;
  }
  for (const item of Object.values(resumo)) {
    item.valor_total = Number(item.valor_total.toFixed(2));
  }
  return resumo;
}

function csvRows(itens) {
  const colunas = [
    'status', 'acao', 'empenho_id', 'exercicio', 'empenho', 'credor_nome', 'credor_cnpj', 'valor',
    'modalidade', 'modalidade_chave', 'licitacao_ref', 'documento_atual_id', 'documento_atual_titulo',
    'documento_atual_chave', 'candidatos_exatos', 'historico_resumo',
  ];
  const linhas = [colunas.join(';')];
  for (const item of itens.filter((row) => row.status !== 'exato')) {
    linhas.push([
      item.status,
      item.acao,
      item.empenho_id,
      item.exercicio,
      item.empenho,
      item.credor_nome,
      item.credor_cnpj,
      item.valor.toFixed(2),
      item.modalidade,
      item.modalidade_chave,
      item.licitacao_ref,
      item.documento_atual_id,
      item.documento_atual_titulo,
      item.documento_atual_chave,
      item.candidatos_exatos.map((candidate) => `${candidate.id}: ${candidate.titulo}`).join(' | '),
      item.historico_resumo,
    ].map(csvCell).join(';'));
  }
  return `${linhas.join('\n')}\n`;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const [documentos, despesas] = USAR_BANCO_LOCAL
    ? [listarDoBancoLocal('documentos'), listarDoBancoLocal('despesas')]
    : await Promise.all([listar('documentos'), listar('transparencia/despesas')]);
  const indices = indexarDocumentos(documentos.registros);
  const itens = despesas.registros.map((despesa) => classificarDespesa(despesa, indices));
  // O inventário de limpeza não mistura despesas comuns sem modalidade com
  // vínculos de licitação. Entram no escopo apenas registros com vínculo
  // atual ou com modalidade parseável que permita procurar candidato exato.
  const problematicos = itens.filter((item) => (
    item.status !== 'exato' && (item.documento_atual_id || item.modalidade_chave)
  ));
  const vinculosAtuais = itens.filter((item) => item.documento_atual_id);
  const foraEscopo = itens.filter((item) => item.status === 'modalidade_nao_parseavel' && !item.documento_atual_id);
  const report = {
    gerado_em: new Date().toISOString(),
    fonte: USAR_BANCO_LOCAL ? 'data/ritapolis.db (somente leitura)' : API_BASE,
    snapshot_local: USAR_BANCO_LOCAL
      ? { arquivo: path.resolve(__dirname, '..', 'data', 'ritapolis.db'), modificado_em: fs.statSync(path.resolve(__dirname, '..', 'data', 'ritapolis.db')).mtime.toISOString() }
      : null,
    somente_leitura: true,
    criterio_exato: 'tipo + numero + ano da modalidade do empenho contra o titulo do documento',
    totais: {
      documentos: documentos.total,
      despesas: despesas.total,
      despesas_com_documento: vinculosAtuais.length,
      vinculos_atuais_exatos: itens.filter((item) => item.status === 'exato' && item.documento_atual_id).length,
      vinculos_atuais_inexatos: vinculosAtuais.filter((item) => item.status !== 'exato').length,
      candidatos_exatos_sem_vinculo: itens.filter((item) => ['vincular_documento_exato', 'ambiguo_multiplos_documentos_exatos'].includes(item.status)).length,
      despesas_parseaveis_sem_candidato: itens.filter((item) => item.status === 'sem_vinculo_sem_candidato_exato').length,
      despesas_exatas: itens.filter((item) => item.status === 'exato').length,
      despesas_para_revisao: problematicos.length,
      despesas_fora_escopo_sem_modalidade: foraEscopo.length,
    },
    resumo_por_status: somarPorStatus(itens),
    divergencias_agrupadas: agruparDivergencias(problematicos),
    itens: problematicos,
  };

  fs.writeFileSync(JSON_OUTPUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(CSV_OUTPUT, csvRows(problematicos), 'utf8');

  console.log(JSON.stringify({
    json: JSON_OUTPUT,
    csv: CSV_OUTPUT,
    totais: report.totais,
    resumo_por_status: report.resumo_por_status,
    principais_divergencias: report.divergencias_agrupadas.slice(0, 15),
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
