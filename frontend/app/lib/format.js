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
  documento: 'Documento'
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
  revisar: 'Revisar'
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
