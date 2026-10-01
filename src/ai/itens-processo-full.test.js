'use strict';
const { DatabaseSync } = require('node:sqlite');
const { createProgress, PipelineYield } = require('../pipeline/progress');
const { fontesDoProcesso, computeTextoHash, CONTRACT_VERSION } = require('./itens-processo-input');
const { extractAllItems, planChunks } = require('./itens-processo-full');
const {
  assessItemsResult,
  completeCoverage,
  validateRowEvidence,
} = require('./itens-processo-evidence');

const empty = () => ({
  tem_tabela_itens: false,
  itens_solicitados: [],
  resultado_lotes: [],
  resultado_global: null,
  lacunas: [],
  confianca: 0.9,
});
const input = prompt => JSON.parse(prompt.split('JSON de entrada:\n')[1]);
const rowFrom = (source, quote, data = {}) => ({
  descricao: quote,
  trecho_fonte: quote,
  fonte_chave: source.chave,
  ...data,
});
const provider = response => ({
  generateJson: jest.fn(async ({ prompt }) => JSON.stringify(await response(input(prompt)))),
});
const document = texto => ({
  id: 1,
  texto_completo: texto,
  url_origem: 'https://official.example/process/1',
});
const record = (doc, atas, data) => ({
  status: 'ok',
  texto_hash: computeTextoHash(doc, atas),
  contrato_versao: CONTRACT_VERSION,
  itens_json: data,
});

test('all characters of a million-character source are covered, bounded and without holes', async () => {
  const doc = document('x'.repeat(1100000) + 'FIM_TABELA');
  const sources = fontesDoProcesso(doc);
  const groups = planChunks(sources);
  expect(groups.flat().at(-1).texto).toContain('FIM_TABELA');
  expect(groups.every(g => g.reduce((n, s) => n + s.texto.length, 0) <= 10000)).toBe(true);
  const output = await extractAllItems(
    doc,
    sources,
    provider(() => empty())
  );
  expect(completeCoverage(output.cobertura_fontes, sources)).toBe(true);
  output.cobertura_fontes.trechos.splice(1, 1);
  expect(completeCoverage(output.cobertura_fontes, sources)).toBe(false);
});

test('extracts the last row beyond 60000 and attachment seven, preserving source offsets', async () => {
  const doc = document('x'.repeat(70000) + '\nItem 91 Arroz 10 kg R$ 120,00');
  const atas = Array.from({ length: 7 }, (_, id) => ({
    id: id + 10,
    tipo: 'ata',
    url: `https://official.example/${id}`,
    texto_completo: id === 6 ? 'Lote 7 Papel Acme R$ 200,00' : 'Documento sem tabela.',
  }));
  const mock = provider(({ fontes }) => {
    const data = empty();
    for (const source of fontes) {
      if (source.texto.includes('Item 91')) {
        data.itens_solicitados.push(
          rowFrom(source, 'Item 91 Arroz 10 kg R$ 120,00', {
            item_numero: '91',
            descricao: 'Arroz',
            quantidade: 10,
            unidade: 'kg',
            valor_estimado: 120,
          })
        );
      }
      if (source.texto.includes('Lote 7')) {
        data.resultado_lotes.push({
          lote_numero: '7',
          objeto: 'Papel',
          fornecedor_nome: 'Acme',
          teto_homologado: 200,
          trecho_fonte: 'Lote 7 Papel Acme R$ 200,00',
          fonte_chave: source.chave,
        });
      }
    }
    data.tem_tabela_itens = Boolean(data.itens_solicitados.length || data.resultado_lotes.length);
    return data;
  });
  const output = await extractAllItems(doc, fontesDoProcesso(doc, atas), mock);
  expect(output.itens_solicitados).toHaveLength(1);
  expect(output.itens_solicitados[0].fonte.inicio).toBeGreaterThan(60000);
  expect(output.resultado_lotes[0].fonte.chave).toBe('anexo:16');
  expect(assessItemsResult(record(doc, atas, output), doc, atas).valid).toBe(true);
  expect(assessItemsResult(record(doc, atas, output), doc, atas.slice(0, 6)).valid).toBe(false);
});

test('SQLite restart reuses validated calls, retaining one input namespace and identical final result', async () => {
  const db = new DatabaseSync(':memory:');
  const doc = document('A'.repeat(22000));
  const sources = fontesDoProcesso(doc),
    mock = provider(() => empty());
  const progress = createProgress(db, 'same-job');
  let saves = 0;
  const actualSave = progress.save;
  progress.save = (key, value) => {
    actualSave(key, value);
    if (++saves === 1) {
      throw new PipelineYield();
    }
  };
  await expect(extractAllItems(doc, sources, mock, progress)).rejects.toMatchObject({
    code: 'PIPELINE_YIELD',
  });
  const output = await extractAllItems(doc, sources, mock, createProgress(db, 'same-job'));
  expect(mock.generateJson).toHaveBeenCalledTimes(planChunks(sources).length);
  expect(completeCoverage(output.cobertura_fontes, sources)).toBe(true);
  expect(db.prepare('SELECT COUNT(*) AS n FROM pipeline_progress').get().n).toBe(
    planChunks(sources).length
  );
  db.close();
});

test('truncated response splits adaptively and never repeats the failed parent on resume', async () => {
  const db = new DatabaseSync(':memory:');
  const doc = document('A'.repeat(9000)),
    sources = fontesDoProcesso(doc);
  const mock = {
    generateJson: jest.fn(async ({ prompt }) => {
      if (input(prompt).fontes[0].texto.length > 6000) {
        return '{"truncated":';
      }
      return JSON.stringify(empty());
    }),
  };
  const output = await extractAllItems(doc, sources, mock, createProgress(db, 'adaptive'));
  expect(mock.generateJson).toHaveBeenCalledTimes(3);
  await extractAllItems(doc, sources, mock, createProgress(db, 'adaptive'));
  expect(mock.generateJson).toHaveBeenCalledTimes(3);
  expect(completeCoverage(output.cobertura_fontes, sources)).toBe(true);
  db.close();
});

test('more than 200 total rows are retained; overlap duplicates are collapsed only with matching evidence and fields', async () => {
  const lines = Array.from(
    { length: 350 },
    (_, id) => `Item ${id + 1} PRODUTO_${id + 1} descricao oficial suficientemente longa\n`
  );
  const doc = document(lines.join(''));
  const mock = provider(({ fontes }) => {
    const data = empty();
    for (const source of fontes) {
      for (const match of source.texto.matchAll(
        /Item (\d+) (PRODUTO_\d+) descricao oficial suficientemente longa/g
      )) {
        data.itens_solicitados.push(
          rowFrom(source, match[0], { item_numero: match[1], descricao: match[2] })
        );
      }
    }
    data.tem_tabela_itens = true;
    return data;
  });
  const output = await extractAllItems(doc, fontesDoProcesso(doc), mock);
  expect(output.itens_solicitados).toHaveLength(350);
  expect(new Set(output.itens_solicitados.map(r => r.item_numero)).size).toBe(350);
});

test('dense output above the leaf schema cap splits instead of discarding rows', async () => {
  const doc = document(Array.from({ length: 420 }, (_, i) => `Item ${i + 1} X${i + 1}\n`).join(''));
  const mock = provider(({ fontes }) => {
    const data = empty();
    for (const source of fontes) {
      for (const m of source.texto.matchAll(/Item (\d+) (X\d+)/g)) {
        data.itens_solicitados.push(rowFrom(source, m[0], { item_numero: m[1], descricao: m[2] }));
      }
    }
    data.tem_tabela_itens = true;
    return data;
  });
  const result = await extractAllItems(doc, fontesDoProcesso(doc), mock);
  expect(result.itens_solicitados).toHaveLength(420);
  expect(mock.generateJson.mock.calls.length).toBeGreaterThan(1);
});
test('short identifiers cannot match a substring of another item or person name', () => {
  const source = { ...fontesDoProcesso(document('Item 10 Banana R$ 100,00'))[0], inicio: 0 };
  expect(() =>
    validateRowEvidence({ descricao: 'Banana', item_numero: '1', trecho_fonte: source.texto }, [
      source,
    ])
  ).toThrow(/item_numero/);
  expect(() =>
    validateRowEvidence(
      { descricao: 'Banana', fornecedor_nome: 'Ana', trecho_fonte: source.texto },
      [source]
    )
  ).toThrow(/fornecedor_nome/);
});
test.each([
  [{ trecho_fonte: 'Inventado', descricao: 'Inventado' }, /nao encontrada/],
  [
    {
      trecho_fonte: 'Item 1 Arroz 10 kg R$ 120,00',
      descricao: 'Arroz',
      fornecedor_nome: 'Pessoa inexistente',
    },
    /fornecedor_nome/,
  ],
  [
    { trecho_fonte: 'Item 1 Arroz 10 kg R$ 120,00', descricao: 'Arroz', valor_estimado: 999 },
    /valor_estimado/,
  ],
  [{ trecho_fonte: 'Não especificado no trecho fornecido', descricao: 'Arroz' }, /fabricada/],
])('rejects unsupported quote/person/value instead of publishing it', (row, error) => {
  expect(() =>
    validateRowEvidence(row, [
      { ...fontesDoProcesso(document('Item 1 Arroz 10 kg R$ 120,00'))[0], inicio: 0 },
    ])
  ).toThrow(error);
});

test('quoted whitespace may normalize but conflicting identities and ambiguous sources require review', async () => {
  const doc = document('Item 1 Arroz\n  10 kg R$ 120,00');
  const source = fontesDoProcesso(doc)[0];
  expect(
    validateRowEvidence(
      { descricao: 'Arroz', trecho_fonte: 'Item 1 Arroz 10 kg R$ 120,00', quantidade: 10 },
      [{ ...source, inicio: 0 }]
    ).fonte.inicio
  ).toBe(0);
  const duplicate = { ...source, chave: 'anexo:2' };
  expect(() =>
    validateRowEvidence({ descricao: 'Arroz', trecho_fonte: doc.texto_completo }, [
      { ...source, inicio: 0 },
      { ...duplicate, inicio: 0 },
    ])
  ).toThrow(/ambigua/);
  const conflicting = document(
    'Lote 1 Arroz Acme R$ 120,00\n' + 'z'.repeat(11000) + '\nLote 1 Arroz Beta R$ 999,00'
  );
  const mock = provider(({ fontes }) => {
    const data = empty();
    for (const source of fontes) {
      for (const match of source.texto.matchAll(/Lote 1 Arroz (Acme|Beta) R\$ (120|999),00/g)) {
        data.resultado_lotes.push({
          lote_numero: '1',
          objeto: 'Arroz',
          fornecedor_nome: match[1],
          teto_homologado: Number(match[2]),
          trecho_fonte: match[0],
          fonte_chave: source.chave,
        });
      }
    }
    data.tem_tabela_itens = Boolean(data.resultado_lotes.length);
    return data;
  });
  await expect(extractAllItems(conflicting, fontesDoProcesso(conflicting), mock)).rejects.toThrow(
    /contraditorias/
  );
});

test('legacy long input, new URL, missing source and tampered provenance cannot be publicly current', async () => {
  const doc = document('Fonte oficial sem tabela'),
    atas = [];
  const output = await extractAllItems(
    doc,
    fontesDoProcesso(doc),
    provider(() => empty())
  );
  const saved = record(doc, atas, output);
  expect(assessItemsResult(saved, doc, atas).valid).toBe(true);
  expect(
    assessItemsResult(saved, { ...doc, url_origem: 'https://another.example' }, atas).valid
  ).toBe(false);
  const big = document('A'.repeat(60001));
  expect(
    assessItemsResult({ ...record(big, [], empty()), contrato_versao: 'itens-processo-v1.0' }, big)
      .valid
  ).toBe(false);
  await expect(
    extractAllItems(
      doc,
      fontesDoProcesso(doc, [{ id: 3, tipo: 'ata', texto_completo: '' }]),
      provider(() => empty())
    )
  ).rejects.toThrow(/sem texto/);
});

test.each(['evidence', 'length'])(
  'one smaller-context recovery for %s retains strict evidence and survives resume',
  async mode => {
    const db = new DatabaseSync(':memory:');
    const doc = document('x'.repeat(4200) + '\nItem 1 Arroz\n' + 'y'.repeat(4200));
    const mock = provider(({ fontes }) => {
      const data = empty();
      const source = fontes[0];
      if (source.texto.length > 6000) {
        data.itens_solicitados = [
          rowFrom(source, mode === 'length' ? 'x'.repeat(701) : 'Item 1 Arroz', {
            descricao: 'Descricao inventada',
          }),
        ];
      } else if (source.texto.includes('Item 1 Arroz')) {
        data.itens_solicitados = [
          rowFrom(source, 'Item 1 Arroz', { descricao: 'Arroz', item_numero: '1' }),
        ];
      }
      data.tem_tabela_itens = Boolean(data.itens_solicitados.length);
      return data;
    });
    const result = await extractAllItems(
      doc,
      fontesDoProcesso(doc),
      mock,
      createProgress(db, 'repair')
    );
    expect(result.itens_solicitados).toHaveLength(1);
    expect(result.itens_solicitados[0].descricao).toBe('Arroz');
    expect(mock.generateJson).toHaveBeenCalledTimes(3);
    await extractAllItems(doc, fontesDoProcesso(doc), mock, createProgress(db, 'repair'));
    expect(mock.generateJson).toHaveBeenCalledTimes(3);
    expect(assessItemsResult(record(doc, [], result), doc).valid).toBe(true);
    db.close();
  }
);

test('repeated unsupported evidence blocks instead of an unlimited split loop or partial output', async () => {
  const doc = document('x'.repeat(8500) + '\nItem 1 Arroz');
  const mock = provider(({ fontes }) => ({
    ...empty(),
    tem_tabela_itens: true,
    itens_solicitados: [rowFrom(fontes[0], 'Item 1 Arroz', { descricao: 'Pessoa inventada' })],
  }));
  await expect(extractAllItems(doc, fontesDoProcesso(doc), mock)).rejects.toThrow('exige revisao');
  expect(mock.generateJson).toHaveBeenCalledTimes(2);
});
