'use strict';

// Detector "sócio que é servidor": cruza o quadro societário (QSA da Receita)
// das empresas que receberam empenhos com a folha da Prefeitura. Puro.
//
// A Receita não informa o CPF do sócio, então o cruzamento é por nome. Para
// reduzir homônimos:
//  - nome com pelo menos 3 palavras;
//  - o nome não pode corresponder a mais de uma pessoa (CPF mascarado) na folha;
//  - a pessoa precisa estar na folha no mesmo ano em que a empresa recebeu.
// O resultado é indício para conferência interna (dados pessoais, LGPD), nunca
// publicação.

const MIN_PALAVRAS_NOME = 3;

function normalizarNome(nome) {
  return String(nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const nomeSuficiente = (nome) => nome.split(' ').length >= MIN_PALAVRAS_NOME;

// nome → { cpfs: Set, porAno: Map(ano → registro) }
function indexarFolha(servidores) {
  const porNome = new Map();
  for (const s of servidores) {
    const nome = normalizarNome(s.nome);
    const item = porNome.get(nome) || { cpfs: new Set(), porAno: new Map() };
    item.cpfs.add(s.cpf_mascarado || '');
    item.porAno.set(Number(s.ano), s);
    porNome.set(nome, item);
  }
  return porNome;
}

// cnpj → Map(ano → { valor, quantidade })
function indexarEmpenhos(empenhos) {
  const porCnpj = new Map();
  for (const e of empenhos) {
    const anos = porCnpj.get(e.credor_cnpj) || new Map();
    anos.set(Number(e.ano), { valor: Number(e.valor) || 0, quantidade: Number(e.quantidade) || 0 });
    porCnpj.set(e.credor_cnpj, anos);
  }
  return porCnpj;
}

function montarSinal(empresa, socio, { pessoa, anosEmpresa, nome }) {
  const anos = [...pessoa.porAno.keys()].filter((ano) => anosEmpresa.has(ano)).sort((a, b) => a - b);
  if (!anos.length) {
    return null;
  }
  const ultimo = pessoa.porAno.get(anos[anos.length - 1]);
  const soma = (campo) => anos.reduce((total, ano) => total + anosEmpresa.get(ano)[campo], 0);
  return {
    cnpj: empresa.cnpj,
    razao_social: empresa.razao_social,
    socio_nome: nome,
    qualificacao: socio.qualificacao || null,
    cargo: ultimo.cargo || null,
    secretaria: ultimo.secretaria || null,
    forma_admissao: ultimo.forma_admissao || null,
    anos,
    valor_empenhado: Math.round(soma('valor') * 100) / 100,
    empenhos: soma('quantidade'),
  };
}

function detectarSocioServidor({ empresas = [], servidores = [], empenhos = [] }) {
  const folha = indexarFolha(servidores);
  const empenhosPorCnpj = indexarEmpenhos(empenhos);
  const sinais = [];
  for (const empresa of empresas) {
    const anosEmpresa = empenhosPorCnpj.get(empresa.cnpj);
    if (!anosEmpresa) {
      continue;
    }
    for (const socio of empresa.qsa || []) {
      const nome = normalizarNome(socio.nome);
      const pessoa = nomeSuficiente(nome) ? folha.get(nome) : null;
      if (!pessoa || pessoa.cpfs.size !== 1) {
        continue;
      }
      const sinal = montarSinal(empresa, socio, { pessoa, anosEmpresa, nome });
      if (sinal) {
        sinais.push(sinal);
      }
    }
  }
  return sinais.sort((a, b) => b.valor_empenhado - a.valor_empenhado);
}

module.exports = { normalizarNome, detectarSocioServidor };
