'use strict';

const {
  extrairProcessoCitado,
  processoDoTitulo,
  extrairValorContrato,
  trechoDoValor,
  localizarValorContrato,
  detectarEmpenhadoAcimaContratado,
} = require('./empenhado-acima-contratado');

const CNPJ_VERDAM = '23162312000105';

function processoVerdam(extra = {}) {
  return {
    documento_id: 12,
    titulo: 'Processo 0019/2026 - Adesão Ata Registro Preço - CIGEDAS nº 005/2026 - Supressão de 10 Arvores',
    vencedor_cnpj: '23.162.312/0001-05',
    texto: 'CLÁUSULA QUARTA – DO VALOR 4.1. A contratação tem valor total de R$ 9.184,00 (Nove mil cento e oitenta e quatro reais).',
    ...extra,
  };
}

function empenho(extra = {}) {
  const id = extra.id || 1;
  return {
    id,
    empenho: `0144${id}-000`,
    credor_nome: 'VERDAM LTDA',
    credor_cnpj: CNPJ_VERDAM,
    valor: 9184,
    tipo: 'EO',
    exercicio_orcamento: 2026,
    historico: 'PODAS E SUPRESSÕES CONFORME PROCESSO LICITATÓRIO N°19/2026, ADESÃO N°005/2026',
    ...extra,
  };
}

describe('EmpenhadoAcimaContratado', () => {
  describe('extrairProcessoCitado', () => {
    it('extrai número e ano com ano de dois dígitos', () => {
      expect(extrairProcessoCitado('CONFORME PROCESSO LICITATÓRIO N°18/25 E ADESÃO')).toEqual({ numero: 18, ano: 2025 });
    });

    it('aceita zeros à esquerda, ponto e sem acento', () => {
      expect(extrairProcessoCitado('PROCESSO LICITATORIO Nº 0018/2025')).toEqual({ numero: 18, ano: 2025 });
    });

    it('retorna null sem citação de processo', () => {
      expect(extrairProcessoCitado('EMPENHO ESTIMATIVO PARA VALE ALIMENTAÇÃO')).toBeNull();
      expect(extrairProcessoCitado(null)).toBeNull();
    });
  });

  describe('processoDoTitulo', () => {
    it('lê o número do processo no título do documento', () => {
      expect(processoDoTitulo('Processo 0019/2026 - Adesão nº 005/2026')).toEqual({ numero: 19, ano: 2026 });
    });

    it('retorna null para título sem processo', () => {
      expect(processoDoTitulo('Decreto 12/2026')).toBeNull();
    });
  });

  describe('extrairValorContrato', () => {
    it('lê "valor total de R$"', () => {
      expect(extrairValorContrato(processoVerdam().texto)).toBe(9184);
    });

    it('lê "Valor do contrato: R$" do extrato', () => {
      expect(extrairValorContrato('Valor do contrato: R$ 38.500,00 (trinta e oito mil).')).toBe(38500);
    });

    it('descarta valor mensal ou anual', () => {
      const texto = 'Valor do contrato: R$ 24.000,00 (Vinte e quatro mil reais) por ano sendo R$ 2.000,00 mês.';

      expect(extrairValorContrato(texto)).toBeNull();
    });

    it('descarta texto com valores diferentes (ambíguo)', () => {
      const texto = 'Valor do contrato: R$ 10.000,00. Lote 2. Valor do contrato: R$ 20.000,00.';

      expect(extrairValorContrato(texto)).toBeNull();
    });

    it('lê "Valor Global – R$" e "Preço Global: R$"', () => {
      expect(extrairValorContrato('Empresa X – CNPJ nº 1 – Valor Global – R$ 182.843,19 (Cento e oitenta)')).toBe(182843.19);
      expect(extrairValorContrato('3.1. Preço Global: R$ 394.619,20 (Trezentos e noventa)')).toBe(394619.2);
    });

    it('descarta preço global seguido de "anual"', () => {
      expect(extrairValorContrato('3.1 . Preço Global: R$ 64.800,00 (Sessenta e quatro mil) anual')).toBeNull();
    });

    it('descarta valor por unidade de medida', () => {
      expect(extrairValorContrato('valor total de R$ 4,35 (quatro reais) por ponto de iluminação')).toBeNull();
    });

    it('aceita o mesmo valor repetido', () => {
      const texto = 'Valor do contrato: R$ 38.500,00. Valor do contrato: R$ 38.500,00.';

      expect(extrairValorContrato(texto)).toBe(38500);
    });
  });

  describe('localizarValorContrato', () => {
    it('aponta o anexo de onde o valor foi lido', () => {
      const fontes = [
        { anexo_id: null, nome: null, texto: 'Processo sem valor' },
        { anexo_id: 55, nome: 'Extrato do contrato.pdf', texto: 'Valor do contrato: R$ 38.500,00 (trinta e oito mil).' },
      ];

      expect(localizarValorContrato(fontes)).toMatchObject({
        valor: 38500,
        anexo_id: 55,
        anexo_nome: 'Extrato do contrato.pdf',
        trecho: expect.stringContaining('R$ 38.500,00'),
      });
    });

    it('é ambíguo quando anexos trazem valores diferentes', () => {
      const fontes = [
        { anexo_id: 1, texto: 'Valor do contrato: R$ 10.000,00.' },
        { anexo_id: 2, texto: 'Valor do contrato: R$ 20.000,00.' },
      ];

      expect(localizarValorContrato(fontes)).toBeNull();
    });

    it('um valor periódico em qualquer anexo anula a leitura', () => {
      const fontes = [
        { anexo_id: 1, texto: 'Valor do contrato: R$ 24.000,00.' },
        { anexo_id: 2, texto: 'Valor total de R$ 24.000,00 por ano.' },
      ];

      expect(localizarValorContrato(fontes)).toBeNull();
    });
  });

  describe('trechoDoValor', () => {
    it('devolve o trecho literal em volta do valor', () => {
      expect(trechoDoValor(processoVerdam().texto)).toMatch(/valor total de R\$ 9\.184,00/);
    });

    it('mascara CPF no trecho (sai no payload público)', () => {
      const texto = 'Signatário CPF 123.456.789-09, valor total de R$ 9.184,00.';

      expect(trechoDoValor(texto)).not.toMatch(/123\.456\.789-09/);
    });

    it('devolve null sem valor', () => {
      expect(trechoDoValor('nada')).toBeNull();
    });
  });

  describe('detectarEmpenhadoAcimaContratado', () => {
    it('aponta empenhos do vencedor que somam acima do contrato', () => {
      // Arrange
      const empenhos = [empenho(), empenho({ id: 2, empenho: '01588-000', valor: 46848.83 })];

      // Act
      const sinais = detectarEmpenhadoAcimaContratado({ processos: [processoVerdam()], empenhos });

      // Assert
      expect(sinais).toHaveLength(1);
      expect(sinais[0]).toMatchObject({
        documento_id: 12,
        processo: '19/2026',
        credor_cnpj: CNPJ_VERDAM,
        valor_contrato: 9184,
        valor_empenhado: 56032.83,
        empenho_ids: [1, 2],
        trecho_contrato: expect.stringContaining('R$ 9.184,00'),
        ano_inicio: 2026,
        ano_fim: 2026,
      });
      expect(sinais[0].razao).toBeCloseTo(6.1, 1);
    });

    it('não aponta quando o excesso fica dentro de 25% (aditivo legal)', () => {
      const empenhos = [empenho({ valor: 11000 })];

      expect(detectarEmpenhadoAcimaContratado({ processos: [processoVerdam()], empenhos })).toEqual([]);
    });

    it('não aponta excesso abaixo do mínimo absoluto', () => {
      const processos = [processoVerdam({ texto: 'valor total de R$ 400,00' })];
      const empenhos = [empenho({ valor: 4464 })];

      expect(detectarEmpenhadoAcimaContratado({ processos, empenhos })).toEqual([]);
    });

    it('ignora ordem de pagamento, que repete o empenho', () => {
      const empenhos = [empenho(), empenho({ id: 2, tipo: 'OP - Ordem de Pagamento', valor: 46848.83 })];

      expect(detectarEmpenhadoAcimaContratado({ processos: [processoVerdam()], empenhos })).toEqual([]);
    });

    it('ignora empenho de outro credor quando o vencedor é conhecido', () => {
      const empenhos = [empenho(), empenho({ id: 2, credor_cnpj: '00000000000191', valor: 46848.83 })];

      expect(detectarEmpenhadoAcimaContratado({ processos: [processoVerdam()], empenhos })).toEqual([]);
    });

    it('sem vencedor conhecido, só aponta quando um único credor cita o processo', () => {
      const processos = [processoVerdam({ vencedor_cnpj: null })];
      const doisCredores = [empenho({ valor: 30000 }), empenho({ id: 2, credor_cnpj: '00000000000191', valor: 30000 })];

      expect(detectarEmpenhadoAcimaContratado({ processos, empenhos: doisCredores })).toEqual([]);
      expect(detectarEmpenhadoAcimaContratado({ processos, empenhos: [empenho({ valor: 30000 })] })).toHaveLength(1);
    });

    it('ignora consórcio público (contrato de rateio tem outra lógica)', () => {
      const empenhos = [empenho({ credor_nome: 'CISVER-CONS.INTERMUNICIPAL DE SAUDE', valor: 1500000 })];
      const processos = [processoVerdam({ vencedor_cnpj: null })];

      expect(detectarEmpenhadoAcimaContratado({ processos, empenhos })).toEqual([]);
    });

    it('leva o anexo do contrato para o sinal', () => {
      const processos = [processoVerdam({ texto: '', fontes: [{ anexo_id: 77, nome: 'Contrato.pdf', texto: processoVerdam().texto }] })];
      const empenhos = [empenho(), empenho({ id: 2, valor: 46848.83 })];

      const [sinal] = detectarEmpenhadoAcimaContratado({ processos, empenhos });

      expect(sinal).toMatchObject({ valor_contrato: 9184, anexo_id: 77, anexo_nome: 'Contrato.pdf' });
    });

    it('ignora processo sem valor de contrato legível', () => {
      const processos = [processoVerdam({ texto: 'sem valor' })];

      expect(detectarEmpenhadoAcimaContratado({ processos, empenhos: [empenho({ valor: 90000 })] })).toEqual([]);
    });

    it('não confunde processos de anos diferentes com o mesmo número', () => {
      const empenhos = [empenho({ historico: 'CONFORME PROCESSO LICITATÓRIO N°19/2025', valor: 90000 })];

      expect(detectarEmpenhadoAcimaContratado({ processos: [processoVerdam()], empenhos })).toEqual([]);
    });
    it('ignora credor sem CNPJ ou pessoa física (não junta nem nomeia pessoas)', () => {
      const processos = [processoVerdam({ vencedor_cnpj: null })];
      const semCnpj = [empenho({ credor_cnpj: null, valor: 30000 }), empenho({ id: 2, credor_cnpj: null, credor_nome: 'OUTRO', valor: 30000 })];
      const pf = [empenho({ credor_cnpj: '123.456.789-09', credor_nome: 'FULANO', valor: 60000 })];

      expect(detectarEmpenhadoAcimaContratado({ processos, empenhos: semCnpj })).toEqual([]);
      expect(detectarEmpenhadoAcimaContratado({ processos, empenhos: pf })).toEqual([]);
    });

    it('conta uma vez o mesmo empenho recoletado em duas linhas', () => {
      const empenhos = [empenho({ valor: 46848.83 }), empenho({ id: 2, empenho: '01441-000', valor: 46848.83 })];

      const [sinal] = detectarEmpenhadoAcimaContratado({ processos: [processoVerdam()], empenhos });

      expect(sinal.valor_empenhado).toBe(46848.83);
      expect(sinal.empenho_ids).toEqual([1]);
    });
  });
});
