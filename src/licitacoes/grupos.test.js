'use strict';

const {
  inferPapel,
  papelLabel,
  buildGrupoKey,
  pickDocumentoCanonico,
  agruparDocumentosLicitacao,
} = require('./grupos');

// ── inferPapel ───────────────────────────────────────────────────────────────

describe('inferPapel', () => {
  it('infere "republicacao" de documento com "retificação" no título', () => {
    expect(inferPapel({ titulo: 'Retificação do Edital 001/2024', resumo: '' })).toBe('republicacao');
  });

  it('infere "republicacao" de "república" no título', () => {
    expect(inferPapel({ titulo: 'Republicação Edital 002/2024', resumo: '' })).toBe('republicacao');
  });

  it('infere "homologacao" de título com "homolog"', () => {
    expect(inferPapel({ titulo: 'Homologação Pregão 001/2024', resumo: '' })).toBe('homologacao');
  });

  it('infere "contrato" quando modelo.tem_contrato=true', () => {
    expect(inferPapel({ titulo: 'Publicação', resumo: '' }, { tem_contrato: true })).toBe('contrato');
  });

  it('infere "contrato" de título com "contrato"', () => {
    expect(inferPapel({ titulo: 'Contrato 12/2024', resumo: '' })).toBe('contrato');
  });

  it('infere "ata" de "ata de resultado"', () => {
    expect(inferPapel({ titulo: 'Ata de resultado do Pregão', resumo: '' })).toBe('ata');
  });

  it('infere "ata" de "classificação"', () => {
    expect(inferPapel({ titulo: 'Classificação final dos licitantes', resumo: '' })).toBe('ata');
  });

  it('infere "edital" de "pregão presencial"', () => {
    expect(inferPapel({ titulo: 'Pregão Presencial 003/2024', resumo: '' })).toBe('edital');
  });

  it('infere "edital" de "dispensa"', () => {
    expect(inferPapel({ titulo: 'Dispensa de Licitação 010/2024', resumo: '' })).toBe('edital');
  });

  it('infere "edital" de "chamamento público"', () => {
    expect(inferPapel({ titulo: 'Chamamento Público 001/2024', resumo: '' })).toBe('edital');
  });

  it('infere "edital" quando modelo.tem_edital=true', () => {
    expect(inferPapel({ titulo: 'Publicação avulsa', resumo: '' }, { tem_edital: true })).toBe('edital');
  });

  it('retorna "ata" quando modelo.tem_ata=true e sem outro sinal', () => {
    expect(inferPapel({ titulo: 'Publicação', resumo: '' }, { tem_ata: true })).toBe('ata');
  });

  it('retorna "publicacao" quando nenhum padrão é reconhecido', () => {
    expect(inferPapel({ titulo: 'Documento sem categoria', resumo: '' })).toBe('publicacao');
  });
});

// ── papelLabel ───────────────────────────────────────────────────────────────

describe('papelLabel', () => {
  it('retorna label legível para cada papel', () => {
    expect(papelLabel('edital')).toBe('Edital');
    expect(papelLabel('ata')).toBe('Ata');
    expect(papelLabel('contrato')).toBe('Contrato');
    expect(papelLabel('republicacao')).toBe('Republicacao');
    expect(papelLabel('homologacao')).toBe('Homologacao');
    expect(papelLabel('publicacao')).toBe('Publicacao');
  });

  it('retorna "Publicacao" para papel desconhecido', () => {
    expect(papelLabel('desconhecido')).toBe('Publicacao');
    expect(papelLabel(undefined)).toBe('Publicacao');
  });
});

// ── buildGrupoKey ─────────────────────────────────────────────────────────────

describe('buildGrupoKey', () => {
  it('gera chave com processo normalizado e ano', () => {
    const key = buildGrupoKey({ numero: 'PP-001/2024', ano: 2024 });
    expect(key).not.toBeNull();
    expect(key.ano).toBe(2024);
    expect(typeof key.processo_chave).toBe('string');
    expect(key.processo_chave.length).toBeGreaterThan(0);
  });

  it('usa modelo.processo quando disponível (prioridade sobre documento.numero)', () => {
    const key = buildGrupoKey({ numero: 'PP-002/2024', ano: 2024 }, { processo: 'PP-001/2024' });
    const keyDireto = buildGrupoKey({ numero: 'PP-001/2024', ano: 2024 });
    expect(key.processo_chave).toBe(keyDireto.processo_chave);
  });

  it('retorna null quando não há processo ou número', () => {
    expect(buildGrupoKey({ numero: null, ano: 2024 })).toBeNull();
    expect(buildGrupoKey({ numero: '', ano: 2024 })).toBeNull();
  });

  it('retorna null quando ano é string não-numérica', () => {
    expect(buildGrupoKey({ numero: 'PP-001', ano: 'inválido' })).toBeNull();
  });

  it('retorna objeto com ano=0 quando ano é null (Number(null)=0)', () => {
    // Number(null) === 0, que é finito — buildGrupoKey aceita e retorna ano:0
    const key = buildGrupoKey({ numero: 'PP-001', ano: null });
    expect(key).not.toBeNull();
    expect(key.ano).toBe(0);
  });
});

// ── pickDocumentoCanonico ─────────────────────────────────────────────────────

describe('pickDocumentoCanonico', () => {
  it('prefere documento com papel "edital" sobre outros', () => {
    const itens = [
      { documento_id: 1, papel: 'ata', data_publicacao: '2024-01-15' },
      { documento_id: 2, papel: 'edital', data_publicacao: '2024-01-10' },
      { documento_id: 3, papel: 'contrato', data_publicacao: '2024-01-20' },
    ];
    expect(pickDocumentoCanonico(itens)).toBe(2);
  });

  it('prefere "publicacao" sobre "republicacao" e outros quando não há edital', () => {
    const itens = [
      { documento_id: 1, papel: 'republicacao', data_publicacao: '2024-01-15' },
      { documento_id: 2, papel: 'publicacao', data_publicacao: '2024-01-10' },
    ];
    expect(pickDocumentoCanonico(itens)).toBe(2);
  });

  it('desempata por data de publicação (mais antigo primeiro)', () => {
    const itens = [
      { documento_id: 1, papel: 'edital', data_publicacao: '2024-02-01' },
      { documento_id: 2, papel: 'edital', data_publicacao: '2024-01-01' },
    ];
    expect(pickDocumentoCanonico(itens)).toBe(2);
  });

  it('retorna null para lista vazia', () => {
    expect(pickDocumentoCanonico([])).toBeNull();
  });
});

// ── agruparDocumentosLicitacao ────────────────────────────────────────────────

describe('agruparDocumentosLicitacao', () => {
  const doc = (id, numero, ano, titulo, tipo = 'edital') => ({
    documento: { id, numero, ano, titulo, tipo, resumo: '', data_publicacao: `${ano}-01-10`, fonte: 'prefeitura' },
    modelo: {},
  });

  it('agrupa dois documentos com mesmo processo/ano', () => {
    const itens = [
      doc(1, 'PP-001/2024', 2024, 'Pregão Presencial 001/2024'),
      doc(2, 'PP-001/2024', 2024, 'Ata de Resultado PP-001/2024'),
    ];
    const grupos = agruparDocumentosLicitacao(itens);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].total_documentos).toBe(2);
  });

  it('cria grupos separados para anos diferentes', () => {
    const itens = [
      doc(1, 'PP-001/2024', 2024, 'Pregão 001/2024'),
      doc(2, 'PP-001/2025', 2025, 'Pregão 001/2025'),
    ];
    const grupos = agruparDocumentosLicitacao(itens);
    expect(grupos).toHaveLength(2);
  });

  it('cria grupos separados para processos diferentes', () => {
    const itens = [
      doc(1, 'PP-001/2024', 2024, 'Pregão 001/2024'),
      doc(2, 'PP-002/2024', 2024, 'Pregão 002/2024'),
    ];
    const grupos = agruparDocumentosLicitacao(itens);
    expect(grupos).toHaveLength(2);
  });

  it('ignora documentos sem número de processo válido', () => {
    const itens = [
      doc(1, 'PP-001/2024', 2024, 'Pregão 001/2024'),
      doc(2, null, 2024, 'Sem número'),
    ];
    const grupos = agruparDocumentosLicitacao(itens);
    expect(grupos).toHaveLength(1);
  });

  it('define documento_canonico_id com preferência pelo edital', () => {
    const itens = [
      doc(1, 'PP-001/2024', 2024, 'Ata de resultado PP-001/2024', 'ata'),
      doc(2, 'PP-001/2024', 2024, 'Pregão Presencial 001/2024', 'edital'),
    ];
    const grupos = agruparDocumentosLicitacao(itens);
    expect(grupos[0].documento_canonico_id).toBe(2);
  });

  it('retorna array vazio para entrada vazia', () => {
    expect(agruparDocumentosLicitacao([])).toEqual([]);
  });

  it('cada grupo tem titulo_resumo, total_documentos e documentos[]', () => {
    const itens = [doc(1, 'PP-001/2024', 2024, 'Pregão 001/2024')];
    const grupos = agruparDocumentosLicitacao(itens);
    expect(grupos[0]).toMatchObject({
      total_documentos: 1,
      titulo_resumo: expect.any(String),
    });
    expect(Array.isArray(grupos[0].documentos)).toBe(true);
  });
});
