'use strict';

/**
 * Verificação mecânica dos achados do Analista IA (Na Lupa v4, trilha 2). Não julga se a
 * suspeita faz sentido: só garante que cada evidência existe de fato no dossiê (trecho literal,
 * fonte com url_origem), que nenhum valor em reais foi inventado e que a linguagem não acusa.
 * Evidência inválida descarta o achado inteiro. Puro.
 */

const { numerosInventados, termosAcusatorios } = require('../eval/metricas-geracao');

const TIPOS_ACHADO = [
  'repeticao',
  'valor_atipico',
  'concentracao',
  'incoerencia',
  'lacuna_documental',
  'outro_padrao',
];
const TRECHO_MINIMO = 8;
const CAMPOS_TEXTO = ['achado', 'por_que_suspeito', 'o_que_falta_para_confirmar'];

const normalizar = texto =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

// Percentual e ano que o modelo escreveu mas as fontes não trazem: são contas ou palpites dele
// (ex.: "aumento de 1.484%", "a partir de 2033"), não fatos do dossiê.
const PERCENTUAL = /\d[\d.,]*\s*%/g;
const ANO = /(?<!\d)(?:19|20)\d{2}(?!\d)/g;

function derivadosForaDasFontes(texto, fontes) {
  const base = normalizar([...fontes.values()].map(f => f.texto).join(' '));
  const achados = [...texto.matchAll(PERCENTUAL), ...texto.matchAll(ANO)].map(m => m[0]);
  return achados.filter(v => !base.includes(normalizar(v)));
}

function verificarEvidencia(evidencia, fontes) {
  const fonte = fontes.get(String(evidencia?.fonte_id));
  if (!fonte) {
    return { motivo: `fonte inexistente no dossiê (${evidencia?.fonte_id})` };
  }
  const trecho = normalizar(evidencia.trecho);
  if (trecho.length < TRECHO_MINIMO) {
    return { motivo: 'trecho curto demais para conferir' };
  }
  if (!normalizar(fonte.texto).includes(trecho)) {
    return { motivo: `trecho não encontrado na fonte ${evidencia.fonte_id}` };
  }
  return { evidencia: { ...evidencia, url_origem: fonte.url_origem } };
}

function motivosDoAchado(achado, fontes, contexto) {
  const motivos = [];
  const faltando = CAMPOS_TEXTO.filter(c => !String(achado?.[c] ?? '').trim());
  if (faltando.length) {
    motivos.push(`campos ausentes: ${faltando.join(', ')}`);
  }
  if (!TIPOS_ACHADO.includes(achado?.tipo)) {
    motivos.push(`tipo inválido (${achado?.tipo})`);
  }
  if (!Array.isArray(achado?.evidencias) || achado.evidencias.length === 0) {
    motivos.push('sem evidências');
    return { motivos, evidencias: [] };
  }
  const conferidas = achado.evidencias.map(e => verificarEvidencia(e, fontes));
  motivos.push(...conferidas.filter(c => c.motivo).map(c => c.motivo));
  const texto = CAMPOS_TEXTO.map(c => achado[c] ?? '').join(' ');
  const inventados = numerosInventados(texto, contexto);
  if (inventados.length) {
    motivos.push(`número fora das fontes: ${inventados.join(', ')}`);
  }
  const derivados = derivadosForaDasFontes(texto, fontes);
  if (derivados.length) {
    motivos.push(`percentual ou ano fora das fontes: ${derivados.join(', ')}`);
  }
  const acusatorios = termosAcusatorios(texto);
  if (acusatorios.length) {
    motivos.push(`linguagem acusatória: ${acusatorios.join(', ')}`);
  }
  return { motivos, evidencias: conferidas.map(c => c.evidencia).filter(Boolean) };
}

function verificarAchados(resposta, dossie) {
  const fontes = new Map(dossie.fontes.map(f => [String(f.fonte_id), f]));
  const contexto = dossie.fontes.map(f => ({ texto: f.texto }));
  const aceitos = [];
  const descartados = [];
  const achados = Array.isArray(resposta?.achados) ? resposta.achados : [];
  for (const achado of achados) {
    const { motivos, evidencias } = motivosDoAchado(achado, fontes, contexto);
    if (motivos.length) {
      descartados.push({ achado, motivos });
    } else {
      aceitos.push({ ...achado, evidencias });
    }
  }
  return { aceitos, descartados };
}

module.exports = { verificarAchados, TIPOS_ACHADO };
