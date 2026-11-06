'use strict';

/**
 * Saneamento profundo de integridade de dados — Monitor Ritápolis.
 *
 * Executa de forma idempotente todas as correções de dados em `data/ritapolis.db`:
 *  1. Normalização de datas (61 `data_abertura` DD/MM/YYYY → ISO YYYY-MM-DD + 3 `data_publicacao` inválidas)
 *  2. Alinhamento de `documentos.ano` com o ano do instrumento/processo (mantendo `data_publicacao` real
 *     para acionar `divergencia_ano_publicacao` e retornar o documento em ambos os anos)
 *  3. Re-extração de `emendas_detalhes` com higienização de `gestor_responsavel` e extração de `emenda_dados_bancarios`
 *  4. Reclassificação das 16 licitações cadastradas como `documento_publico` → `edital`
 *  5. Saneamento de `licitacoes_detalhes` e `licitacoes_produtos` (CNPJs `'undefined'`, CNPJ da Prefeitura,
 *     placeholders `'CONTRATADA'`, `'Empresa ___'`, ruídos de cabeçalho/endereço) + re-extração de detalhes
 *  6. Correção de `credor_cnpj` nos 2 empenhos da Embratel que tinham o CNPJ da Prefeitura e limpeza
 *     de vínculos `documento_id` inexatos em `transparencia_despesas`
 *  7. Correção de quantidades astronômicas corrompidas em `licitacoes_produtos`, execução do gate de
 *     plausibilidade item×processo, reconstrução de `licitacoes_grupos` (sem `ano = 0`), consolidação de
 *     `fornecedores_perfil` e limpeza de alertas espúrios.
 */

const {
  db,
  parseJson,
  serializeJson,
  estruturarDetalhesLicitacoes,
  syncLicitacoesGrupos,
  consolidarFornecedores,
} = require('../src/db/index');
const { parseLicitacaoDetalhes } = require('../src/parsers/licitacao-detalhes');
const {
  parseEmendaParlamentar,
  higienizarGestorResponsavel,
  extrairDadosBancariosEmenda,
} = require('../src/parsers/emenda-parlamentar');
const { salvarEmendaDetalhes } = require('../src/db/emendas-repo');
const { crosswalkDespesasDocumentos, enriquecerDetalhesComEmpenhos } = require('../src/db/transparencia-repo');
const { aplicarGatePlausibilidadeItemProcesso } = require('../src/db/produtos-plausibilidade-repo');
const {
  sanitizarNomeFornecedor,
  sanitizarCnpjFornecedor,
  isCnpjDoEnte,
} = require('../src/licitacoes/fornecedor-sanitizador');
const {
  validarDataIso,
  normalizarDataIso,
  extrairAnoInstrumento,
} = require('../src/utils/datas');
const { TETO_VALOR_PLAUSIVEL } = require('../src/licitacoes/valores');

function corrigirDatasDocumentos() {
  const correcoesConhecidasPublicacao = {
    789: '2025-10-24',  // '2025-10-54' -> '2025-10-24'
    1514: '2023-04-10', // '0202-04-10' -> '2023-04-10' (PL 2023)
    1878: '2023-12-29', // '0023-12-29' -> '2023-12-29' (Lei 1.771 de 29/12/2023)
  };

  let publicacoesCorrigidas = 0;
  let aberturasNormalizadas = 0;

  const docs = db
    .prepare('SELECT id, numero, ano, titulo, data_publicacao, data_abertura FROM documentos')
    .all();

  const updatePub = db.prepare('UPDATE documentos SET data_publicacao = ? WHERE id = ?');
  const updateAbe = db.prepare('UPDATE documentos SET data_abertura = ? WHERE id = ?');

  for (const d of docs) {
    if (d.data_publicacao) {
      const isoValido = validarDataIso(String(d.data_publicacao).slice(0, 10));
      if (!isoValido) {
        const substituto = correcoesConhecidasPublicacao[d.id] || normalizarDataIso(d.data_publicacao);
        updatePub.run(substituto || null, d.id);
        publicacoesCorrigidas += 1;
      }
    }

    if (d.data_abertura) {
      const str = String(d.data_abertura).trim();
      const isoNormalizado = normalizarDataIso(str);
      if (isoNormalizado && isoNormalizado !== str) {
        updateAbe.run(isoNormalizado, d.id);
        aberturasNormalizadas += 1;
      } else if (!isoNormalizado) {
        updateAbe.run(null, d.id);
        aberturasNormalizadas += 1;
      }
    }
  }

  return { publicacoesCorrigidas, aberturasNormalizadas };
}

function reclassificarLicitacoesDocumentoPublico() {
  const candidatos = db
    .prepare(
      `SELECT id, titulo FROM documentos
       WHERE tipo = 'documento_publico'
         AND (
           titulo LIKE 'Processo %/%'
           OR titulo LIKE '%Pregão%'
           OR titulo LIKE '%Tomada de Preço%'
           OR titulo LIKE '%Concorrência%'
           OR titulo LIKE '%Inexigibilidade%'
           OR titulo LIKE '%Inexibilidade%'
           OR titulo LIKE '%Dispensa%'
           OR titulo LIKE '%Chamada Pública%'
           OR titulo LIKE '%Credenciamento%'
           OR titulo LIKE '%Leilão%'
         )`
    )
    .all();

  const updateTipo = db.prepare("UPDATE documentos SET tipo = 'edital' WHERE id = ?");
  for (const doc of candidatos) {
    updateTipo.run(doc.id);
  }
  return candidatos.length;
}

function alinharAnoInstrumentoDocumentos() {
  const docs = db
    .prepare(
      `SELECT id, tipo, numero, ano, titulo, data_publicacao, data_abertura
       FROM documentos
       WHERE tipo IN ('edital', 'publicacao_extrato', 'contrato', 'emenda_parlamentar')`
    )
    .all();

  const updateAno = db.prepare('UPDATE documentos SET ano = ? WHERE id = ?');
  const updateProdAno = db.prepare('UPDATE licitacoes_produtos SET ano = ? WHERE documento_id = ?');
  let alinhados = 0;

  for (const d of docs) {
    const anoInstrumento = extrairAnoInstrumento({
      numero: d.numero,
      titulo: d.titulo,
      dataPublicacao: d.data_publicacao,
      dataAbertura: d.data_abertura,
    });

    if (anoInstrumento && anoInstrumento !== d.ano) {
      updateAno.run(anoInstrumento, d.id);
      updateProdAno.run(anoInstrumento, d.id);
      alinhados += 1;
    }
  }

  return alinhados;
}

function higienizarEmendasParlamentares() {
  const docs = db
    .prepare(
      `SELECT d.id, d.titulo, d.texto_completo, d.dados_extras, ed.gestor_responsavel
       FROM documentos d
       LEFT JOIN emendas_detalhes ed ON ed.documento_id = d.id
       WHERE d.tipo = 'emenda_parlamentar'`
    )
    .all();

  const updateExtras = db.prepare('UPDATE documentos SET dados_extras = ? WHERE id = ?');
  const updateGestor = db.prepare('UPDATE emendas_detalhes SET gestor_responsavel = ? WHERE documento_id = ?');
  let reparseadas = 0;

  for (const doc of docs) {
    const extras = parseJson(doc.dados_extras) || {};
    const dadosBancarios =
      extrairDadosBancariosEmenda(doc.texto_completo) ||
      extrairDadosBancariosEmenda(doc.gestor_responsavel);

    if (dadosBancarios) {
      extras.emenda_dados_bancarios = dadosBancarios;
      updateExtras.run(serializeJson(extras), doc.id);
    }

    if (doc.texto_completo) {
      const parsed = parseEmendaParlamentar(doc.texto_completo, { titulo: doc.titulo });
      if (parsed) {
        salvarEmendaDetalhes(doc.id, parsed);
        reparseadas += 1;
        continue;
      }
    }

    if (doc.gestor_responsavel) {
      updateGestor.run(higienizarGestorResponsavel(doc.gestor_responsavel), doc.id);
    }
  }

  return reparseadas;
}

function sanearFornecedoresELicitacoesDetalhes() {
  // 1. Limpar 'undefined' e nomes/CNPJs inválidos em licitacoes_produtos
  const produtos = db
    .prepare('SELECT id, fornecedor_nome, fornecedor_cnpj FROM licitacoes_produtos WHERE fornecedor_nome IS NOT NULL OR fornecedor_cnpj IS NOT NULL')
    .all();

  const updateProdForn = db.prepare(
    'UPDATE licitacoes_produtos SET fornecedor_nome = ?, fornecedor_cnpj = ? WHERE id = ?'
  );

  let produtosHigienizados = 0;
  for (const p of produtos) {
    const cnpjLimpo = sanitizarCnpjFornecedor(p.fornecedor_cnpj);
    const nomeLimpo = isCnpjDoEnte(p.fornecedor_cnpj)
      ? null
      : sanitizarNomeFornecedor(p.fornecedor_nome);

    if (nomeLimpo !== (p.fornecedor_nome ?? null) || cnpjLimpo !== (p.fornecedor_cnpj ?? null)) {
      updateProdForn.run(nomeLimpo, cnpjLimpo, p.id);
      produtosHigienizados += 1;
    }
  }

  // 2. Limpar nomes/CNPJs inválidos em licitacoes_detalhes
  const detalhes = db
    .prepare('SELECT documento_id, vencedor_nome, vencedor_cnpj, valor_final, status FROM licitacoes_detalhes')
    .all();

  const updateDetForn = db.prepare(
    'UPDATE licitacoes_detalhes SET vencedor_nome = ?, vencedor_cnpj = ?, valor_final = ?, status = ? WHERE documento_id = ?'
  );

  let detalhesHigienizados = 0;
  const docsParaReextrair = new Set();

  for (const det of detalhes) {
    const eraCnpjEnte = isCnpjDoEnte(det.vencedor_cnpj);
    const cnpjLimpo = sanitizarCnpjFornecedor(det.vencedor_cnpj);
    const nomeLimpo = eraCnpjEnte ? null : sanitizarNomeFornecedor(det.vencedor_nome);

    // doc #149: status 'deserta' com valor_final 11689.56 e sem vencedor -> valor estimado capturado como final
    let valorFinal = det.valor_final;
    if (det.status === 'deserta' && !nomeLimpo && !cnpjLimpo && valorFinal !== null) {
      valorFinal = null;
    }

    // doc #218: Leilão de bens móveis (receita, não despesa) com valor de lance de R$ 28.500 como valor_final
    if (det.documento_id === 218 && !nomeLimpo && !cnpjLimpo) {
      valorFinal = null;
    }

    if (
      nomeLimpo !== (det.vencedor_nome ?? null) ||
      cnpjLimpo !== (det.vencedor_cnpj ?? null) ||
      valorFinal !== (det.valor_final ?? null)
    ) {
      updateDetForn.run(nomeLimpo, cnpjLimpo, valorFinal, det.status, det.documento_id);
      detalhesHigienizados += 1;
      docsParaReextrair.add(det.documento_id);
    }
  }

  // 3. Re-extrair detalhes a partir do trecho_fonte ou texto_completo para documentos afetados ou recém-reclassificados
  const docsEdital = db
    .prepare(
      `SELECT d.id, d.texto_completo, d.dados_extras, ld.trecho_fonte
       FROM documentos d
       LEFT JOIN licitacoes_detalhes ld ON ld.documento_id = d.id
       WHERE d.tipo = 'edital'
         AND (IFNULL(d.texto_completo, '') <> '' OR IFNULL(ld.trecho_fonte, '') <> '')
         AND (ld.documento_id IS NULL OR ld.vencedor_nome IS NULL OR ld.vencedor_cnpj IS NULL)`
    )
    .all();

  const updateReextraido = db.prepare(
    `UPDATE licitacoes_detalhes
     SET vencedor_nome = COALESCE(vencedor_nome, @vencedor_nome),
         vencedor_cnpj = COALESCE(vencedor_cnpj, @vencedor_cnpj),
         valor_final = COALESCE(valor_final, @valor_final),
         data_homologacao = COALESCE(data_homologacao, @data_homologacao),
         status = COALESCE(status, @status)
     WHERE documento_id = @documento_id`
  );

  let reextraidos = 0;
  for (const doc of docsEdital) {
    const extras = parseJson(doc.dados_extras) || {};
    const anexos = Array.isArray(extras.anexos) ? extras.anexos : [];
    const parsedTrecho = doc.trecho_fonte ? parseLicitacaoDetalhes(doc.trecho_fonte, { anexos }) : null;
    const parsedTexto = doc.texto_completo ? parseLicitacaoDetalhes(doc.texto_completo, { anexos }) : null;
    const parsed = parsedTrecho?.vencedor_nome ? parsedTrecho : (parsedTexto || parsedTrecho);
    if (!parsed) { continue; }

    const rowExiste = db.prepare('SELECT 1 FROM licitacoes_detalhes WHERE documento_id = ?').get(doc.id);
    if (rowExiste) {
      updateReextraido.run({
        documento_id: doc.id,
        vencedor_nome: sanitizarNomeFornecedor(parsed.vencedor_nome),
        vencedor_cnpj: sanitizarCnpjFornecedor(parsed.vencedor_cnpj),
        valor_final: parsed.status === 'deserta' ? null : (parsed.valor_final ?? null),
        data_homologacao: parsed.data_homologacao || null,
        status: parsed.status || null,
      });
      reextraidos += 1;
    } else {
      estruturarDetalhesLicitacoes({ ano: null, limite: null });
      break;
    }
  }

  return { produtosHigienizados, detalhesHigienizados, reextraidos };
}

function sanearTransparenciaDespesas() {
  // 1. Limpar credor_cnpj quando for o CNPJ da própria Prefeitura/Câmara em fornecedor privado (ex.: Embratel)
  const todosEmpenhosComCnpj = db
    .prepare('SELECT id, credor_nome, credor_cnpj FROM transparencia_despesas WHERE credor_cnpj IS NOT NULL')
    .all();

  const limparCnpjEnte = db.prepare(
    `UPDATE transparencia_despesas
     SET credor_cnpj = NULL,
         credor_chave = 'pf-' || LOWER(REPLACE(TRIM(credor_nome), ' ', '-'))
     WHERE id = ?`
  );

  let cnpjsEnteRemovidos = 0;
  for (const emp of todosEmpenhosComCnpj) {
    if (isCnpjDoEnte(emp.credor_cnpj)) {
      const nomeUpper = String(emp.credor_nome || '').toUpperCase();
      // Se não é a própria Prefeitura/Município/Câmara/Fundo Municipal (ex.: Embratel cadastrado com CNPJ da Prefeitura)
      if (!/PREFEITURA|MUNIC[IÍ]PIO|C[AÂ]MARA|FUNDO MUNICIPAL/.test(nomeUpper)) {
        limparCnpjEnte.run(emp.id);
        cnpjsEnteRemovidos += 1;
      }
    }
  }

  // 2. Relinkar todas as despesas usando correspondência EXATA de modalidade (remove os 3.621 vínculos falsos)
  const relinkados = crosswalkDespesasDocumentos({ relink: true });

  // 3. Enriquecer vencedores de licitações que ficaram sem vencedor com base nos vínculos exatos
  const enriquecidos = enriquecerDetalhesComEmpenhos();

  return { cnpjsEnteRemovidos, relinkados, enriquecidos };
}

function sanearProdutosQuantidadesEPlausibilidade() {
  // 1. Corrigir itens onde `quantidade` veio corrompida por concatenação de dígitos de modelo
  //    ou onde valor_total_estimado / valor_total_final ultrapassa TETO_VALOR_PLAUSIVEL (R$ 100M)
  const itensCorrompidos = db
    .prepare(
      `SELECT id, documento_id, descricao, quantidade,
              valor_unitario_estimado, valor_total_estimado,
              valor_unitario_final, valor_total_final,
              valor_lote_final, valor_global_final
       FROM licitacoes_produtos
       WHERE quantidade > 10000000
          OR valor_total_estimado > @teto
          OR valor_total_final > @teto
          OR (valor_unitario_estimado IS NOT NULL AND quantidade IS NOT NULL AND valor_unitario_estimado * quantidade > @teto)
          OR (valor_unitario_final IS NOT NULL AND quantidade IS NOT NULL AND valor_unitario_final * quantidade > @teto)`
    )
    .all({ teto: TETO_VALOR_PLAUSIVEL });

  const updateItemCorrompido = db.prepare(
    `UPDATE licitacoes_produtos
     SET quantidade = @quantidade,
         valor_total_estimado = @valor_total_estimado,
         valor_total_final = @valor_total_final,
         status_revisao = @status_revisao
     WHERE id = @id`
  );

  let itensSaneados = 0;
  for (const item of itensCorrompidos) {
    let novaQtd = item.quantidade;
    let novoTotalEst = item.valor_total_estimado;
    let novoTotalFin = item.valor_total_final;
    let novoStatus = 'rejeitado';

    if (novaQtd > 10000000) {
      novaQtd = null;
    }
    if (novoTotalEst && novoTotalEst > TETO_VALOR_PLAUSIVEL) {
      novoTotalEst = null;
    }
    if (novoTotalFin && novoTotalFin > TETO_VALOR_PLAUSIVEL) {
      novoTotalFin = null;
    }

    updateItemCorrompido.run({
      id: item.id,
      quantidade: novaQtd,
      valor_total_estimado: novoTotalEst,
      valor_total_final: novoTotalFin,
      status_revisao: novoStatus,
    });
    itensSaneados += 1;
  }

  // 2. Rodar o gate de plausibilidade item×processo em toda a base
  const gateResultado = aplicarGatePlausibilidadeItemProcesso();

  return { itensSaneados, gateResultado };
}

function sanearGruposFornecedoresEAlertas() {
  // 1. Remover grupos órfãos ou com ano = 0 e reconstruir licitacoes_grupos
  db.prepare('DELETE FROM licitacoes_grupos WHERE ano = 0 OR ano IS NULL').run();
  const gruposSync = syncLicitacoesGrupos();

  // 2. Consolidar fornecedores_perfil (agora com nomes higienizados, sem CNPJ do ente e unindo anos_ativos)
  const fornecedoresSync = consolidarFornecedores();

  // 3. Remover alertas espúrios gerados por placeholders ("Empresa _________")
  const alertasRemovidos = db
    .prepare(
      `DELETE FROM alertas
       WHERE titulo LIKE '%Empresa ____%'
          OR titulo LIKE '%CONTRATADA%'
          OR narrativa LIKE '%Empresa ____%'`
    )
    .run().changes || 0;

  return { gruposSync, fornecedoresSync, alertasRemovidos };
}

function executarSaneamentoCompleto() {
  const datas = corrigirDatasDocumentos();
  const reclassificados = reclassificarLicitacoesDocumentoPublico();
  const anosAlinhados = alinharAnoInstrumentoDocumentos();
  const emendas = higienizarEmendasParlamentares();
  const fornecedoresDetalhes = sanearFornecedoresELicitacoesDetalhes();
  const transparencia = sanearTransparenciaDespesas();
  const produtos = sanearProdutosQuantidadesEPlausibilidade();
  const consolidacao = sanearGruposFornecedoresEAlertas();

  return {
    datas,
    reclassificados,
    anosAlinhados,
    emendas,
    fornecedoresDetalhes,
    transparencia,
    produtos,
    consolidacao,
  };
}

if (require.main === module) {
  const relatorio = executarSaneamentoCompleto();
  console.log(JSON.stringify(relatorio, null, 2));
}

module.exports = {
  executarSaneamentoCompleto,
};
