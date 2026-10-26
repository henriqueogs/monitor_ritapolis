'use strict';

const {
  extractJsonText,
  parseSummaryResponse,
  normalizeEnumValue,
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

  it('repara escapes invalidos do modelo (barra-cifrao, barra-porcento, barra-underscore) em vez de perder o resumo', () => {
    const raw = String.raw`{"resumo": "Valor de R\$ 10 e 50\% do total em item\_um", "tipo_documento": "edital"}`;
    const out = parseSummaryResponse(raw);
    expect(out.resumo).toBe('Valor de R$ 10 e 50% do total em item_um');
    expect(out.tipo_documento).toBe('edital');
  });

  it('o reparo preserva escapes validos e barras duplas', () => {
    const raw = String.raw`{"a": "linha1\nlinha2 \"aspas\" caminho C:\\pasta \$"}`;
    expect(parseSummaryResponse(raw).a).toBe('linha1\nlinha2 "aspas" caminho C:\\pasta $');
  });

  it('escapa aspas soltas copiadas do texto oficial (OCR) e preserva o conteudo', () => {
    const raw = '{"trecho": "Programa... ...".: 1202 - TRANSPORTE ESCOLAR", "tipo_documento": "decreto"}';
    const out = parseSummaryResponse(raw);
    expect(out.trecho).toBe('Programa... ...".: 1202 - TRANSPORTE ESCOLAR');
    expect(out.tipo_documento).toBe('decreto');
  });

  it('escapa varias aspas soltas em campos diferentes', () => {
    const raw = '{"a": "x "y" z", "b": ["p "q" r", "ok"], "n": 1}';
    const out = parseSummaryResponse(raw);
    expect(out.a).toBe('x "y" z');
    expect(out.b).toEqual(['p "q" r', 'ok']);
    expect(out.n).toBe(1);
  });

  it('nao inventa conteudo: JSON quebrado por outro motivo continua falhando', () => {
    expect(() => parseSummaryResponse('{"a": "x", "b": }')).toThrow('JSON valido');
    expect(() => parseSummaryResponse('{"a": "x" "b": 1}')).toThrow('JSON valido');
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

// ── normalizeOptionalText ────────────────────────────────────────────────────

describe('normalizeOptionalText', () => {
  it('retorna texto limpo sem espaços extras', () => {
    expect(normalizeOptionalText('  texto  ')).toBe('texto');
  });

  it('retorna null para string vazia', () => {
    expect(normalizeOptionalText('')).toBeNull();
    expect(normalizeOptionalText('   ')).toBeNull();
  });

  it('retorna null para campo ausente (undefined)', () => {
    expect(normalizeOptionalText(undefined)).toBeNull();
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

  it('lança erro descritivo quando a resposta não é um objeto', () => {
    expect(() => validateSummary([])).toThrow('contrato esperado');
  });

  // Tarefa 25227 (22/10/2026): resumo caiu como contrato_invalido. Formatos
  // que o modelo devolve e que antes iam direto para o Zod.
  describe('formatos tolerados', () => {
    it('lista vinda como null vira lista vazia', () => {
      const r = validateSummary({
        ...summaryValido,
        pontos_principais: null,
        datas_relevantes: null,
        valores: null,
        partes_envolvidas: null,
        riscos_ou_alertas: null,
        campos_nao_encontrados: null,
      });
      expect(r.pontos_principais).toEqual([]);
      expect(r.datas_relevantes).toEqual([]);
      expect(r.valores).toEqual([]);
      expect(r.partes_envolvidas).toEqual([]);
      expect(r.riscos_ou_alertas).toEqual([]);
      expect(r.campos_nao_encontrados).toEqual([]);
    });

    it('pontos_principais e campos_nao_encontrados em texto viram lista', () => {
      const r = validateSummary({
        ...summaryValido,
        pontos_principais: 'Modalidade: pregão',
        campos_nao_encontrados: 'valor estimado',
      });
      expect(r.pontos_principais).toEqual(['Modalidade: pregão']);
      expect(r.campos_nao_encontrados).toEqual(['valor estimado']);
    });

    it('lista em texto sem trecho_fonte é descartada', () => {
      const r = validateSummary({ ...summaryValido, datas_relevantes: 'nao_e_array' });
      expect(r.datas_relevantes).toEqual([]);
    });

    it('data fora do padrão vira ISO ou null, sem perder a descrição', () => {
      const r = validateSummary({
        ...summaryValido,
        datas_relevantes: [
          { tipo: 'abertura', data: '5 de março de 2024', descricao: 'Sessão', trecho_fonte: 'dia 5' },
          { tipo: 'vigencia', data: 'março de 2024', descricao: 'Vigência', trecho_fonte: 'março' },
        ],
      });
      expect(r.datas_relevantes.map(d => d.data)).toEqual(['2024-03-05', null]);
      expect(r.datas_relevantes[1].descricao).toBe('Vigência');
    });

    it('valor em texto de moeda vira número', () => {
      const r = validateSummary({
        ...summaryValido,
        valores: [{ tipo: 'estimado', valor: 'R$ 1.234,56', descricao: 'Total', trecho_fonte: 'R$ 1.234,56' }],
      });
      expect(r.valores[0].valor).toBe(1234.56);
    });

    it('valor sem número é descartado em vez de derrubar o resumo', () => {
      const r = validateSummary({
        ...summaryValido,
        valores: [{ tipo: 'estimado', valor: null, descricao: 'Total', trecho_fonte: 'a definir' }],
      });
      expect(r.valores).toEqual([]);
    });
  });
});
