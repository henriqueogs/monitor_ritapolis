'use strict';

// Classificação determinística de licitações por categoria temática, a partir de
// título + objeto + descrições de produtos. Score = soma dos pesos das regras
// cujos termos aparecem no texto. Empate resolvido pela ordem (mais específica
// vence). Sem match → "Outros".

function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const REGRAS = {
  Alimentação: [
    { peso: 3, termos: ['genero alimenticio', 'generos alimenticios', 'merenda escolar', 'merenda', 'chamada publica', 'pnae', 'fnde', 'rancho', 'alimentos para merenda'] },
    { peso: 2, termos: ['alimento', 'alimentar', 'alimentacao', 'refeicao', 'buffet', 'mantimento', 'hortifruti', 'hortifrutigranjeiro', 'generos'] },
    { peso: 1, termos: ['leite', 'arroz', 'feijao', 'carne', 'frango', 'pao', 'suco', 'cafe', 'oleo', 'vinagre', 'acucar', 'achocolatado', 'fruta', 'legume', 'verdura', 'hortali', 'agua mineral', 'biscoito', 'macarrao', 'farinha'] },
  ],

  Saúde: [
    { peso: 3, termos: ['vacina', 'medicamento', 'farmacia', 'cisru', 'cigedas', 'consorcio intermunicipal de saude', 'consorcio intermunicipal de gestao', 'laboratorial', 'hospital', 'ubs', 'psf', 'caps', 'samu', 'ambulancia'] },
    { peso: 2, termos: ['saude', 'veterinario', 'odontolo', 'fisioterapia', 'tratamento', 'clinica', 'medic', 'enfermagem', 'cirurgi', 'internacao', 'leito'] },
    { peso: 1, termos: ['epi', 'mascara', 'luva', 'antiseptico', 'curativo', 'glicossimetro', 'tira de glico', 'dose de vaci', 'imunizacao', 'saneamento basico'] },
  ],

  Educação: [
    { peso: 3, termos: ['escola municipal', 'escola estadual', 'creche municipal', 'material didatico', 'livro didatico', 'bolsa familia', 'transporte escolar', 'uniforme escolar', 'fardamento escolar', 'aluno', 'estudante', 'pedagogico'] },
    { peso: 2, termos: ['educacao', 'escola', 'escolar', 'ensino', 'creche', 'aprendizagem', 'docente', 'professor', 'biblioteca'] },
    { peso: 1, termos: ['educacional', 'sala de aula', 'quadra esportiva escolar', 'curso', 'capacitacao', 'treinamento', 'formacao'] },
  ],

  'Cultura e Eventos': [
    { peso: 3, termos: ['banda', 'cantor', 'cantora', 'dupla sertaneja', 'show', 'espetaculo', 'cia de rodeio', 'rodeio', 'entretenimento', 'apresentacao musical', 'apresentacao artistica', 'atracao musical', 'artista'] },
    { peso: 2, termos: ['evento', 'festa', 'festividade', 'festejo', 'festival', 'carnaval', 'exposicao agropecuaria', 'exposicao', 'comemoracao', 'aniversario da cidade', 'reveillon', 'natalino', 'cultural'] },
    { peso: 1, termos: ['palco', 'sonorizacao', 'som', 'iluminacao de palco', 'fogos', 'fogos de artificio', 'dj', 'forro', 'musical', 'banda musical', 'trio eletrico', 'parque de diversoes'] },
  ],

  'Obras e Infraestrutura': [
    { peso: 3, termos: ['construcao', 'pavimentacao', 'asfalto', 'obra de', 'obras de', 'recapeamento', 'calcamento', 'drenagem', 'esgotamento sanitario', 'rede de esgoto', 'rede de agua', 'rede eletrica', 'extensao de rede', 'instalacao de caixa d', 'instalacao de rede'] },
    { peso: 2, termos: ['reforma', 'ampliacao', 'adequacao', 'revitalizacao', 'requalificacao', 'manutencao predial', 'manutencao de predios', 'demolicao', 'remocao de', 'iluminacao publica', 'infraestrutura'] },
    { peso: 1, termos: ['pintura', 'telhado', 'cobertura', 'calcada', 'passeio', 'praca', 'parque', 'estadio', 'campo de futebol', 'quadra', 'ponte', 'bueiro', 'muro', 'muro de arrimo', 'estrada', 'via', 'piso', 'revestimento', 'instalacao eletrica', 'instalacao hidraulica'] },
  ],

  Serviços: [
    { peso: 3, termos: ['servicos contabeis', 'servico contabil', 'servicos bancarios', 'servico bancario', 'servicos juridicos', 'servico juridico', 'vigilancia patrimonial', 'vigilancia armada', 'limpeza publica', 'limpeza urbana', 'coleta de lixo', 'coleta de residuos', 'manutencao de veiculos', 'manutencao de frota', 'manutencao preventiva', 'seguro de veiculo', 'credenciamento', 'instituicao financeira'] },
    { peso: 2, termos: ['prestacao de servico', 'prestacao de servicos', 'servicos de', 'limpeza', 'higienizacao', 'zeladoria', 'transporte', 'seguro', 'locacao', 'cessao de uso', 'consultoria', 'assessoria', 'contabilidade', 'auditoria', 'arbitragem', 'oficineiro'] },
    { peso: 1, termos: ['reprografia', 'impressao', 'vigilancia', 'portaria', 'recepcao', 'catering', 'estacionamento', 'tenda', 'estrutura para evento'] },
  ],

  'Equipamentos e Materiais': [
    { peso: 3, termos: ['veiculo 0 km', 'onibus escolar', 'caminhao', 'trator', 'ambulancia', 'notebook', 'computador', 'servidor', 'switch', 'nobreak', 'impressora', 'scanner', 'projetor', 'tablet', 'equipamento hospitalar', 'equipamento odontologico', 'equipamento agricola'] },
    { peso: 2, termos: ['veiculo', 'veiculo tipo', 'aquisicao de', 'compra de', 'mobiliario', 'mobilia', 'ar condicionado', 'geladeira', 'freezer', 'camera', 'televisao', 'monitor', 'retroprojetor', 'material de escritorio', 'material de limpeza', 'material eletrico', 'ferramenta'] },
    { peso: 1, termos: ['uniforme', 'fardamento', 'epi', 'calcado', 'bone', 'vestimentas', 'equipamento', 'maquina', 'aparelho', 'instrumento', 'kit', 'conjunto', 'cadeira', 'mesa', 'armario', 'estante', 'bebedouro', 'ventilador', 'fogao', 'microondas', 'letreiro', 'tecido'] },
  ],
};

// Ordem = prioridade no desempate (mais específica primeiro).
const CATEGORIAS_ORDEM = [
  'Alimentação',
  'Saúde',
  'Educação',
  'Cultura e Eventos',
  'Obras e Infraestrutura',
  'Serviços',
  'Equipamentos e Materiais',
];

const CATEGORIAS = [...CATEGORIAS_ORDEM, 'Outros'];

function contem(texto, termos) {
  return termos.filter((t) => texto.includes(t));
}

function classificarCategoria({ titulo = '', objeto = '', produtos = [] } = {}) {
  const base = normalizar(`${titulo} ${objeto}`);
  const produtosTexto = normalizar((produtos || []).join(' '));
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
    return { categoria: 'Outros', subcategoria: null, confianca: 0.1, keywords_matched: [], scores };
  }

  const vencedora = CATEGORIAS_ORDEM.find((c) => scores[c] === maxScore);
  const totalPossivel = REGRAS[vencedora].reduce((s, r) => s + r.peso, 0);
  const confianca = Math.min(maxScore / totalPossivel, 1);

  return {
    categoria: vencedora,
    subcategoria: null,
    confianca: Math.round(confianca * 100) / 100,
    keywords_matched: [...new Set(matched[vencedora])].slice(0, 8),
    scores,
  };
}

module.exports = {
  classificarCategoria,
  CATEGORIAS,
  CATEGORIAS_ORDEM,
  REGRAS,
};
