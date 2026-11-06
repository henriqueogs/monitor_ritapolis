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

jest.mock('./connection', () => ({
  db: mockConn,
}));

const {
  salvarEmendaDetalhes,
  listarEmendas,
  contarEmendas,
  getEmendaById,
  totaisPorAno,
  parlamentaresComTotais,
} = require('./emendas-repo');

describe('emendas-repo — unificação de Resolução N.10088/2025, filtro dual de ano e higienização', () => {
  beforeEach(() => {
    mockConn.exec('DELETE FROM emendas_detalhes; DELETE FROM documentos; DELETE FROM transparencia_despesas;');
  });

  function inserirDocEmenda({ id, titulo, ano, data_publicacao, url_origem }) {
    mockConn
      .prepare(
        `INSERT INTO documentos (id, fonte, tipo, ano, titulo, data_publicacao, status_coleta, url_origem)
         VALUES (?, 'site_prefeitura', 'emenda_parlamentar', ?, ?, ?, 'ok', ?)`
      )
      .run(id, ano, titulo, data_publicacao, url_origem);
  }

  it('unifica Resolução N.10088/2025 (#645 e #649) discriminando as 2 indicações, higienizando gestor e vinculando ao empenho EO 03099-000', () => {
    inserirDocEmenda({
      id: 645,
      titulo: 'Emenda Parlamentar Estadual — Resolução N.10088/2025 — Dep. Sargento Rodrigues (PL)',
      ano: 2025,
      data_publicacao: '2026-02-23',
      url_origem: 'https://ritapolis.mg.gov.br/?pag=T1RjPU9EZz1PVFU9T1RrPU9UUT1PVEE9T0dVPVpXST1PVGs9&INT_ARQ=230751',
    });
    inserirDocEmenda({
      id: 649,
      titulo: 'Emenda Parlamentar Estadual — Resolução N.10088/2025 — Dep. Sargento Rodrigues (PL)',
      ano: 2025,
      data_publicacao: '2026-02-23',
      url_origem: 'https://ritapolis.mg.gov.br/?pag=T1RjPU9EZz1PVFU9T1RrPU9UUT1PVEE9T0dVPVpXST1PVGs9&INT_ARQ=230753',
    });

    mockConn
      .prepare(
        `INSERT INTO transparencia_despesas
           (id, exercicio_orcamento, empenho, tipo, data_empenho, data_pagamento, credor_cnpj, credor_nome, credor_chave, valor, historico, hash_despesa)
         VALUES (99, 2025, '03099-000', 'EO - Empenho Ordinário', '2025-10-08', '2025-10-08', '37480200000105', 'MP MAQUINAS LTDA', '37480200000105', 140900, 'AQUISIÇÃO DE 01 VEICULO 0KM', 'h99')`
      )
      .run();

    const baseCampos = {
      esfera: 'estadual',
      numero_emenda: 'Resolução N.10088/2025',
      nome_parlamentar: 'Sargento Rodrigues',
      cargo_parlamentar: 'Deputado Estadual',
      partido: 'PL',
      tipo_emenda: 'Impositiva',
      tipo_transferencia: 'Fundo a Fundo',
      objeto: 'Aquisição de veículo para saúde',
      objeto_detalhado: 'Aquisição de 01 veículo 07 lugares',
      valor_contrapartida: 0,
      orgao_transferidor: 'Fundo Estadual de Saúde',
      instrumento_legal: 'Resolução SES/MG Nº 10.088/2025',
      categoria_economica: 'Capital',
      unidade_executora: 'Secretaria Municipal de Saúde',
      gestor_responsavel: 'Alan Kardec C. de Almeida BANCO: Banco do Brasil AGÊNCIA: 0162-7 CONTA BANCÁRIA: 39.295-2',
      data_inicio: '2025-05-09',
      data_termino: '2028-05-09',
      data_recebimento: '2025-06-27',
      dados_despesa: 'Nº DO EMPENHO: 03099-000 Nº DA LIQUIDAÇÃO: 03099-000 Nº DA ORDEM DE PAGAMENTO: 03099-000',
    };

    salvarEmendaDetalhes(645, { ...baseCampos, valor_repasse: 73490, valor_repasse_raw: 'R$ 73.490,00' });
    salvarEmendaDetalhes(649, { ...baseCampos, valor_repasse: 76510, valor_repasse_raw: 'R$ 76.510,00' });

    // Filtrando por 2025 (ano do instrumento) ou 2026 (ano de publicação) retorna a emenda unificada
    const em2025 = listarEmendas({ ano: 2025 });
    const em2026 = listarEmendas({ ano: 2026 });

    expect(em2025).toHaveLength(1);
    expect(em2026).toHaveLength(1);
    expect(contarEmendas({ ano: 2025 })).toBe(1);
    expect(contarEmendas({ ano: 2026 })).toBe(1);

    const emenda = em2025[0];
    expect(emenda.valor_repasse).toBe(150000);
    expect(emenda.gestor_responsavel).toBe('Alan Kardec C. de Almeida');
    expect(emenda.divergencia_ano_publicacao).toBe(true);
    expect(emenda.ano_instrumento).toBe(2025);
    expect(emenda.ano_publicacao).toBe(2026);
    expect(emenda.emenda_unificada).toBe(true);
    expect(emenda.indicacoes_discriminadas).toHaveLength(2);
    expect(emenda.indicacoes_discriminadas.map((i) => i.valor_repasse)).toEqual([73490, 76510]);
    expect(emenda.empenhos_discriminados).toEqual([
      expect.objectContaining({
        numero_empenho: '03099-000',
        despesa_id: 99,
        credor_nome: 'MP MAQUINAS LTDA',
        valor_empenhado: 140900,
      }),
    ]);

    // getEmendaById retorna a versão unificada tanto para 645 quanto para 649
    expect(getEmendaById(645).valor_repasse).toBe(150000);
    expect(getEmendaById(649).valor_repasse).toBe(150000);

    // totaisPorAno e parlamentaresComTotais não inflam contagem de emendas
    expect(totaisPorAno()).toEqual([
      expect.objectContaining({
        ano: 2025,
        ano_publicacao: 2026,
        total_emendas: 1,
        soma_repasse: 150000,
      }),
    ]);
    expect(parlamentaresComTotais({ ano: 2025 })).toEqual([
      expect.objectContaining({
        nome_parlamentar: 'Sargento Rodrigues',
        total_emendas: 1,
        soma_repasse: 150000,
      }),
    ]);
  });
});
