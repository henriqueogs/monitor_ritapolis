'use strict';

const { buildHash } = require('../db/inteligencia-fatos-repo');

function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function compactar(texto, limite = 280) {
  return String(texto || '').replace(/\s+/g, ' ').trim().slice(0, limite);
}

function parseNumero(valor) {
  if (valor === null || valor === undefined || valor === '') {
    return null;
  }
  const texto = String(valor).replace(/\./g, '').replace(',', '.');
  const n = Number(texto);
  return Number.isFinite(n) ? n : null;
}

function primeiroNumeroMatch(match) {
  for (let i = 1; i < match.length; i += 1) {
    const n = parseNumero(match[i]);
    if (n !== null) {
      return n;
    }
  }
  return null;
}

function trechoAoRedor(texto, index, limite = 220) {
  const inicio = Math.max(0, index - Math.floor(limite / 2));
  return compactar(String(texto || '').slice(inicio, inicio + limite), limite);
}

const TAXONOMIA = [
  {
    tipo: 'meio_ambiente',
    subtipo: 'supressao_arvores',
    unidade: 'arvores',
    quantidadeRegexes: [
      /(supress(?:a|ao|ão)|corte|remoc(?:a|ao|ão)|retirada|extrac(?:a|ao|ão)).{0,100}?(\d+(?:[.,]\d+)?)\s*(?:arvores?|árvores?|individuos arboreos|indivíduos arbóreos)/gi,
      /(\d+(?:[.,]\d+)?)\s*(?:arvores?|árvores?|individuos arboreos|indivíduos arbóreos).{0,100}?(supress(?:a|ao|ão)|corte|remoc(?:a|ao|ão)|retirada|extrac(?:a|ao|ão))/gi,
    ],
    keywords: ['supressao', 'arvore', 'arvores', 'arboreo', 'corte de arvore'],
  },
  {
    tipo: 'meio_ambiente',
    subtipo: 'poda_arvores',
    unidade: 'arvores',
    quantidadeRegexes: [
      /(poda|podas).{0,100}?(\d+(?:[.,]\d+)?)\s*(?:arvores?|árvores?|individuos arboreos|indivíduos arbóreos)/gi,
      /(\d+(?:[.,]\d+)?)\s*(?:arvores?|árvores?).{0,100}?(poda|podas)/gi,
    ],
    keywords: ['poda', 'arvore', 'arvores'],
  },
  {
    tipo: 'obras',
    subtipo: 'obra_servico',
    keywords: ['obra', 'reforma', 'construcao', 'pavimentacao', 'calcamento', 'drenagem', 'engenharia'],
  },
  {
    tipo: 'saude',
    subtipo: 'servico_saude',
    keywords: ['saude', 'medicamento', 'exame', 'consulta', 'hospital', 'ubs', 'enfermagem', 'odontologico'],
  },
  {
    tipo: 'educacao',
    subtipo: 'servico_educacao',
    keywords: ['educacao', 'escola', 'aluno', 'merenda', 'transporte escolar', 'creche', 'professor'],
  },
  {
    tipo: 'transporte',
    subtipo: 'veiculo_transporte',
    keywords: ['veiculo', 'van', 'onibus', 'micro onibus', 'ambulancia', 'caminhao', 'transporte'],
  },
  {
    tipo: 'eventos',
    subtipo: 'evento_publico',
    keywords: ['evento', 'show', 'exposicao', 'festa', 'carnaval', 'rodeio', 'festival'],
  },
  {
    tipo: 'contratos',
    subtipo: 'servico_recorrente',
    keywords: ['prestacao de servico', 'prestacao de servicos', 'contratacao de empresa', 'locacao', 'manutencao'],
  },
];

function periodoDocumento(documento) {
  const data = documento?.data_publicacao || documento?.data_abertura || null;
  const ano = documento?.ano || (data ? Number(String(data).slice(0, 4)) : null);
  return {
    data_evento: data,
    periodo_inicio: data || (ano ? `${ano}-01-01` : null),
    periodo_fim: data || (ano ? `${ano}-12-31` : null),
  };
}

function extrairFatosTexto({ documento, anexo = null, texto, origem = 'texto_documento' }) {
  const bruto = String(texto || '');
  const norm = normalizar(bruto);
  const periodo = periodoDocumento(documento);
  const fatos = [];

  for (const regra of TAXONOMIA) {
    const temKeyword = regra.keywords.some((keyword) => norm.includes(normalizar(keyword)));
    if (!temKeyword) {
      continue;
    }

    if (regra.quantidadeRegexes?.length) {
      for (const regex of regra.quantidadeRegexes) {
        regex.lastIndex = 0;
        let match;
        while ((match = regex.exec(bruto)) !== null) {
          const quantidade = primeiroNumeroMatch(match);
          if (!quantidade) {
            continue;
          }
          const trecho = trechoAoRedor(bruto, match.index);
          fatos.push(buildFato({
            documento,
            anexo,
            regra,
            quantidade,
            unidade: regra.unidade,
            descricao: `${regra.subtipo.replace(/_/g, ' ')}: ${quantidade} ${regra.unidade}`,
            trecho,
            origem,
            periodo,
            confianca: 0.86,
          }));
        }
      }
    } else {
      const idx = Math.max(0, regra.keywords.map((keyword) => norm.indexOf(normalizar(keyword))).find((i) => i >= 0) || 0);
      const trecho = trechoAoRedor(bruto, idx);
      fatos.push(buildFato({
        documento,
        anexo,
        regra,
        descricao: regra.subtipo.replace(/_/g, ' '),
        trecho,
        origem,
        periodo,
        confianca: 0.62,
      }));
    }
  }

  return dedupeFatos(fatos);
}

function extrairFatosProdutos({ documento, produtos = [] }) {
  return produtos.map((produto) => {
    const descricao = compactar(produto.descricao || produto.descricao_normalizada || 'Item licitado', 320);
    const valor = produto.valor_unitario_final ?? produto.valor_unitario_estimado ?? null;
    return buildFato({
      documento,
      regra: { tipo: 'compras', subtipo: 'preco_item' },
      descricao,
      quantidade: produto.quantidade ?? null,
      unidade: produto.unidade || null,
      valor,
      trecho: compactar(produto.trecho_fonte || descricao, 420),
      origem: `produto:${produto.id || produto.hash_item || descricao}`,
      periodo: periodoDocumento(documento),
      confianca: produto.confianca ?? 0.74,
      metadados: {
        produto_id: produto.id || null,
        item_numero: produto.item_numero || null,
        descricao_normalizada: produto.descricao_normalizada || null,
        valor_unitario_estimado: produto.valor_unitario_estimado ?? null,
        valor_unitario_final: produto.valor_unitario_final ?? null,
        valor_total_estimado: produto.valor_total_estimado ?? null,
        valor_total_final: produto.valor_total_final ?? null,
      },
    });
  });
}

function buildFato({
  documento,
  anexo = null,
  regra,
  descricao,
  quantidade = null,
  unidade = null,
  valor = null,
  trecho,
  origem,
  periodo,
  confianca,
  metadados = {},
}) {
  const base = {
    documento_id: documento.id,
    anexo_id: anexo?.id || null,
    tipo: regra.tipo,
    subtipo: regra.subtipo,
    descricao: compactar(descricao, 420),
    quantidade,
    unidade,
    valor,
    trecho_fonte: compactar(trecho, 700),
    confianca,
    origem,
    ...periodo,
    metadados: {
      ...metadados,
      documento_titulo: documento.titulo || null,
      anexo_nome: anexo?.nome || null,
    },
  };
  return {
    ...base,
    origem_hash: buildHash({
      documento_id: base.documento_id,
      anexo_id: base.anexo_id,
      tipo: base.tipo,
      subtipo: base.subtipo,
      quantidade: base.quantidade,
      unidade: base.unidade,
      valor: base.valor,
      trecho_fonte: base.trecho_fonte,
      origem: base.origem,
    }),
  };
}

function dedupeFatos(fatos) {
  const vistos = new Set();
  const out = [];
  for (const fato of fatos) {
    if (vistos.has(fato.origem_hash)) {
      continue;
    }
    vistos.add(fato.origem_hash);
    out.push(fato);
  }
  return out;
}

function resumirAnexoLocal({ anexo, fatos = [] }) {
  const texto = compactar(anexo.texto_completo || '', 900);
  const primeiraFrase = compactar(texto.split(/[.!?]\s+/).find((p) => p.length > 40) || texto, 360);
  const principaisFatos = fatos.slice(0, 6).map((fato) => ({
    tipo: fato.tipo,
    subtipo: fato.subtipo,
    descricao: fato.descricao,
    quantidade: fato.quantidade ?? null,
    unidade: fato.unidade || null,
  }));
  return {
    aviso: 'Resumo automático gerado a partir do texto extraído do anexo.',
    anexo: {
      nome: anexo.nome || null,
      tipo: anexo.tipo || null,
      status_extracao: anexo.status_extracao || null,
      paginas: anexo.paginas ?? null,
    },
    resumo_curto: primeiraFrase || 'Anexo sem texto suficiente para resumo automático.',
    pontos_relevantes: principaisFatos,
    lacunas: anexo.status_extracao === 'ok' && anexo.texto_completo
      ? []
      : ['Texto do anexo ainda não disponível ou extração pendente.'],
    confianca: anexo.status_extracao === 'ok' && anexo.texto_completo ? 0.72 : 0.35,
  };
}

module.exports = {
  TAXONOMIA,
  extrairFatosTexto,
  extrairFatosProdutos,
  resumirAnexoLocal,
  normalizar,
  buildFato,
  periodoDocumento,
};
