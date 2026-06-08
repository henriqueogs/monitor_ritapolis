const { DatabaseSync } = require('node:sqlite');
const { salvarCategoria, getCategoriasStats } = require('../src/db');

// ── Normalização ────────────────────────────────────────────────────────────

function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function contem(texto, termos) {
  return termos.filter((t) => texto.includes(t));
}

// ── Regras de categoria ─────────────────────────────────────────────────────
// Cada regra: { peso, termos[] }
// Score = soma dos pesos das regras que fazem match (ao menos 1 termo da lista)

const REGRAS = {
  Alimentação: [
    { peso: 3, termos: ['genero alimenticio', 'generos alimenticios', 'merenda escolar', 'merenda', 'chamada publica', 'pnae', 'fnde', 'rancho', 'alimentos para merenda'] },
    { peso: 2, termos: ['alimento', 'alimentar', 'alimentacao', 'refeicao', 'buffet', 'mantimento', 'hortifruti', 'hortifrutigranjeiro', 'generos'] },
    { peso: 1, termos: ['leite', 'arroz', 'feijao', 'carne', 'frango', 'pao', 'suco', 'cafe', 'oleo', 'vinagre', 'acucar', 'achocolatado', 'fruta', 'legume', 'verdura', 'hortali', 'agua mineral', 'biscoito', 'macarrao', 'farinha'] }
  ],

  Saúde: [
    { peso: 3, termos: ['vacina', 'medicamento', 'farmacia', 'cisru', 'cigedas', 'consorcio intermunicipal de saude', 'consorcio intermunicipal de gestao', 'laboratorial', 'hospital', 'ubs', 'psf', 'caps', 'samu', 'ambulancia'] },
    { peso: 2, termos: ['saude', 'veterinario', 'odontolo', 'fisioterapia', 'tratamento', 'clinica', 'medic', 'enfermagem', 'cirurgi', 'internacao', 'leito'] },
    { peso: 1, termos: ['epi', 'mascara', 'luva', 'antiseptico', 'curativo', 'glicossimetro', 'tira de glico', 'dose de vaci', 'imunizacao', 'saneamento basico'] }
  ],

  Educação: [
    { peso: 3, termos: ['escola municipal', 'escola estadual', 'creche municipal', 'material didatico', 'livro didatico', 'bolsa familia', 'transporte escolar', 'uniforme escolar', 'fardamento escolar', 'aluno', 'estudante', 'pedagogico'] },
    { peso: 2, termos: ['educacao', 'escola', 'escolar', 'ensino', 'creche', 'aprendizagem', 'docente', 'professor', 'biblioteca'] },
    { peso: 1, termos: ['educacional', 'sala de aula', 'quadra esportiva escolar', 'curso', 'capacitacao', 'treinamento', 'formacao'] }
  ],

  'Obras e Infraestrutura': [
    { peso: 3, termos: ['construcao', 'pavimentacao', 'asfalto', 'obra de', 'obras de', 'recapeamento', 'calçamento', 'calcamento', 'drenagem', 'esgotamento sanitario', 'rede de esgoto', 'rede de agua', 'rede eletrica', 'extensao de rede', 'instalacao de caixa d', 'instalacao de rede'] },
    { peso: 2, termos: ['reforma', 'ampliacao', 'adequacao', 'revitalizacao', 'requalificacao', 'manutencao predial', 'manutencao de predios', 'demolição', 'demolicao', 'remoçao de', 'iluminacao publica', 'infraestrutura'] },
    { peso: 1, termos: ['pintura', 'telhado', 'cobertura', 'calcada', 'passeio', 'praca', 'parque', 'estadio', 'campo de futebol', 'quadra', 'ponte', 'bueiro', 'muro', 'muro de arrimo', 'estrada', 'via', 'piso', 'revestimento', 'instalacao eletrica', 'instalacao hidraulica'] }
  ],

  Serviços: [
    { peso: 3, termos: ['servicos contabeis', 'servico contabil', 'servicos bancarios', 'servico bancario', 'servicos juridicos', 'servico juridico', 'vigilancia patrimonial', 'vigilancia armada', 'limpeza publica', 'limpeza urbana', 'coleta de lixo', 'coleta de residuos', 'manutencao de veiculos', 'manutencao de frota', 'manutencao preventiva', 'seguro de veiculo'] },
    { peso: 2, termos: ['prestacao de servico', 'prestacao de servicos', 'servicos de', 'limpeza', 'higienizacao', 'zeladoria', 'transporte', 'seguro', 'locacao', 'cessao de uso', 'consultoria', 'assessoria', 'contabilidade', 'auditoria'] },
    { peso: 1, termos: ['evento', 'show', 'espetaculo', 'sonorizacao', 'fogos', 'fogos de artificio', 'estrutura para evento', 'tenda', 'palco', 'reprografia', 'impressao', 'vigilancia', 'portaria', 'recepcao', 'buffet', 'catering', 'estacionamento'] }
  ],

  'Equipamentos e Materiais': [
    { peso: 3, termos: ['veiculo 0 km', 'onibus escolar', 'caminhao', 'trator', 'ambulancia', 'notebook', 'computador', 'servidor', 'switch', 'nobreak', 'impressora', 'scanner', 'projetor', 'tablet', 'equipamento hospitalar', 'equipamento odontologico', 'equipamento agricola'] },
    { peso: 2, termos: ['veiculo', 'veiculo tipo', 'aquisicao de', 'compra de', 'mobiliario', 'mobilia', 'ar condicionado', 'geladeira', 'freezer', 'camera', 'televisao', 'monitor', 'retroprojetor', 'material de escritorio', 'material de limpeza', 'material eletrico', 'ferramenta'] },
    { peso: 1, termos: ['uniforme', 'fardamento', 'epi', 'calcado', 'bone', 'vestimentas', 'equipamento', 'maquina', 'aparelho', 'instrumento', 'kit', 'conjunto', 'cadeira', 'mesa', 'armario', 'estante', 'bebedouro', 'ventilador', 'fogao', 'microondas'] }
  ]
};

const CATEGORIAS_ORDEM = ['Alimentação', 'Saúde', 'Educação', 'Obras e Infraestrutura', 'Serviços', 'Equipamentos e Materiais'];

// ── Motor de classificação ───────────────────────────────────────────────────

function classificar(titulo, objeto, produtos) {
  const base = normalizar(`${titulo} ${objeto}`);
  const produtosTexto = normalizar(produtos.join(' '));
  const textoCompleto = `${base} ${produtosTexto}`.replace(/\s+/g, ' ').trim();

  const scores = {};
  const matched = {};

  for (const categoria of CATEGORIAS_ORDEM) {
    let score = 0;
    matched[categoria] = [];

    for (const regra of REGRAS[categoria]) {
      const hits = contem(textoCompleto, regra.termos.map(normalizar));
      if (hits.length > 0) {
        score += regra.peso;
        matched[categoria].push(...hits);
      }
    }

    scores[categoria] = score;
  }

  const maxScore = Math.max(...Object.values(scores));

  if (maxScore === 0) {
    return { categoria: 'Outros', subcategoria: null, confianca: 0.1, keywords_matched: [] };
  }

  // Em caso de empate, a ordem de CATEGORIAS_ORDEM decide (mais específica vence)
  const vencedora = CATEGORIAS_ORDEM.find((c) => scores[c] === maxScore);
  const totalPossivel = REGRAS[vencedora].reduce((s, r) => s + r.peso, 0);
  const confianca = Math.min(maxScore / totalPossivel, 1);

  return {
    categoria: vencedora,
    subcategoria: null,
    confianca: Math.round(confianca * 100) / 100,
    keywords_matched: [...new Set(matched[vencedora])].slice(0, 8),
    scores
  };
}

// ── Script principal ─────────────────────────────────────────────────────────

function readFlag(name, fallback = null) {
  const prefix = `--${name}=`;
  const arg = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function main() {
  const config = require('../src/config');
  const db = new DatabaseSync(config.dbPath);

  const ano = readFlag('ano');
  const forcar = process.argv.includes('--forcar');
  const verbose = process.argv.includes('--verbose');

  const filtros = ["d.tipo IN ('edital', 'publicacao_extrato')"];
  const params = [];

  if (ano) {
    filtros.push('d.ano = ?');
    params.push(Number(ano));
  }

  if (!forcar) {
    filtros.push('NOT EXISTS (SELECT 1 FROM licitacoes_categorias lc WHERE lc.documento_id = d.id)');
  }

  const documentos = db.prepare(`
    SELECT
      d.id, d.titulo, d.ano, d.tipo,
      GROUP_CONCAT(DISTINCT p.descricao) AS produtos_texto,
      r.resumo_json
    FROM documentos d
    LEFT JOIN licitacoes_produtos p ON p.documento_id = d.id
    LEFT JOIN documentos_resumos_ai r ON r.documento_id = d.id AND r.status = 'ok' AND r.provider <> 'mock'
      AND r.id = (SELECT id FROM documentos_resumos_ai WHERE documento_id = d.id AND status = 'ok' AND provider <> 'mock' ORDER BY id DESC LIMIT 1)
    WHERE ${filtros.join(' AND ')}
    GROUP BY d.id
    ORDER BY d.ano DESC, d.id DESC
  `).all(...params);

  console.log(`Classificando ${documentos.length} licitação${documentos.length !== 1 ? 'ões' : ''}${ano ? ` de ${ano}` : ''}${forcar ? ' (forçando reclassificação)' : ''}...`);
  console.log('');

  const contadores = {};
  let processados = 0;

  for (const doc of documentos) {
    let objeto = '';
    try {
      const resumo = doc.resumo_json ? JSON.parse(doc.resumo_json) : null;
      objeto = resumo?.objeto || (typeof resumo?.licitacao === 'object' ? resumo.licitacao?.objeto : '') || '';
    } catch {}

    const produtos = doc.produtos_texto ? doc.produtos_texto.split(',').filter(Boolean) : [];
    const resultado = classificar(doc.titulo, objeto, produtos);

    salvarCategoria({
      documento_id: doc.id,
      categoria: resultado.categoria,
      subcategoria: resultado.subcategoria,
      confianca: resultado.confianca,
      origem: 'keyword',
      keywords_matched: resultado.keywords_matched
    });

    contadores[resultado.categoria] = (contadores[resultado.categoria] || 0) + 1;
    processados++;

    if (verbose) {
      console.log(
        `[${resultado.confianca.toFixed(2)}] ${resultado.categoria.padEnd(28)} | ${doc.ano} | ${doc.titulo.slice(0, 60)}`
      );
      if (resultado.keywords_matched?.length) {
        console.log(`       keywords: ${resultado.keywords_matched.join(', ')}`);
      }
    }
  }

  console.log(`Classificados: ${processados}`);
  console.log('');

  const stats = getCategoriasStats();
  console.log('── Distribuição por categoria (acumulado) ───────────────');
  const maxTotal = Math.max(...stats.por_categoria.map((c) => c.total));
  for (const c of stats.por_categoria) {
    const bar = '█'.repeat(Math.round((c.total / maxTotal) * 20)).padEnd(20, '░');
    console.log(
      `${c.categoria.padEnd(28)} ${bar} ${String(c.total).padStart(4)} (conf.média ${c.confianca_media.toFixed(2)})`
    );
  }
  console.log('');
  console.log(`Total classificados: ${stats.total_classificados} / ${stats.total_editais}`);
  if (stats.pendentes > 0) {
    console.log(`Pendentes: ${stats.pendentes} — rode sem filtros para classificar todos`);
  }
}

main();
