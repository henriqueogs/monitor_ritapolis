'use strict';

const {
  extractJsonText,
  parseSummaryResponse,
  normalizeEnumValue,
  normalizeDateValue,
  normalizeOptionalText,
  normalizeSummaryBeforeValidation,
  validateSummary,
} = require('./validate-summary');

// ── extractJsonText ──────────────────────────────────────────────────────────

describe('extractJsonText', () => {
  it('extrai JSON de bloco markdown ```json...```', () => {
    const raw = '```json\n{"ok": true}\n```';
    expect(extractJsonText(raw)).toBe('{"ok": true}');
  });

  it('extrai JSON de bloco markdown sem label ```...```', () => {
    const raw = '```\n{"ok": true}\n```';
    expect(extractJsonText(raw)).toBe('{"ok": true}');
  });

  it('extrai JSON bruto sem markdown (primeiro { até último })', () => {
    const raw = 'Aqui está o resultado: {"objeto": "compra"}. Pronto.';
    expect(extractJsonText(raw)).toBe('{"objeto": "compra"}');
  });

  it('retorna conteúdo como está quando não há {} nem markdown', () => {
    const raw = 'texto puro sem json';
    expect(extractJsonText(raw)).toBe('texto puro sem json');
  });

  it('lança erro em resposta vazia', () => {
    expect(() => extractJsonText('')).toThrow('Resposta vazia');
    expect(() => extractJsonText(null)).toThrow('Resposta vazia');
  });

  it('ignora texto antes e depois do JSON', () => {
    const raw = 'prefixo irrelevante {"resumo": "ok"} sufixo extra';
    expect(extractJsonText(raw)).toBe('{"resumo": "ok"}');
  });
});

// ── parseSummaryResponse ─────────────────────────────────────────────────────

describe('parseSummaryResponse', () => {
  it('parseia JSON válido embutido em markdown', () => {
    const raw = '```json\n{"tipo_documento": "edital"}\n```';
    expect(parseSummaryResponse(raw)).toEqual({ tipo_documento: 'edital' });
  });

  it('lança erro em JSON inválido', () => {
    expect(() => parseSummaryResponse('{"campo": broken}')).toThrow('JSON valido');
  });

  it('lança erro em resposta vazia', () => {
    expect(() => parseSummaryResponse('')).toThrow('Resposta vazia');
  });
});

// ── normalizeEnumValue ───────────────────────────────────────────────────────

describe('normalizeEnumValue', () => {
  const tipos = ['edital', 'decreto', 'portaria', 'lei', 'contrato', 'despesa', 'ata', 'outro'];
  const papeis = ['contratante', 'contratado', 'autoridade', 'fornecedor', 'orgao_publico', 'outro'];

  // Nota: a inferência por padrão de texto só funciona quando o array passado é
  // a referência interna enumValues.tipo_documento / enumValues.papel.
  // Para testar inferências, usamos normalizeSummaryBeforeValidation.

  describe('com array externo (só exact match)', () => {
    it('retorna valor exato quando já está na lista', () => {
      expect(normalizeEnumValue('edital', tipos)).toBe('edital');
      expect(normalizeEnumValue('decreto', tipos)).toBe('decreto');
    });

    it('normaliza acentos e maiúsculas para match exato', () => {
      expect(normalizeEnumValue('Edital', tipos)).toBe('edital');
      expect(normalizeEnumValue('DECRETO', tipos)).toBe('decreto');
    });

    it('retorna "outro" como fallback para valores desconhecidos', () => {
      expect(normalizeEnumValue('xyzdesconhecido', tipos)).toBe('outro');
    });

    it('retorna fallback para null e string vazia', () => {
      expect(normalizeEnumValue(null, tipos)).toBe('outro');
      expect(normalizeEnumValue('', tipos)).toBe('outro');
    });
  });
});

// ── normalizeDateValue ───────────────────────────────────────────────────────

describe('normalizeDateValue', () => {
  it('converte formato BR DD/MM/AAAA para ISO AAAA-MM-DD', () => {
    expect(normalizeDateValue('15/03/2024')).toBe('2024-03-15');
  });

  it('mantém formato ISO quando já correto', () => {
    expect(normalizeDateValue('2024-03-15')).toBe('2024-03-15');
  });

  it('aceita separador traço no formato BR', () => {
    expect(normalizeDateValue('15-03-2024')).toBe('2024-03-15');
  });

  it('retorna null para valores vazios ou nulos', () => {
    expect(normalizeDateValue(null)).toBeNull();
    expect(normalizeDateValue('')).toBeNull();
    expect(normalizeDateValue('N/A')).toBeNull();
    expect(normalizeDateValue('não informado')).toBeNull();
  });

  it('preserva texto livre quando não reconhece formato', () => {
    expect(normalizeDateValue('março de 2024')).toBe('março de 2024');
  });
});

// ── normalizeOptionalText ────────────────────────────────────────────────────

describe('normalizeOptionalText', () => {
  it('retorna texto limpo sem espaços extras', () => {
    expect(normalizeOptionalText('  texto  ')).toBe('texto');
  });

  it('retorna null para string vazia', () => {
    expect(normalizeOptionalText('')).toBeNull();
    expect(normalizeOptionalText('   ')).toBeNull();
  });

  it('retorna null para null explícito', () => {
    expect(normalizeOptionalText(null)).toBeNull();
  });

  it('remove caracteres de controle invisíveis (zero-width)', () => {
    expect(normalizeOptionalText('​texto‍')).toBe('texto');
  });
});

// ── normalizeSummaryBeforeValidation ─────────────────────────────────────────

describe('normalizeSummaryBeforeValidation', () => {
  const summaryBase = {
    tipo_documento: 'edital',
    titulo_curto: 'Pregão 001/2024',
    resumo_cidadao: 'Compra de material de escritório',
    resumo_tecnico: 'Pregão presencial para aquisição de material',
    objeto: { descricao: 'Material de escritório', trecho_fonte: 'objeto: material de escritório' },
    pontos_principais: ['item a', 'item b'],
    datas_relevantes: [],
    valores: [],
    partes_envolvidas: [],
    itens_licitados: [],
    riscos_ou_alertas: [],
    campos_nao_encontrados: [],
    confianca: 0.9,
  };

  it('normaliza tipo_documento: "pregão" → "edital"', () => {
    const r = normalizeSummaryBeforeValidation({ ...summaryBase, tipo_documento: 'pregão' });
    expect(r.tipo_documento).toBe('edital');
  });

  it('normaliza tipo_documento: "termo_aditivo" → "contrato"', () => {
    const r = normalizeSummaryBeforeValidation({ ...summaryBase, tipo_documento: 'termo_aditivo' });
    expect(r.tipo_documento).toBe('contrato');
  });

  it('normaliza tipo_documento: "dispensa de licitação" → "edital"', () => {
    const r = normalizeSummaryBeforeValidation({ ...summaryBase, tipo_documento: 'dispensa de licitação' });
    expect(r.tipo_documento).toBe('edital');
  });

  it('normaliza partes_envolvidas papel "Prefeitura Municipal" → "contratante"', () => {
    const r = normalizeSummaryBeforeValidation({
      ...summaryBase,
      partes_envolvidas: [
        { nome: 'Prefeitura Municipal de Ritápolis', papel: 'Prefeitura Municipal', trecho_fonte: 'contratante' },
      ],
    });
    expect(r.partes_envolvidas[0].papel).toBe('contratante');
  });

  it('normaliza partes_envolvidas papel "empresa vencedora" → "contratado"', () => {
    const r = normalizeSummaryBeforeValidation({
      ...summaryBase,
      partes_envolvidas: [
        { nome: 'ACME Ltda', papel: 'empresa vencedora', trecho_fonte: 'contratado' },
      ],
    });
    expect(r.partes_envolvidas[0].papel).toBe('contratado');
  });

  it('converte confiança numérica e clipa em [0,1]', () => {
    expect(normalizeSummaryBeforeValidation({ ...summaryBase, confianca: 1.5 }).confianca).toBe(1);
    expect(normalizeSummaryBeforeValidation({ ...summaryBase, confianca: -0.1 }).confianca).toBe(0);
  });

  it('usa fallback de confiança (0.35) quando campos principais estão vazios', () => {
    const r = normalizeSummaryBeforeValidation({
      ...summaryBase,
      titulo_curto: '',
      resumo_cidadao: '',
      resumo_tecnico: '',
      confianca: 0.9,
    });
    expect(r.confianca).toBeLessThanOrEqual(0.35);
  });

  it('filtra partes_envolvidas sem trecho_fonte ou nome', () => {
    const r = normalizeSummaryBeforeValidation({
      ...summaryBase,
      partes_envolvidas: [
        { nome: 'Empresa X', papel: 'contratado', trecho_fonte: 'texto real' },
        { nome: '', papel: 'contratante', trecho_fonte: 'outro trecho' },
        { nome: 'Y', papel: 'autoridade', trecho_fonte: '' },
      ],
    });
    expect(r.partes_envolvidas).toHaveLength(1);
    expect(r.partes_envolvidas[0].nome).toBe('Empresa X');
  });

  it('filtra valores sem trecho_fonte ou descricao', () => {
    const r = normalizeSummaryBeforeValidation({
      ...summaryBase,
      valores: [
        { tipo: 'estimado', valor: 1000, descricao: 'valor estimado', moeda: 'BRL', trecho_fonte: 'R$ 1.000,00' },
        { tipo: 'final', valor: 900, descricao: '', moeda: 'BRL', trecho_fonte: 'R$ 900,00' },
        { tipo: 'global', valor: 800, descricao: 'global', moeda: 'BRL', trecho_fonte: '' },
      ],
    });
    expect(r.valores).toHaveLength(1);
    expect(r.valores[0].tipo).toBe('estimado');
  });

  // Inferências de tipo_documento — mais caminhos
  it('normaliza "decreto municipal" → "decreto"', () => {
    const r = normalizeSummaryBeforeValidation({ ...summaryBase, tipo_documento: 'decreto municipal' });
    expect(r.tipo_documento).toBe('decreto');
  });

  it('normaliza "portaria" → "portaria"', () => {
    const r = normalizeSummaryBeforeValidation({ ...summaryBase, tipo_documento: 'portaria normativa' });
    expect(r.tipo_documento).toBe('portaria');
  });

  it('normaliza "lei ordinaria" → "lei"', () => {
    const r = normalizeSummaryBeforeValidation({ ...summaryBase, tipo_documento: 'lei ordinaria' });
    expect(r.tipo_documento).toBe('lei');
  });

  it('normaliza "empenho de despesa" → "despesa"', () => {
    const r = normalizeSummaryBeforeValidation({ ...summaryBase, tipo_documento: 'empenho de despesa' });
    expect(r.tipo_documento).toBe('despesa');
  });

  it('normaliza "ata de resultado" (tipo) → "ata"', () => {
    const r = normalizeSummaryBeforeValidation({ ...summaryBase, tipo_documento: 'ata de resultado' });
    expect(r.tipo_documento).toBe('ata');
  });

  // Normalização de datas
  it('normaliza datas_relevantes com formato BR', () => {
    const r = normalizeSummaryBeforeValidation({
      ...summaryBase,
      datas_relevantes: [
        { tipo: 'publicacao', data: '10/01/2024', descricao: 'publicação', trecho_fonte: 'data 10/01/2024' },
      ],
    });
    expect(r.datas_relevantes[0].data).toBe('2024-01-10');
  });

  it('filtra datas_relevantes sem trecho_fonte', () => {
    const r = normalizeSummaryBeforeValidation({
      ...summaryBase,
      datas_relevantes: [
        { tipo: 'abertura', data: '2024-03-01', descricao: 'abertura', trecho_fonte: '' },
        { tipo: 'publicacao', data: '2024-01-01', descricao: 'publicação', trecho_fonte: 'trecho real' },
      ],
    });
    expect(r.datas_relevantes).toHaveLength(1);
  });

  // Normalização de itens_licitados (testa normalizeNumberValue indiretamente)
  it('normaliza valores numéricos em itens_licitados', () => {
    const r = normalizeSummaryBeforeValidation({
      ...summaryBase,
      itens_licitados: [
        {
          descricao: 'Resma de papel A4',
          quantidade: '10',
          valor_unitario_estimado: '25,50',
          valor_total_estimado: '255,00',
          trecho_fonte: 'item 1: resma papel',
        },
      ],
    });
    expect(r.itens_licitados).toHaveLength(1);
    expect(r.itens_licitados[0].quantidade).toBe(10);
    expect(r.itens_licitados[0].valor_unitario_estimado).toBe(25.5);
  });

  it('retorna itens_licitados vazio quando não há trecho_fonte', () => {
    const r = normalizeSummaryBeforeValidation({
      ...summaryBase,
      itens_licitados: [
        { descricao: 'item sem fonte', quantidade: 1, trecho_fonte: '' },
      ],
    });
    expect(r.itens_licitados).toHaveLength(0);
  });

  // normalização de riscos_ou_alertas
  it('normaliza riscos_ou_alertas filtrando sem descricao ou motivo', () => {
    const r = normalizeSummaryBeforeValidation({
      ...summaryBase,
      riscos_ou_alertas: [
        { nivel: 'alto', descricao: 'valor acima do estimado', motivo: 'sobrepreço detectado' },
        { nivel: 'medio', descricao: '', motivo: 'sem descricao' },
      ],
    });
    expect(r.riscos_ou_alertas).toHaveLength(1);
    expect(r.riscos_ou_alertas[0].nivel).toBe('alto');
  });

  it('retorna input intacto quando não é objeto', () => {
    expect(normalizeSummaryBeforeValidation(null)).toBeNull();
    expect(normalizeSummaryBeforeValidation('string')).toBe('string');
    expect(normalizeSummaryBeforeValidation([1, 2])).toEqual([1, 2]);
  });
});

// ── validateSummary ──────────────────────────────────────────────────────────

describe('validateSummary', () => {
  const summaryValido = {
    tipo_documento: 'edital',
    titulo_curto: 'Pregão 001/2024 — Material Escritório',
    resumo_cidadao: 'A prefeitura contratará material de escritório.',
    resumo_tecnico: 'Pregão presencial 001/2024 para aquisição de material de escritório conforme TR.',
    objeto: { descricao: 'Material de escritório', trecho_fonte: 'objeto: material de escritório' },
    pontos_principais: ['Modalidade: pregão presencial'],
    datas_relevantes: [],
    valores: [],
    partes_envolvidas: [],
    itens_licitados: [],
    riscos_ou_alertas: [],
    campos_nao_encontrados: [],
    confianca: 0.85,
  };

  it('valida resumo completo e bem formado sem lançar erro', () => {
    expect(() => validateSummary(summaryValido)).not.toThrow();
  });

  it('retorna objeto parsed pelo Zod', () => {
    const r = validateSummary(summaryValido);
    expect(r.tipo_documento).toBe('edital');
    expect(r.confianca).toBe(0.85);
  });

  it('lança erro descritivo quando campo array recebe string', () => {
    const invalido = { ...summaryValido, datas_relevantes: 'nao_e_array' };
    expect(() => validateSummary(invalido)).toThrow('contrato esperado');
    expect(() => validateSummary(invalido)).toThrow('datas_relevantes');
  });

  it('lança erro quando pontos_principais não é array', () => {
    const invalido = { ...summaryValido, pontos_principais: 'deveria ser array' };
    expect(() => validateSummary(invalido)).toThrow('contrato esperado');
  });
});
