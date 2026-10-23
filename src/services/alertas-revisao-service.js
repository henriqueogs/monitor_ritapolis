'use strict';

/**
 * Revisão editorial dos alertas no admin: lista e detalhe com a revalidação
 * determinística anexada (src/alertas/revalidacao.js) e a decisão do revisor
 * (publicar, manter em revisão, descartar com motivo).
 */

const repo = require('../db/alertas-repo');
const { avaliarAlerta } = require('../alertas/revalidacao');
const { avaliarGateDeterministico, ehDeterministico, PREFIXO_CONFERIDO } = require('../alertas/gate-deterministico');

const ESTADO_REJEITADO = 'rejeitado';
const ESTADO_PUBLICADO = 'publicado';
const PREFIXO_NOTA = 'NOTA: ';
const NOTA_MAX = 500;

// Motivos de descarte que o revisor escolhe na tela. O texto exibido fica no
// frontend (lib/descobertas.js); aqui só os códigos aceitos.
const MOTIVOS_DESCARTE = Object.freeze({
  FALSO_POSITIVO: 'ADMIN_FALSO_POSITIVO',
  EVIDENCIA_INSUFICIENTE: 'ADMIN_EVIDENCIA_INSUFICIENTE',
  DADO_EXTRAIDO_ERRADO: 'ADMIN_DADO_EXTRAIDO_ERRADO',
  LINGUAGEM_INADEQUADA: 'ADMIN_LINGUAGEM_INADEQUADA',
  DUPLICADO: 'ADMIN_DUPLICADO',
  SEM_RELEVANCIA: 'ADMIN_SEM_RELEVANCIA',
  OUTRO: 'ADMIN_OUTRO',
});
const MOTIVOS_VALIDOS = new Set(Object.values(MOTIVOS_DESCARTE));

class DecisaoInvalidaError extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'DecisaoInvalidaError';
  }
}

function comRevalidacao(alerta) {
  return { ...alerta, revalidacao: avaliarAlerta(alerta) };
}

function listarParaRevisao(filtros = {}) {
  const pagina = repo.listarAlertas(filtros);
  return {
    ...pagina,
    dados: pagina.dados.map((resumo) => {
      const completo = repo.getAlerta(resumo.id);
      return completo ? comRevalidacao(completo) : resumo;
    }),
  };
}

function detalharParaRevisao(id) {
  const alerta = repo.getAlerta(id);
  if (!alerta) {
    return null;
  }
  const revisado = comRevalidacao(alerta);
  return {
    ...revisado,
    gate_deterministico: avaliarGateDeterministico(alerta, revisado.revalidacao),
    historico_editorial: repo.listarHistoricoEditorial(id),
  };
}

function normalizarNota(nota) {
  const texto = String(nota ?? '').trim().slice(0, NOTA_MAX);
  return texto ? `${PREFIXO_NOTA}${texto}` : null;
}

// Publicação de alerta determinístico: não há gate da IA; vale o gate próprio
// (revalidação limpa + campos conferidos pelo revisor), registrado no histórico.
function publicarDeterministico(alerta, { conferidos, extras }) {
  const gate = avaliarGateDeterministico(alerta, avaliarAlerta(alerta), { conferidos });
  if (!gate.podePublicar) {
    throw new DecisaoInvalidaError(`publicação bloqueada: ${gate.bloqueio}`);
  }
  return repo.setEstadoEditorial(alerta.id, ESTADO_PUBLICADO, {
    origem: 'admin',
    exigirGateFactual: false,
    motivos: [...gate.campos.map((campo) => `${PREFIXO_CONFERIDO}${campo}`), ...extras],
  });
}

function decidirEditorial(id, { estado, motivos = [], nota, conferidos = [] } = {}) {
  const codigos = Array.isArray(motivos) ? motivos.map(String) : [];
  const invalidos = codigos.filter((codigo) => !MOTIVOS_VALIDOS.has(codigo));
  if (invalidos.length) {
    throw new DecisaoInvalidaError(`motivo inválido: ${invalidos.join(', ')}`);
  }
  if (estado === ESTADO_REJEITADO && !codigos.length) {
    throw new DecisaoInvalidaError('descartar exige ao menos um motivo');
  }
  const notaNormalizada = normalizarNota(nota);
  const extras = notaNormalizada ? [...codigos, notaNormalizada] : codigos;
  if (estado === ESTADO_PUBLICADO) {
    const alerta = repo.getAlerta(id);
    if (alerta && ehDeterministico(alerta)) {
      return publicarDeterministico(alerta, { conferidos, extras });
    }
  }
  return repo.setEstadoEditorial(id, estado, { origem: 'admin', motivos: extras });
}

module.exports = {
  listarParaRevisao,
  detalharParaRevisao,
  decidirEditorial,
  MOTIVOS_DESCARTE,
  DecisaoInvalidaError,
};
