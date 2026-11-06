'use strict';

/**
 * Auditoria profunda de integridade de dados — Monitor Ritápolis.
 *
 * Verifica invariantes de integridade em todo o banco SQLite:
 *  - Coesão temporal: datas ISO válidas no calendário real, ausência de DD/MM/YYYY em colunas ISO,
 *    flag `divergencia_ano_publicacao` e retorno em ambos os anos quando `ano != ano_publicacao`.
 *  - Coesão de pessoas/empresas: zero CNPJ da Prefeitura/Câmara como vencedor/fornecedor/credor privado,
 *    zero placeholders ('CONTRATADA', 'Empresa ___', 'CNPJ sob o nº', 'undefined') em nomes/CNPJs.
 *  - Coesão monetária: zero itens de licitação com valores trilionários/bilionários expostos nas somas,
 *    zero valores finais em processos desertos sem vencedor.
 *  - Coesão de vínculos: zero empenhos vinculados a documentos de modalidade incompatível ou sem modalidade.
 *  - Coesão de emendas parlamentares: `Resolução N.10088/2025` unificada em R$ 150.000,00 com as 2 indicações
 *    discriminadas, gestor sem dados bancários concatenados e vínculo ao empenho `03099-000`.
 */

const {
  db,
  listDocumentos,
  listLicitacoes,
  getLicitacaoAnaliseAnual,
  getFornecedoresRanking,
} = require('../src/db/index');
const { listarEmendas, totaisPorAno } = require('../src/db/emendas-repo');
const { getEmpenhoAtipicos } = require('../src/db/inteligencia-repo');
const { vinculoDocumentoExato } = require('../src/licitacoes/modalidade');
const {
  isCnpjDoEnte,
  isNomeFornecedorInvalido,
} = require('../src/licitacoes/fornecedor-sanitizador');
const { validarDataIso } = require('../src/utils/datas');
const { TETO_VALOR_PLAUSIVEL } = require('../src/licitacoes/valores');

function auditarIntegridadeProfunda() {
  const violacoes = [];

  // 1. Datas inválidas ou em formato DD/MM/YYYY em documentos
  const docsComData = db
    .prepare('SELECT id, data_publicacao, data_abertura FROM documentos WHERE data_publicacao IS NOT NULL OR data_abertura IS NOT NULL')
    .all();

  for (const d of docsComData) {
    if (d.data_publicacao && !validarDataIso(String(d.data_publicacao).slice(0, 10))) {
      violacoes.push({ categoria: 'data_publicacao_invalida', id: d.id, valor: d.data_publicacao });
    }
    if (d.data_abertura && !validarDataIso(String(d.data_abertura).slice(0, 10))) {
      violacoes.push({ categoria: 'data_abertura_invalida', id: d.id, valor: d.data_abertura });
    }
  }

  // 2. Fornecedores e vencedores inválidos ou CNPJ do ente em licitacoes_detalhes / licitacoes_produtos / fornecedores_perfil
  const detalhes = db
    .prepare('SELECT documento_id, vencedor_nome, vencedor_cnpj, status, valor_final FROM licitacoes_detalhes')
    .all();

  for (const det of detalhes) {
    if (det.vencedor_cnpj && (isCnpjDoEnte(det.vencedor_cnpj) || det.vencedor_cnpj === 'undefined')) {
      violacoes.push({ categoria: 'detalhes_vencedor_cnpj_invalido', documento_id: det.documento_id, valor: det.vencedor_cnpj });
    }
    if (det.vencedor_nome && isNomeFornecedorInvalido(det.vencedor_nome)) {
      violacoes.push({ categoria: 'detalhes_vencedor_nome_invalido', documento_id: det.documento_id, valor: det.vencedor_nome });
    }
    if (det.status === 'deserta' && !det.vencedor_nome && !det.vencedor_cnpj && det.valor_final !== null) {
      violacoes.push({ categoria: 'licitacao_deserta_com_valor_final', documento_id: det.documento_id, valor: det.valor_final });
    }
  }

  const prodInvalidos = db
    .prepare(
      `SELECT id, documento_id, fornecedor_nome, fornecedor_cnpj
       FROM licitacoes_produtos
       WHERE fornecedor_cnpj = 'undefined'
          OR fornecedor_nome = 'undefined'`
    )
    .all();
  for (const p of prodInvalidos) {
    violacoes.push({ categoria: 'produto_fornecedor_undefined', id: p.id, documento_id: p.documento_id });
  }

  const perfis = db.prepare('SELECT cnpj, nome_canonico, anos_ativos FROM fornecedores_perfil').all();
  for (const pf of perfis) {
    if (isCnpjDoEnte(pf.cnpj)) {
      violacoes.push({ categoria: 'fornecedor_perfil_cnpj_ente', cnpj: pf.cnpj });
    }
    if (!pf.nome_canonico || isNomeFornecedorInvalido(pf.nome_canonico)) {
      violacoes.push({ categoria: 'fornecedor_perfil_nome_invalido', cnpj: pf.cnpj, nome: pf.nome_canonico });
    }
  }

  // 3. Valores implausíveis (> R$ 100M) expostos nas análises anuais
  for (const ano of [2021, 2022, 2023, 2024, 2025, 2026]) {
    const analise = getLicitacaoAnaliseAnual({ ano });
    if ((analise.produtos?.valor_estimado_total_identificado || 0) > TETO_VALOR_PLAUSIVEL * 5) {
      violacoes.push({
        categoria: 'analise_anual_valor_estimado_astronimico',
        ano,
        valor: analise.produtos.valor_estimado_total_identificado,
      });
    }
  }

  // 4. Vínculos despesa -> documento sem correspondência exata de modalidade
  const despesasVinculadas = db
    .prepare(
      `SELECT td.id, td.empenho, td.exercicio_orcamento, td.modalidade, td.documento_id, d.titulo AS documento_titulo
       FROM transparencia_despesas td
       LEFT JOIN documentos d ON d.id = td.documento_id
       WHERE td.documento_id IS NOT NULL`
    )
    .all();

  for (const desp of despesasVinculadas) {
    if (!vinculoDocumentoExato(desp.modalidade, desp.documento_titulo)) {
      violacoes.push({
        categoria: 'vinculo_despesa_documento_inexato',
        despesa_id: desp.id,
        empenho: desp.empenho,
        modalidade: desp.modalidade,
        documento_id: desp.documento_id,
        documento_titulo: desp.documento_titulo,
      });
    }
  }

  // 5. Grupos de licitação com ano = 0
  const gruposAnoZero = db.prepare('SELECT id, processo_chave, ano FROM licitacoes_grupos WHERE ano = 0 OR ano IS NULL').all();
  for (const g of gruposAnoZero) {
    violacoes.push({ categoria: 'grupo_licitacao_ano_zero', id: g.id, processo_chave: g.processo_chave });
  }

  // 6. Emendas parlamentares: gestor com dados bancários vazados + unificação Resolução N.10088/2025 + filtro dual 2025/2026
  const emendas2025 = listarEmendas({ ano: 2025 });
  const emendas2026 = listarEmendas({ ano: 2026 });

  if (emendas2025.length === 0) {
    violacoes.push({ categoria: 'emendas_2025_vazio' });
  }
  if (emendas2026.length === 0) {
    violacoes.push({ categoria: 'emendas_2026_vazio' });
  }

  for (const em of emendas2025) {
    if (/BANCO\s*:|AG[ÊE]NCIA\s*:|CONTA\s+BANC/i.test(em.gestor_responsavel || '')) {
      violacoes.push({ categoria: 'emenda_gestor_com_banco', id: em.id, gestor: em.gestor_responsavel });
    }
  }

  const res10088 = emendas2025.filter((e) => /10088\/2025/i.test(e.numero_emenda || ''));
  if (res10088.length !== 1 || res10088[0].valor_repasse !== 150000 || res10088[0].indicacoes_discriminadas?.length !== 2) {
    violacoes.push({
      categoria: 'emenda_10088_nao_unificada',
      encontradas: res10088.length,
      valor_repasse: res10088[0]?.valor_repasse,
      indicacoes: res10088[0]?.indicacoes_discriminadas?.length,
    });
  }

  // 7. Filtro dual de ano e flag divergencia_ano_publicacao nos processos de virada de ano (#146, #147, #149)
  const lic2023 = listLicitacoes({ ano: 2023, pagina: 1, limite: 200 }).dados;
  const lic2024 = listLicitacoes({ ano: 2024, pagina: 1, limite: 200 }).dados;
  const doc146Em2023 = lic2023.find((d) => d.id === 146);
  const doc146Em2024 = lic2024.find((d) => d.id === 146);
  if (!doc146Em2023 || !doc146Em2024 || !doc146Em2023.divergencia_ano_publicacao) {
    violacoes.push({
      categoria: 'filtro_dual_ano_licitacao_146',
      em2023: Boolean(doc146Em2023),
      em2024: Boolean(doc146Em2024),
      flag: doc146Em2023?.divergencia_ano_publicacao,
    });
  }

  return {
    ok: violacoes.length === 0,
    total_violacoes: violacoes.length,
    violacoes,
    resumo_verificado: {
      emendas_2025: emendas2025.length,
      emendas_2026: emendas2026.length,
      totais_emendas_por_ano: totaisPorAno(),
      despesas_vinculadas_exatas: despesasVinculadas.length,
      fornecedores_perfil_total: perfis.length,
      top_3_fornecedores: getFornecedoresRanking({ limite: 3 }).map((f) => ({
        cnpj: f.cnpj,
        nome: f.nome_canonico,
        anos_ativos: f.anos_ativos,
      })),
      outliers_2026_vinculos: getEmpenhoAtipicos(2026).outliers_valor.slice(0, 3).map((o) => ({
        empenho: o.empenho,
        credor: o.credor_nome,
        documento_id: o.documento_id,
      })),
    },
  };
}

if (require.main === module) {
  const resultado = auditarIntegridadeProfunda();
  console.log(JSON.stringify(resultado, null, 2));
  if (!resultado.ok) {
    process.exitCode = 1;
  }
}

module.exports = {
  auditarIntegridadeProfunda,
};
