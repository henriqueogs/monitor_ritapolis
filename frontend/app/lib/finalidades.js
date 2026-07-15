// Opções de filtro por finalidade do empenho.
// Fonte única para os dropdowns (empenhos, credores, empenhos do credor).
// Espelha as classes de src/transparencia/finalidade.js — manter em sincronia
// ao adicionar novas classes lá.
export const FINALIDADE_OPCOES = [
  { value: 'licitacao', label: 'Licitação' },
  { value: 'diaria_servidor', label: 'Diária' },
  { value: 'transferencia_entidade', label: 'Entidade' },
  { value: 'pessoal_encargos', label: 'Folha' },
  { value: 'auxilio_pf', label: 'Auxílio' },
  { value: 'distribuicao_gratuita', label: 'Distribuição gratuita' },
  { value: 'premiacao', label: 'Premiação' },
  { value: 'servico_pf', label: 'Serviço PF' },
  { value: 'servico_pj_sem_licitacao', label: 'Serviço PJ' },
  { value: 'investimento', label: 'Investimento' },
  { value: 'sentenca_judicial', label: 'Sentença judicial' },
  { value: 'indenizacao_restituicao', label: 'Indenização/Restituição' },
  { value: 'ordem_pagamento', label: 'Ordem de pagamento' },
  { value: 'outros', label: 'Outros' },
];
