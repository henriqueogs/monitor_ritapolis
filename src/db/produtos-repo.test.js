'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

function criarBancoMemoria() {
  const conn = new DatabaseSync(':memory:');
  const schema = fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf8');
  conn.exec(schema);
  return conn;
}

const mockConn = criarBancoMemoria();

jest.mock('./connection', () => ({
  db: mockConn,
}));

const {
  getEvolucaoPrecoGrupo,
  getLicitacaoProdutosByDocumentoId,
  getLicitacaoProdutosResumo,
  getProdutosGruposComparaveis,
  listLicitacaoProdutos,
} = require('./produtos-repo');

function inserirDocumento(id, ano, titulo = `Documento ${id}`) {
  mockConn
    .prepare(
      `INSERT INTO documentos (id, fonte, tipo, numero, ano, titulo, url_origem)
       VALUES (?, 'site_prefeitura', 'edital', ?, ?, ?, ?)`
    )
    .run(id, `P-${id}/${ano}`, ano, titulo, `https://origem/${id}`);
}

function inserirProduto({
  id,
  documentoId,
  ano,
  descricao,
  hash,
  fornecedor = null,
  valorUnitarioFinal = null,
  valorTotalFinal = null,
  quantidade = null,
  grupoId = null,
}) {
  mockConn
    .prepare(
      `INSERT INTO licitacoes_produtos (
         id, documento_id, ano, descricao, descricao_normalizada, hash_item,
         origem, fornecedor_nome, valor_unitario_final, valor_total_final,
         quantidade, grupo_id
       ) VALUES (?, ?, ?, ?, ?, ?, 'ia_resumo', ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      documentoId,
      ano,
      descricao,
      descricao.toLowerCase(),
      hash,
      fornecedor,
      valorUnitarioFinal,
      valorTotalFinal,
      quantidade,
      grupoId
    );
}

describe('produtos-repo', () => {
  beforeEach(() => {
    mockConn.exec('DELETE FROM licitacoes_produtos_validacoes');
    mockConn.exec('DELETE FROM licitacoes_produtos');
    mockConn.exec('DELETE FROM produtos_grupos');
    mockConn.exec('DELETE FROM documentos_itens_estruturados');
    mockConn.exec('DELETE FROM documentos');

    inserirDocumento(1, 2026, 'Compra de merenda escolar');
    inserirDocumento(2, 2025, 'Compra de merenda escolar');

    mockConn
      .prepare("INSERT INTO produtos_grupos (id, rotulo_canonico, n_itens, n_variacoes, metodo) VALUES (1, 'arroz tipo 1', 2, 1, 'teste')")
      .run();

    inserirProduto({
      id: 1,
      documentoId: 1,
      ano: 2026,
      descricao: 'Arroz tipo 1',
      hash: 'h1',
      fornecedor: 'Fornecedor A',
      valorUnitarioFinal: 10,
      quantidade: 3,
      grupoId: 1,
    });
    inserirProduto({
      id: 2,
      documentoId: 1,
      ano: 2026,
      descricao: 'Feijao carioca',
      hash: 'h2',
      valorTotalFinal: 50,
    });
    inserirProduto({
      id: 3,
      documentoId: 2,
      ano: 2025,
      descricao: 'Arroz tipo 1',
      hash: 'h3',
      fornecedor: 'Fornecedor B',
      valorUnitarioFinal: 8,
      quantidade: 2,
      grupoId: 1,
    });
  });

  it('lista produtos com contexto do documento', () => {
    const result = listLicitacaoProdutos({ ano: 2026, limite: 10 });

    expect(result.total).toBe(2);
    expect(result.dados[0].documento_titulo).toBe('Compra de merenda escolar');
    expect(result.dados[0].validacao_status).toBe('pendente');
  });

  it('expõe contexto de empenho agregado e anexo de origem', () => {
    mockConn
      .prepare(
        `INSERT INTO licitacoes_produtos_validacoes (produto_id, fonte, valor_encontrado, campo_validado, status)
         VALUES (1, 'plausibilidade_item_processo', 176186.2, 'valor_lote_final', 'contexto_empenho')`
      )
      .run();
    mockConn
      .prepare(
        `UPDATE licitacoes_produtos
         SET origem_detalhe = 'ata:negociacao:ata_resultado:documentos_anexos:21:Ata_de_Estrutura_2026.pdf'
         WHERE id = 1`
      )
      .run();

    const p = getLicitacaoProdutosByDocumentoId(1).dados.find((x) => x.id === 1);
    expect(p.valor_final_quarentenado).toBe(false);
    expect(p.valor_final_contexto_empenho).toBe(true);
    expect(p.plausibilidade_valor_processo).toBe(176186.2);
    expect(p.anexo_origem_id).toBe(21);
  });

  it('expõe quarentena de plausibilidade item×processo', () => {
    mockConn
      .prepare(
        `INSERT INTO licitacoes_produtos_validacoes (produto_id, fonte, valor_encontrado, campo_validado, status)
         VALUES (1, 'plausibilidade_item_processo', 176186.2, 'valor_total_final', 'implausivel')`
      )
      .run();

    const dados = getLicitacaoProdutosByDocumentoId(1).dados;
    const quarentenado = dados.find((p) => p.id === 1);
    const normal = dados.find((p) => p.id === 2);

    expect(quarentenado.valor_final_quarentenado).toBe(true);
    expect(quarentenado.plausibilidade_valor_processo).toBe(176186.2);
    expect(normal.valor_final_quarentenado).toBe(false);
  });

  it('filtra produtos por termo em descricao, fornecedor ou documento', () => {
    expect(listLicitacaoProdutos({ termo: 'Fornecedor B' }).total).toBe(1);
    expect(listLicitacaoProdutos({ termo: 'Feijao' }).total).toBe(1);
    expect(listLicitacaoProdutos({ termo: 'P-1/2026' }).total).toBe(2);
  });

  it('retorna produtos por documento com limite amplo', () => {
    const result = getLicitacaoProdutosByDocumentoId(1);

    expect(result.total).toBe(2);
    expect(result.dados.map((item) => item.descricao)).toEqual(['Feijao carioca', 'Arroz tipo 1']);
  });

  it('inclui estrutura (3 blocos) sem quebrar .dados', () => {
    const result = getLicitacaoProdutosByDocumentoId(1);
    expect(result.dados).toHaveLength(2); // legado intacto
    expect(result.estrutura).toBeDefined();
    expect(result.estrutura.itens_solicitados.length + result.estrutura.resultado_lotes.length).toBeGreaterThan(0);
    expect(result.estrutura.cobertura).toHaveProperty('n_itens');
    expect(result.estrutura.cobertura.origem_estrutura).toBe('heuristica');
  });

  function inserirItensEstruturadosIA(documentoId, itensJson, { confianca = 0.85, status = 'ok' } = {}) {
    mockConn
      .prepare(
        `INSERT INTO documentos_itens_estruturados
           (documento_id, provider, modelo, contrato_versao, itens_json, texto_hash, confianca, status)
         VALUES (?, 'nvidia', 'nvidia/nemotron-3-nano-30b-a3b', 'itens-processo-v1.0', ?, 'hash-teste', ?, ?)`
      )
      .run(documentoId, JSON.stringify(itensJson), confianca, status);
  }

  it('usa estrutura da IA quando existe resultado ok com confiança aceitável', () => {
    inserirItensEstruturadosIA(1, {
      tem_tabela_itens: true,
      itens_solicitados: [],
      resultado_lotes: [{ lote_numero: '1', objeto: 'EQUIPE DE APOIO', fornecedor_nome: 'HYAGO', teto_homologado: 195000, trecho_fonte: 'fonte' }],
      resultado_global: null,
      lacunas: [],
      confianca: 0.85,
    });

    const result = getLicitacaoProdutosByDocumentoId(1);
    expect(result.estrutura.cobertura.origem_estrutura).toBe('ia');
    expect(result.estrutura.resultado_lotes).toHaveLength(1);
    expect(result.estrutura.resultado_lotes[0].objeto).toBe('EQUIPE DE APOIO');
  });

  it('cai pro heurístico quando a confiança da IA é baixa demais', () => {
    inserirItensEstruturadosIA(1, {
      tem_tabela_itens: true,
      itens_solicitados: [],
      resultado_lotes: [{ lote_numero: '1', objeto: 'X', fornecedor_nome: null, teto_homologado: null, trecho_fonte: 'fonte' }],
      resultado_global: null,
      lacunas: [],
      confianca: 0.2,
    }, { confianca: 0.2 });

    const result = getLicitacaoProdutosByDocumentoId(1);
    expect(result.estrutura.cobertura.origem_estrutura).toBe('heuristica');
  });

  it('cai pro heurístico quando o resultado da IA tem status de erro', () => {
    inserirItensEstruturadosIA(1, { tem_tabela_itens: true, itens_solicitados: [], resultado_lotes: [], resultado_global: null, lacunas: [], confianca: 0.9 }, { status: 'erro' });

    const result = getLicitacaoProdutosByDocumentoId(1);
    expect(result.estrutura.cobertura.origem_estrutura).toBe('heuristica');
  });

  it('resume cobertura de valores e fornecedores por documento', () => {
    const resumo = getLicitacaoProdutosResumo(1);

    expect(resumo.total).toBe(2);
    expect(resumo.com_preco_final).toBe(2);
    expect(resumo.com_fornecedor).toBe(1);
    expect(resumo.valor_final_total_identificado).toBe(80);
  });

  it('lista grupos comparaveis e evolucao de preco', () => {
    const grupos = getProdutosGruposComparaveis({ limite: 5 });
    const evolucao = getEvolucaoPrecoGrupo(1);

    expect(grupos).toHaveLength(1);
    expect(grupos[0].n_anos).toBe(2);
    expect(evolucao.serie).toEqual([
      { ano: 2025, preco_medio: 8, preco_min: 8, preco_max: 8, n_itens: 1 },
      { ano: 2026, preco_medio: 10, preco_min: 10, preco_max: 10, n_itens: 1 },
    ]);
  });
});
