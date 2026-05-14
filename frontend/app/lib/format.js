export const fonteLabels = {
  site_prefeitura: 'Prefeitura',
  camara: 'C\u00e2mara'
};

export const tipoLabels = {
  edital: 'Licita\u00e7\u00e3o/Edital',
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

export function bestResumo(documento) {
  return (
    documento?.resumo_ai?.dados?.resumo_cidadao ||
    documento?.resumo ||
    documento?.dados_extras?.licitacao?.objeto ||
    'Resumo ainda nao disponivel. Use a fonte oficial para conferir o conteudo completo.'
  );
}
