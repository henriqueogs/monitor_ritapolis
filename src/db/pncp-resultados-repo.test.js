'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

function criarBancoMemoria() {
  const conn = new DatabaseSync(':memory:');
  conn.exec(fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf8'));
  return conn;
}

const mockConn = criarBancoMemoria();
jest.mock('./connection', () => ({ db: mockConn }));

const { listarDocumentosPorNumeroPncp, gravarResultadoPncp } = require('./pncp-resultados-repo');
const { escolherDocumentoCanonico } = require('../licitacoes/pncp-resultados');
const { ehValorFinalDeEmpenho } = require('../transparencia/valor-final-empenho');

const CONTROLE = '00000000000191-1-000001/2025';

function seedDocumento({ fonte, ano = 2025, detalhes = null }) {
  const { lastInsertRowid } = mockConn
    .prepare(
      `INSERT INTO documentos (fonte, tipo, titulo, url_origem, ano)
       VALUES (?, 'edital', 'Pregão 1/2025', 'https://exemplo.gov.br/origem', ?)`
    )
    .run(fonte, ano);
  const id = Number(lastInsertRowid);
  if (detalhes) {
    mockConn
      .prepare(
        `INSERT INTO licitacoes_detalhes (documento_id, vencedor_nome, vencedor_cnpj, valor_final,
           numero_pncp, data_homologacao, origem, origem_detalhe, trecho_fonte, confianca)
         VALUES (@id, @vencedor_nome, @vencedor_cnpj, @valor_final, @numero_pncp, @data_homologacao,
           @origem, @origem_detalhe, @trecho_fonte, @confianca)`
      )
      .run({
        id,
        vencedor_nome: null,
        vencedor_cnpj: null,
        valor_final: null,
        numero_pncp: CONTROLE,
        data_homologacao: null,
        origem: null,
        origem_detalhe: null,
        trecho_fonte: null,
        confianca: null,
        ...detalhes,
      });
  }
  return id;
}

function detalhes(id) {
  return mockConn.prepare('SELECT * FROM licitacoes_detalhes WHERE documento_id = ?').get(id);
}

function somaPorAno(ano) {
  return mockConn
    .prepare(
      `SELECT COALESCE(SUM(ld.valor_final), 0) AS total
       FROM licitacoes_detalhes ld JOIN documentos d ON d.id = ld.documento_id WHERE d.ano = ?`
    )
    .get(ano).total;
}

const RESULTADO_UNICO = {
  vencedor_nome: 'Fornecedor A',
  vencedor_cnpj: '11222333000181',
  multiplos_fornecedores: false,
  valor_final: 2000,
  numero_pncp: CONTROLE,
  data_resultado: '2025-03-12',
};

describe('pncp-resultados-repo', () => {
  beforeEach(() => {
    mockConn.exec('DELETE FROM documentos_resumos_ai; DELETE FROM licitacoes_detalhes; DELETE FROM documentos;');
  });

  it('com edital do site e compra do PNCP no mesmo processo, o valor entra uma vez só no ano', () => {
    // Arrange: site já tinha valor lido do texto; o coletor do PNCP trouxe a compra sem valor.
    const site = seedDocumento({
      fonte: 'site_prefeitura',
      detalhes: { valor_final: 900, origem: 'texto_ia', trecho_fonte: 'valor de 900', confianca: 0.6 },
    });
    seedDocumento({ fonte: 'pncp', detalhes: {} });

    // Act
    const docs = listarDocumentosPorNumeroPncp(CONTROLE);
    const canonico = escolherDocumentoCanonico(docs);
    gravarResultadoPncp(canonico.id, RESULTADO_UNICO);

    // Assert
    expect(docs).toHaveLength(2);
    expect(canonico.id).toBe(site);
    expect(somaPorAno(2025)).toBe(2000);
  });

  it('troca de documento canônico entre execuções não deixa o processo somado duas vezes', () => {
    // fiscal-valores 28/10 (reauditoria), achado 4: semana 1 só o doc do PNCP tinha numero_pncp
    // e recebeu 2000; na semana 2 o edital local ganhou o número pelo texto e virou canônico.
    const pncp = seedDocumento({ fonte: 'pncp', detalhes: {} });
    gravarResultadoPncp(escolherDocumentoCanonico(listarDocumentosPorNumeroPncp(CONTROLE)).id, RESULTADO_UNICO);
    const site = seedDocumento({ fonte: 'site_prefeitura', detalhes: { valor_final: 900, origem: 'texto_ia' } });
    const outroLocal = seedDocumento({ fonte: 'site_prefeitura', detalhes: { valor_final: 750, origem: 'texto_ia' } });

    const canonico = escolherDocumentoCanonico(listarDocumentosPorNumeroPncp(CONTROLE));
    gravarResultadoPncp(canonico.id, RESULTADO_UNICO);

    expect(canonico.id).toBe(site);
    expect(somaPorAno(2025)).toBe(2000);
    for (const id of [pncp, outroLocal]) {
      expect(detalhes(id)).toMatchObject({
        valor_final: null,
        vencedor_nome: null,
        data_homologacao: null,
        origem_detalhe: 'pncp_resultados_nao_canonico',
      });
    }
  });

  it('extração por texto e nova coleta não devolvem valor/vencedor a linha do PNCP', () => {
    // fiscal-valores 28/10 (2ª reauditoria), achado 4: reextrair o texto do não canônico
    // recolocava 750 e o ano voltava a somar 2750.
    const { upsertLicitacaoDetalhesExtraidos, saveDocumento } = require('./index');
    const site = seedDocumento({ fonte: 'site_prefeitura', detalhes: {} });
    const outro = seedDocumento({ fonte: 'site_prefeitura', detalhes: { valor_final: 750, origem: 'texto_ia' } });
    gravarResultadoPncp(site, { ...RESULTADO_UNICO, vencedor_nome: null, vencedor_cnpj: null, multiplos_fornecedores: true });

    const doTexto = {
      valor_final: 750,
      vencedor_nome: 'X do texto',
      vencedor_cnpj: '55444333000122',
      data_homologacao: '2025-01-01',
      origem: 'texto_regex',
      origem_detalhe: 'regex_homologacao',
      trecho_fonte: 'homologado por 750',
    };
    upsertLicitacaoDetalhesExtraidos({ id: outro }, doTexto);
    upsertLicitacaoDetalhesExtraidos({ id: site }, { ...doTexto, valor_final: 999 });
    saveDocumento({
      fonte: 'site_prefeitura',
      tipo: 'edital',
      titulo: 'Pregão 1/2025',
      url_origem: 'https://exemplo.gov.br/origem',
      ano: 2025,
      hash_conteudo: 'hash-coleta',
      licitacao_detalhes: { ...doTexto, numero_pncp: CONTROLE },
    });

    // Extração de entidades por IA (ai-daily-scheduler) também grava direto.
    const resumo = JSON.stringify({
      partes_envolvidas: [{ papel: 'contratado', nome: 'Y da IA', documento: 'CNPJ 55.444.333/0001-22' }],
      valores: [{ tipo: 'final', valor: 640 }],
    });
    for (const id of [site, outro]) {
      mockConn
        .prepare(
          `INSERT INTO documentos_resumos_ai (documento_id, provider, modelo, contrato_versao, resumo_json, texto_hash)
           VALUES (?, 'teste', 'teste', 'v1', ?, 'h')`
        )
        .run(id, resumo);
    }
    require('../ai/extract-entities').extractEntitiesFromResumes();

    expect(somaPorAno(2025)).toBe(2000);
    expect(detalhes(outro)).toMatchObject({
      valor_final: null,
      vencedor_nome: null,
      origem_detalhe: 'pncp_resultados_nao_canonico',
    });
    expect(detalhes(site)).toMatchObject({
      valor_final: 2000,
      vencedor_nome: null,
      origem: 'pncp_orgaos',
      origem_detalhe: 'pncp_resultados',
    });
  });

  it('documento que ganha o mesmo numero_pncp depois da sincronização entra neutralizado', () => {
    // fiscal-valores 28/10 (3ª reauditoria), achado 4a: o doc novo chegava sem marca e o
    // ano somava 2750 até a próxima sincronização semanal.
    const { upsertLicitacaoDetalhesExtraidos, saveDocumento } = require('./index');
    const site = seedDocumento({ fonte: 'site_prefeitura', detalhes: {} });
    gravarResultadoPncp(site, RESULTADO_UNICO);
    const doTexto = { valor_final: 750, vencedor_nome: 'X do texto', origem: 'texto_regex' };

    // Linha nova (INSERT sem conflito) já com o número.
    const novo = seedDocumento({ fonte: 'site_prefeitura', detalhes: doTexto });
    // Linha existente que só depois ganha o número pela extração de texto.
    const semNumero = seedDocumento({ fonte: 'site_prefeitura', detalhes: { numero_pncp: null } });
    upsertLicitacaoDetalhesExtraidos({ id: semNumero }, { ...doTexto, numero_pncp: CONTROLE });
    // Coleta de um documento novo com o número já no texto.
    const coletado = saveDocumento({
      fonte: 'site_prefeitura',
      tipo: 'edital',
      titulo: 'Extrato 1/2025',
      url_origem: 'https://exemplo.gov.br/extrato',
      ano: 2025,
      hash_conteudo: 'hash-novo',
      licitacao_detalhes: { ...doTexto, numero_pncp: CONTROLE },
    });

    expect(somaPorAno(2025)).toBe(2000);
    for (const id of [novo, semNumero, Number(coletado.id)]) {
      expect(detalhes(id)).toMatchObject({
        valor_final: null,
        vencedor_nome: null,
        origem_detalhe: 'pncp_resultados_nao_canonico',
      });
    }
    expect(detalhes(site)).toMatchObject({ valor_final: 2000, origem_detalhe: 'pncp_resultados' });
  });

  it('troca a origem e limpa o trecho/confiança do valor anterior (empenho ou texto)', () => {
    const id = seedDocumento({
      fonte: 'site_prefeitura',
      detalhes: {
        vencedor_nome: 'Antigo',
        valor_final: 3100,
        origem: 'portal_transparencia',
        origem_detalhe: 'empenho_agregado',
        trecho_fonte: 'empenhos somados',
        confianca: 0.9,
        data_homologacao: '2024-01-01',
      },
    });

    gravarResultadoPncp(id, RESULTADO_UNICO);

    expect(detalhes(id)).toMatchObject({
      vencedor_nome: 'Fornecedor A',
      vencedor_cnpj: '11222333000181',
      valor_final: 2000,
      origem: 'pncp_orgaos',
      origem_detalhe: 'pncp_resultados',
      trecho_fonte: null,
      confianca: null,
      data_homologacao: '2025-03-12',
    });
    // O guard de exibição e a limpeza de valor de empenho não podem esconder/apagar o homologado.
    expect(ehValorFinalDeEmpenho(detalhes(id))).toBe(false);
  });

  it('vários fornecedores: apaga o vencedor antigo em vez de deixá-lo ao lado do total', () => {
    const id = seedDocumento({
      fonte: 'site_prefeitura',
      detalhes: { vencedor_nome: 'A (texto)', vencedor_cnpj: '11222333000181', origem: 'texto_ia' },
    });

    gravarResultadoPncp(id, {
      ...RESULTADO_UNICO,
      vencedor_nome: null,
      vencedor_cnpj: null,
      multiplos_fornecedores: true,
    });

    expect(detalhes(id)).toMatchObject({ vencedor_nome: null, vencedor_cnpj: null, valor_final: 2000 });
  });

  it('cria os detalhes quando o documento ainda não tinha e mantém o numero_pncp existente', () => {
    const id = seedDocumento({ fonte: 'pncp' });

    gravarResultadoPncp(id, RESULTADO_UNICO);

    expect(detalhes(id)).toMatchObject({ numero_pncp: CONTROLE, valor_final: 2000, origem: 'pncp_orgaos' });
  });

  it('recusa gravar sem valor final (o chamador só grava compra fechada e precificada)', () => {
    const id = seedDocumento({ fonte: 'site_prefeitura', detalhes: {} });

    expect(() => gravarResultadoPncp(id, { ...RESULTADO_UNICO, valor_final: null })).toThrow('valor_final');
  });
});
