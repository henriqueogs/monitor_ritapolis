'use strict';

/**
 * Runner do detector "sócio que é servidor". Grava cada sinal como descoberta
 * interna (somente_admin): fica em 'revisao' e o gate determinístico bloqueia
 * a publicação. Evidências: o sócio no quadro societário (Receita), o registro
 * na folha (link da listagem oficial) e os maiores empenhos dos anos em comum.
 * Logs não levam nome de pessoa (LGPD, fiscal-privacidade L4).
 */

const crypto = require('node:crypto');
const logger = require('../logger');
const repo = require('../db/socio-servidor-repo');
const { upsertAlerta } = require('../db/alertas-repo');
const { buildPortalDespesaLink, buildPortalFolhaLink } = require('../transparencia/portal-links');
const { detectarSocioServidor } = require('./detectores/socio-servidor');
const { formatBRL } = require('./tipos');

const TIPO = 'conflito_interesse';
const SUBCATEGORIA = 'socio_servidor';
const QUALIDADE_VERSAO = 'socio-servidor-v1';
const TRECHO_MAX = 200;

const hashDe = (texto) => crypto.createHash('sha256').update(texto, 'utf8').digest('hex');

function periodo(anos) {
  const inicio = anos[0];
  const fim = anos[anos.length - 1];
  return inicio === fim ? `${inicio}` : `${inicio}–${fim}`;
}

function descreverServidor(sinal) {
  const lotacao = sinal.secretaria ? ` (${sinal.secretaria})` : '';
  return `${sinal.cargo || 'cargo não informado'}${lotacao}`;
}

function evidenciaQuadroSocietario(sinal) {
  return {
    documento_id: null,
    papel: 'quadro_societario',
    evidencia_hash: hashDe(`qsa:${sinal.cnpj}:${sinal.socio_nome}`),
    trecho_fonte: `${sinal.socio_nome} — ${sinal.qualificacao || 'sócio'} em ${sinal.razao_social} (CNPJ ${sinal.cnpj})`,
    metadados: { descricao: 'Quadro societário informado pela Receita Federal (sem CPF do sócio)' },
  };
}

function evidenciaFolha(sinal) {
  return {
    documento_id: null,
    papel: 'folha',
    evidencia_hash: hashDe(`folha:${sinal.socio_nome}`),
    trecho_fonte: `${sinal.socio_nome} — ${descreverServidor(sinal)} na folha da Prefeitura em ${sinal.anos.join(', ')}`,
    metadados: { descricao: 'Folha de pagamento da Prefeitura', url_origem: buildPortalFolhaLink().url },
  };
}

function evidenciaEmpenho(d) {
  return {
    documento_id: null,
    papel: 'empenho',
    evidencia_hash: hashDe(`empenho:${d.id}`),
    trecho_fonte: (d.historico || '').slice(0, TRECHO_MAX) || null,
    metadados: {
      empenho_id: d.id,
      empenho: d.empenho,
      exercicio: d.exercicio_orcamento,
      valor: d.valor,
      credor_nome: d.credor_nome,
      portal_url: buildPortalDespesaLink({ empenho: d.empenho, exercicio: d.exercicio_orcamento, tipo: d.tipo }).url,
    },
  };
}

// Puro: sinal do detector → alerta interno no formato do alertas-repo.
function sinalParaAlerta(sinal) {
  const anos = periodo(sinal.anos);
  return {
    tipo: TIPO,
    categoria: 'Conflito de interesse (interno)',
    subcategoria: SUBCATEGORIA,
    severidade: 'atencao',
    titulo: `${sinal.razao_social}: sócio com o mesmo nome de servidor da Prefeitura`,
    narrativa:
      `${sinal.socio_nome} consta no quadro societário de ${sinal.razao_social} (Receita Federal). ` +
      `Uma pessoa com o mesmo nome está na folha da Prefeitura como ${descreverServidor(sinal)} em ${anos}, ` +
      `e a empresa recebeu ${formatBRL(sinal.valor_empenhado)} em empenhos nesses anos. ` +
      'A Receita não informa o CPF do sócio, então pode ser homônimo; confira o CPF antes de qualquer conclusão.',
    periodo_inicio: `${sinal.anos[0]}-01-01`,
    periodo_fim: `${sinal.anos[sinal.anos.length - 1]}-12-31`,
    valor_total: sinal.valor_empenhado,
    valor_periodo_label: `Empenhado em ${anos}`,
    documentos_ids: [],
    questionamentos: [
      'O CPF do sócio (contrato social ou cadastro do fornecedor) é o mesmo do servidor na folha?',
      'O servidor atua no órgão que contratou a empresa (art. 9º, § 1º, da Lei 14.133)?',
    ],
    confianca: 0.5,
    chave_unica: `socio-servidor|${sinal.cnpj}|${sinal.socio_nome}`,
    estado_editorial: 'revisao',
    estado_editorial_origem: 'gerador_factual',
    qualidade_versao: QUALIDADE_VERSAO,
    qualidade_motivos: [],
    metadados: {
      regra: SUBCATEGORIA,
      somente_admin: true,
      unidade: 'R$',
      ano: sinal.anos[sinal.anos.length - 1],
      metricas_deterministicas: { valor_empenhado: sinal.valor_empenhado, empenhos: sinal.empenhos, anos: sinal.anos },
      comparativos_deterministicos: {
        empresa: sinal.razao_social,
        cnpj: sinal.cnpj,
        socio: sinal.socio_nome,
        qualificacao: sinal.qualificacao,
        cargo: sinal.cargo,
        secretaria: sinal.secretaria,
        vinculo: sinal.forma_admissao,
      },
      campos_a_verificar: ['CPF do sócio', 'CPF do servidor', 'órgão de lotação × órgão contratante'],
      lacunas_deterministicas: ['A Receita não informa o CPF do sócio: o cruzamento é só por nome (pode ser homônimo).'],
    },
  };
}

function gerarDescobertasSocioServidor({ dryRun = false } = {}) {
  const sinais = detectarSocioServidor({
    empresas: repo.listarEmpresasComQsa(),
    servidores: repo.listarFolhaPorAno(),
    empenhos: repo.listarEmpenhosPorCredorAno(),
  });
  let gravados = 0;
  for (const sinal of dryRun ? [] : sinais) {
    try {
      const empenhos = repo.listarMaioresEmpenhos(sinal.cnpj, sinal.anos);
      upsertAlerta(sinalParaAlerta(sinal), [], [
        evidenciaQuadroSocietario(sinal),
        evidenciaFolha(sinal),
        ...empenhos.map(evidenciaEmpenho),
      ]);
      gravados += 1;
    } catch (err) {
      logger.error('socio-servidor-runner: falha ao gravar descoberta', { cnpj: sinal.cnpj, erro: err.message });
    }
  }
  return { sinais, gravados, dryRun };
}

module.exports = { gerarDescobertasSocioServidor, sinalParaAlerta };
