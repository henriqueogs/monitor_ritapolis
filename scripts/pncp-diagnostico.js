const { setupDatabase } = require('../src/db/setup');
const {
  listLicitacoesParaDiagnosticoPncp,
  upsertLicitacaoFonteRelacionada
} = require('../src/db');
const config = require('../src/config');
const { compararLicitacaoComPncp } = require('../src/integracoes/correlacao');
const {
  buscarCandidatosPncpEmCascata,
  getStatusCorrespondencia,
  normalizeCnpj
} = require('../src/integracoes/pncp');

function parseArgs(argv) {
  const options = {
    ano: new Date().getFullYear(),
    documentoId: null,
    limite: 20,
    salvar: false,
    dias: 90,
    minScore: 60,
    maxPaginas: 2,
    tamanhoPagina: 50,
    timeoutMs: config.collectorTimeoutMs,
    uf: 'MG',
    cnpj: null,
    usarCnpj: true,
    retrySemCnpj: true,
    limiteCandidatos: 10
  };

  argv.forEach((arg) => {
    if (arg === '--all') {
      options.ano = null;
      return;
    }

    if (arg === '--sem-limite') {
      options.limite = null;
      return;
    }

    if (arg === '--salvar') {
      options.salvar = true;
      return;
    }

    if (arg === '--sem-cnpj') {
      options.usarCnpj = false;
      return;
    }

    if (arg === '--sem-retry-cnpj') {
      options.retrySemCnpj = false;
      return;
    }

    if (arg.startsWith('--ano=')) {
      const ano = Number(arg.split('=')[1]);
      if (Number.isFinite(ano)) {options.ano = ano;}
      return;
    }

    if (arg.startsWith('--documento=')) {
      const documentoId = Number(arg.split('=')[1]);
      if (Number.isFinite(documentoId)) {options.documentoId = documentoId;}
      return;
    }

    if (arg.startsWith('--limite=')) {
      const limite = Number(arg.split('=')[1]);
      if (Number.isFinite(limite) && limite > 0) {options.limite = limite;}
      return;
    }

    if (arg.startsWith('--dias=')) {
      const dias = Number(arg.split('=')[1]);
      if (Number.isFinite(dias) && dias >= 0) {options.dias = dias;}
      return;
    }

    if (arg.startsWith('--min-score=')) {
      const minScore = Number(arg.split('=')[1]);
      if (Number.isFinite(minScore) && minScore >= 0) {options.minScore = minScore;}
      return;
    }

    if (arg.startsWith('--max-paginas=')) {
      const maxPaginas = Number(arg.split('=')[1]);
      if (Number.isFinite(maxPaginas) && maxPaginas > 0) {options.maxPaginas = maxPaginas;}
      return;
    }

    if (arg.startsWith('--tamanho-pagina=')) {
      const tamanhoPagina = Number(arg.split('=')[1]);
      if (Number.isFinite(tamanhoPagina) && tamanhoPagina > 0) {
        options.tamanhoPagina = Math.min(tamanhoPagina, 500);
      }
      return;
    }

    if (arg.startsWith('--timeout-ms=')) {
      const timeoutMs = Number(arg.split('=')[1]);
      if (Number.isFinite(timeoutMs) && timeoutMs > 0) {options.timeoutMs = timeoutMs;}
      return;
    }

    if (arg.startsWith('--uf=')) {
      const uf = arg.split('=')[1];
      if (uf) {options.uf = uf.toUpperCase();}
      return;
    }

    if (arg.startsWith('--cnpj=')) {
      const cnpj = normalizeCnpj(arg.split('=')[1]);
      if (cnpj) {options.cnpj = cnpj;}
      return;
    }

    if (arg.startsWith('--candidatos=')) {
      const limiteCandidatos = Number(arg.split('=')[1]);
      if (Number.isFinite(limiteCandidatos) && limiteCandidatos > 0) {
        options.limiteCandidatos = limiteCandidatos;
      }
    }
  });

  return options;
}

function cnpjForLicitacao(licitacao, options) {
  if (!options.usarCnpj) {return null;}
  if (options.cnpj) {return options.cnpj;}
  if (licitacao.fonte === 'camara') {return config.cnpjCamara;}
  return config.cnpjPrefeitura;
}

function buildLocalTarget(licitacao, options) {
  const modelo = licitacao.licitacao_modelo || {};
  const detalhes = licitacao.licitacao_detalhes || {};

  return {
    documento_id: licitacao.documento_id || licitacao.id,
    id: licitacao.id,
    fonte: licitacao.fonte,
    numero: licitacao.numero,
    ano: licitacao.ano,
    titulo: licitacao.titulo,
    resumo: licitacao.resumo,
    objeto: modelo.objeto || licitacao.resumo || licitacao.titulo,
    processo: modelo.processo || licitacao.numero,
    modalidade: modelo.modalidade_nome || modelo.modalidade || detalhes.modalidade,
    data_publicacao: licitacao.data_publicacao,
    data_abertura: licitacao.data_abertura,
    data_sessao: modelo.data_sessao,
    valor_estimado: licitacao.valor_estimado || modelo.valor_estimado,
    valor_final: detalhes.valor_final,
    numero_pncp: detalhes.numero_pncp,
    cnpjOrgao: cnpjForLicitacao(licitacao, options)
  };
}

function summarizeCandidate(item) {
  const candidato = item.candidato || {};
  return {
    identificador: item.identificador,
    url: item.url,
    score: item.score,
    status_correspondencia: item.status_correspondencia,
    motivos: item.motivos,
    processo: candidato.processo || null,
    numero_compra: candidato.numeroCompra || null,
    ano_compra: candidato.anoCompra || candidato.anoContratacao || null,
    modalidade: candidato.modalidadeNome || candidato.modalidade || null,
    objeto: candidato.objetoCompra || candidato.objetoContratacao || candidato.objeto || null,
    valor_total_estimado: candidato.valorTotalEstimado ?? null,
    valor_total_homologado: candidato.valorTotalHomologado ?? null,
    orgao_cnpj: candidato.orgaoEntidade?.cnpj || candidato.cnpjOrgao || null,
    orgao_nome: candidato.orgaoEntidade?.razaoSocial || candidato.orgaoNome || null
  };
}

function buildFontePayload({ local, item, diagnostico }) {
  return {
    origem: 'pncp_diagnostico',
    local,
    candidato_resumo: summarizeCandidate(item),
    candidato: item.candidato,
    consulta: item.consulta,
    correlacao: compararLicitacaoComPncp(local, item.candidato),
    diagnostico: {
      estrategia: diagnostico.estrategia || null,
      janela: diagnostico.janela,
      modalidade_codes: diagnostico.modalidade_codes,
      consultas_total: diagnostico.consultas.length,
      erros_total: diagnostico.erros.length
    }
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  setupDatabase();

  const licitacoes = listLicitacoesParaDiagnosticoPncp({
    ano: options.ano,
    documentoId: options.documentoId,
    limite: options.limite
  });

  const resultado = {
    modo: options.salvar ? 'salvar_sugestoes' : 'dry_run',
    filtros: {
      ano: options.ano,
      documento_id: options.documentoId,
      limite: options.limite,
      dias: options.dias,
      min_score: options.minScore,
      max_paginas: options.maxPaginas,
      tamanho_pagina: options.tamanhoPagina,
      uf: options.uf,
      usar_cnpj: options.usarCnpj,
      retry_sem_cnpj: options.retrySemCnpj
    },
    documentos_processados: licitacoes.length,
    consultas: 0,
    erros: 0,
    candidatos: 0,
    correspondencias_sugeridas: 0,
    salvos: 0,
    detalhes: []
  };

  for (const licitacao of licitacoes) {
    const local = buildLocalTarget(licitacao, options);
    const diagnostico = await buscarCandidatosPncpEmCascata(local, {
      dias: options.dias,
      cnpj: local.cnpjOrgao,
      uf: options.uf,
      codigoMunicipioIbge: config.ibgeCode,
      maxPaginas: options.maxPaginas,
      tamanhoPagina: options.tamanhoPagina,
      timeoutMs: options.timeoutMs,
      retrySemCnpj: options.retrySemCnpj,
      limiteCandidatos: options.limiteCandidatos,
      minScore: options.minScore
    });

    const candidatosResumo = diagnostico.candidatos.map(summarizeCandidate);
    const sugeridos = diagnostico.candidatos.filter((item) => item.score >= Number(options.minScore));

    resultado.consultas += diagnostico.consultas.length;
    resultado.erros += diagnostico.erros.length;
    resultado.candidatos += diagnostico.candidatos.length;
    resultado.correspondencias_sugeridas += sugeridos.length;

    if (options.salvar) {
      sugeridos.forEach((item) => {
        resultado.salvos += upsertLicitacaoFonteRelacionada({
          documento_id: local.documento_id,
          fonte: 'pncp',
          sistema_origem: 'api_consulta_contratacoes_publicacao',
          identificador: item.identificador,
          url: item.url,
          status_correspondencia: getStatusCorrespondencia(item.score, options.minScore),
          score: item.score,
          payload_json: buildFontePayload({ local, item, diagnostico })
        });
      });
    }

    resultado.detalhes.push({
      documento_id: local.documento_id,
      numero: local.numero,
      processo: local.processo,
      ano: local.ano,
      modalidade: local.modalidade,
      data_publicacao: local.data_publicacao,
      objeto: local.objeto,
      status: diagnostico.status,
      estrategia: diagnostico.estrategia || null,
      janela: diagnostico.janela || null,
      consultas: diagnostico.consultas,
      erros: diagnostico.erros,
      melhor_candidato: candidatosResumo[0] || null,
      candidatos: candidatosResumo
    });
  }

  console.log(JSON.stringify(resultado, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    erro: error.message,
    stack: error.stack
  }, null, 2));
  process.exitCode = 1;
});
