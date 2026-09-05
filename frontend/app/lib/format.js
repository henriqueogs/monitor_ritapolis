export const fonteLabels = {
  site_prefeitura: 'Prefeitura',
  camara: 'C\u00e2mara'
};

export const tipoLabels = {
  edital: 'Licita\u00e7\u00e3o/Edital',
  publicacao_extrato: 'Publica\u00e7\u00e3o de Extrato',
  documento_publico: 'Documento P\u00fablico',
  resolucao: 'Resolu\u00e7\u00e3o',
  lei: 'Lei',
  portaria: 'Portaria',
  contrato: 'Contrato',
  decreto: 'Decreto',
  documento: 'Documento',
  // Legislacao municipal (coletor de decretos/leis/portarias)
  lei_ordinaria: 'Lei Ordin\u00e1ria',
  lei_complementar: 'Lei Complementar',
  lei_organica: 'Lei Org\u00e2nica',
  instrucao_normativa: 'Instru\u00e7\u00e3o Normativa',
  ata: 'Ata',
  ata_comissao: 'Ata de Comiss\u00e3o',
  regimento_interno: 'Regimento Interno',
  estatuto: 'Estatuto',
  projeto_lei: 'Projeto de Lei',
  projeto_lei_complementar: 'Projeto de Lei Complementar',
  deliberacao: 'Delibera\u00e7\u00e3o',
  decreto_legislativo: 'Decreto Legislativo',
  portaria_legislativo: 'Portaria do Legislativo',
  oficio: 'Of\u00edcio'
};

export const statusLabels = {
  ok: 'Coletado com sucesso',
  erro_pdf: 'Arquivo com falha',
  sem_pdf: 'Sem arquivo',
  erro_total: 'Falha na coleta',
  erro_parcial: 'Coleta parcial',
  em_andamento: 'Coleta em andamento',
  aberta: 'Aberta',
  homologada: 'Homologada',
  deserta: 'Deserta',
  suspensa: 'Suspensa',
  revisar: 'Revisar',
  parcial: 'Parcial',
  indisponivel: 'Indisponível',
  processando: 'Processando'
};

export function labelFonte(value) {
  return fonteLabels[value] || value || 'Fonte nao informada';
}

export function labelTipo(value) {
  return tipoLabels[value] || value || 'Documento';
}

export function labelStatus(value) {
  return statusLabels[value] || value || 'Sem status';
}

export function formatDate(value, fallback = 'Nao informada') {
  if (!value) return fallback;
  try {
    return new Intl.DateTimeFormat('pt-BR').format(new Date(value));
  } catch {
    return value;
  }
}

export function formatMoney(value, fallback = 'Nao informado') {
  if (value == null || value === '') return fallback;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(value));
}

export function formatMoneyCompact(value) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return '—';
  if (n >= 1e9) return `R$ ${(n / 1e9).toFixed(1).replace('.', ',')}B`;
  if (n >= 1e6) return `R$ ${(n / 1e6).toFixed(1).replace('.', ',')}M`;
  if (n >= 1e3) return `R$ ${(n / 1e3).toFixed(0)}k`;
  return formatMoney(n);
}

export function bestResumo(documento) {
  return (
    documento?.resumo_ai?.dados?.resumo_cidadao ||
    documento?.licitacao_modelo?.objeto ||
    documento?.dados_extras?.campos?.Objeto ||
    documento?.resumo ||
    documento?.dados_extras?.licitacao?.objeto ||
    'Resumo ainda nao disponivel. Use a fonte oficial para conferir o conteudo completo.'
  );
}

export function cleanDocumentTitle(documento) {
  if (!documento) return '';

  // 1. Prioriza o título curto gerado por IA
  if (documento.resumo_ai?.dados?.titulo_curto) {
    return documento.resumo_ai.dados.titulo_curto;
  }
  if (documento.titulo_curto) {
    return documento.titulo_curto;
  }

  const rawTitle = documento.titulo || '';
  
  // Trata separadores padronizados (hífen, meia-risca, travessão)
  const titleParts = rawTitle.split(/\s+[-–—]\s+/);

  if (titleParts.length > 1) {
    const shortParts = [];
    let longDescription = '';

    for (let i = 0; i < titleParts.length; i++) {
      const part = titleParts[i].trim();
      
      // Heurística: se a parte for longa (> 100 caracteres) ou contiver verbos/termos de objeto,
      // nós a tratamos como parte da descrição detalhada (objeto) do documento, não como o título curto.
      const isDescription = part.length > 100 || 
        (part.length > 50 && /torna público|objeto:|contratada:|aquisição de|prestação de|fornecimento de/i.test(part));

      if (isDescription) {
        if (!longDescription) {
          longDescription = part;
        }
      } else {
        shortParts.push(part);
      }
    }

    if (shortParts.length > 0) {
      let title = shortParts.join(' - ');
      
      // Se a parte identificadora ficou muito curta (ex: "Processo 0039/2026") e temos uma descrição longa,
      // anexamos o início da descrição limpo para dar contexto
      if (title.length < 25 && longDescription) {
        const cleanDesc = longDescription
          .replace(/^PREFEITURA MUNICIPAL DE RITÁPOLIS,\s*(?:torna público\s*(?:a\s*)?)?/i, '')
          .replace(/^(?:objeto:)\s*/i, '');
        const truncatedDesc = cleanDesc.length > 70 ? `${cleanDesc.slice(0, 70).trim()}...` : cleanDesc;
        title = `${title} - ${truncatedDesc}`;
      }
      return title;
    }
  }

  // Fallback: limpa prefixos do título inteiro e trunca se for gigante
  const cleanTitle = rawTitle
    .replace(/^PREFEITURA MUNICIPAL DE RITÁPOLIS,\s*(?:torna público\s*(?:a\s*)?)?/i, '')
    .replace(/^(?:objeto:)\s*/i, '');

  if (cleanTitle.length > 100) {
    return `${cleanTitle.slice(0, 100).trim()}...`;
  }
  return cleanTitle;
}

// Usado na página de detalhe e em listas com espaço pra duas linhas (ex.:
// DocumentPreview na home). Cards mais compactos continuam com
// cleanDocumentTitle, uma linha só.
// Regra: o assunto de verdade (objeto) é sempre o ÚLTIMO segmento do título
// ("Ratificação do Processo X – Adesão Y – Objeto..."); o resto é a
// referência administrativa, que vira o subtítulo. O título curto de IA
// nem sempre já vem limpo desse prefixo (a IA às vezes repete a mesma
// estrutura do título bruto) — por isso aplica a mesma divisão nele
// também, em vez de usá-lo direto.
export function splitDocumentTitle(documento) {
  if (!documento) return { titulo: '', subtitulo: null };

  const fonte = (
    documento.resumo_ai?.dados?.titulo_curto || documento.titulo_curto || documento.titulo || ''
  ).trim();
  const partes = fonte.split(/\s+[-–—]\s+/).map((p) => p.trim()).filter(Boolean);

  if (partes.length > 1) {
    return { titulo: partes[partes.length - 1], subtitulo: partes.slice(0, -1).join(' – ') };
  }
  return { titulo: fonte, subtitulo: null };
}

export function cleanDocumentSummary(documento, maxLength = 180) {
  let resumo = bestResumo(documento);
  
  if (!resumo) return '';

  if (resumo.startsWith('Resumo ainda nao disponivel')) {
    return resumo;
  }

  const title = cleanDocumentTitle(documento);
  
  // Evita que o resumo comece exatamente igual ao título limpo
  if (title && resumo.startsWith(title)) {
    resumo = resumo.slice(title.length).replace(/^\s*[-–—]\s*/, '').trim();
  }

  // Remove cabeçalhos repetitivos
  resumo = resumo
    .replace(/^PREFEITURA MUNICIPAL DE RITÁPOLIS,\s*(?:torna público\s*(?:a\s*)?)?/i, '')
    .replace(/^torna pública a\s+/i, '')
    .replace(/^(?:objeto:)\s*/i, '')
    .trim();

  if (resumo.length > 0) {
    resumo = resumo.charAt(0).toUpperCase() + resumo.slice(1);
  }

  if (resumo.length <= maxLength) return resumo;
  return `${resumo.slice(0, maxLength - 1).trim()}...`;
}
