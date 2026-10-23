'use strict';

const {
  formatarMetricaAlerta,
  descreverRegra,
  linksDaEvidencia,
  situacaoGate,
  rotuloMotivo,
  tituloEvidencia,
  formatarPar,
  liberadoParaPublicar,
  MOTIVOS_DESCARTE_OPCOES,
} = require('../frontend/lib/alerta-revisao');

const URL_ANEXO = 'https://prefeitura.example/arquivo?id=1';
const URL_LISTAGEM = 'https://prefeitura.example/pagina/editais';

describe('alerta-revisao', () => {
  describe('formatarMetricaAlerta', () => {
    it('mostra contagem com a unidade, nunca como R$', () => {
      // Arrange
      const alerta = { valor_total: 70, metadados: { unidade: 'arvores' } };

      // Act
      const metrica = formatarMetricaAlerta(alerta);

      // Assert
      expect(metrica).toEqual({ texto: '70 árvores', monetario: false });
    });

    it('mostra processos de evento como documentos', () => {
      const metrica = formatarMetricaAlerta({ valor_total: 7, metadados: { unidade: 'documentos' } });

      expect(metrica.texto).toBe('7 documentos');
    });

    it('formata em reais quando a unidade é R$', () => {
      const metrica = formatarMetricaAlerta({ valor_total: 1234.5, metadados: { unidade: 'R$' } });

      expect(metrica.monetario).toBe(true);
      expect(metrica.texto).toMatch(/R\$\s?1\.234,50/);
    });

    it('mantém reais para alerta antigo sem unidade', () => {
      const metrica = formatarMetricaAlerta({ valor_total: 500000, metadados: {} });

      expect(metrica.monetario).toBe(true);
    });

    it('devolve null sem valor', () => {
      expect(formatarMetricaAlerta({ valor_total: null })).toBeNull();
      expect(formatarMetricaAlerta({ valor_total: 0, metadados: {} })).toBeNull();
    });
  });

  describe('descreverRegra', () => {
    it('explica a regra da investigação factual', () => {
      const regra = descreverRegra({ metadados: { investigacao_tipo: 'contratos.recorrencia_fornecedor_objeto' } });

      expect(regra.codigo).toBe('contratos.recorrencia_fornecedor_objeto');
      expect(regra.nome).toMatch(/fornecedor/i);
      expect(regra.explicacao.length).toBeGreaterThan(20);
    });

    it('aceita o código antigo das árvores', () => {
      const regra = descreverRegra({ metadados: { investigacao_tipo: 'supressao_arvores' } });

      expect(regra.nome).toMatch(/árvores/);
    });

    it('explica o gasto atípico pela subcategoria', () => {
      const regra = descreverRegra({ tipo: 'gasto_atipico', subcategoria: 'gasto_atipico_salto' });

      expect(regra.codigo).toBe('gasto_atipico_salto');
    });

    it('explica o empenhado acima do contratado pela subcategoria', () => {
      const regra = descreverRegra({ tipo: 'execucao_contratual', subcategoria: 'empenhado_acima_contratado' });

      expect(regra.nome).toBe('Empenhado acima do contratado');
    });

    it('lista os sinais do detector antigo', () => {
      const regra = descreverRegra({ metadados: { sinais: ['repeticao_tematica', 'valor_relevante'] } });

      expect(regra.codigo).toBe('legado');
      expect(regra.explicacao).toMatch(/repetição/i);
    });

    it('não quebra com regra desconhecida', () => {
      const regra = descreverRegra({ metadados: { investigacao_tipo: 'novo.tipo' } });

      expect(regra.codigo).toBe('novo.tipo');
      expect(regra.nome).toBe('novo.tipo');
    });
  });

  describe('linksDaEvidencia', () => {
    it('prefere o arquivo do anexo e mantém a página da fonte', () => {
      const evidencia = { documento_id: 10, anexo_url: URL_ANEXO, metadados: { url_origem: URL_LISTAGEM } };

      const links = linksDaEvidencia(evidencia, new Map());

      expect(links.map((l) => l.tipo)).toEqual(['arquivo', 'origem', 'interno']);
      expect(links[0].url).toBe(URL_ANEXO);
      expect(links[2].url).toBe('/documento/10');
    });

    it('usa as URLs do documento vinculado e não repete link', () => {
      const documentos = new Map([[10, { documento_id: 10, url_pdf: URL_ANEXO, url_origem: URL_LISTAGEM }]]);

      const links = linksDaEvidencia({ documento_id: 10, metadados: { url_origem: URL_LISTAGEM } }, documentos);

      expect(links.filter((l) => l.url === URL_LISTAGEM)).toHaveLength(1);
      expect(links[0]).toMatchObject({ tipo: 'arquivo', url: URL_ANEXO });
    });

    it('liga empenho ao portal e à página interna', () => {
      const links = linksDaEvidencia({ metadados: { empenho_id: 5, portal_url: URL_ANEXO } }, new Map());

      expect(links.map((l) => l.url)).toEqual([URL_ANEXO, '/empenho/5']);
    });

    it('ignora URL que não é http', () => {
      const links = linksDaEvidencia({ anexo_url: 'javascript:alert(1)', metadados: {} }, new Map());

      expect(links).toEqual([]);
    });
  });

  describe('situacaoGate', () => {
    it('permite publicar com gate factual aprovado', () => {
      const alerta = { metadados: { discovery_v3: { qualidade: { factual_status: 'aprovado', status: 'aprovado' } } } };

      expect(situacaoGate(alerta)).toMatchObject({ investigado: true, podePublicar: true });
    });

    it('explica o bloqueio quando a IA ainda não investigou', () => {
      const situacao = situacaoGate({ metadados: { discovery_kind: 'investigacao_factual' } });

      expect(situacao.podePublicar).toBe(false);
      expect(situacao.bloqueio).toMatch(/Reprocessar/);
    });

    it('explica o bloqueio quando o gate reprovou', () => {
      const alerta = { metadados: { discovery_v3: { qualidade: { factual_status: 'reprovado', motivos: ['X'] } } } };

      const situacao = situacaoGate(alerta);

      expect(situacao.podePublicar).toBe(false);
      expect(situacao.motivos).toEqual(['X']);
    });
  });

  describe('rotuloMotivo', () => {
    it('traduz motivo de descarte, nota e revalidação', () => {
      expect(rotuloMotivo('ADMIN_FALSO_POSITIVO')).toBe('Descartado: falso positivo');
      expect(rotuloMotivo('NOTA: texto livre')).toBe('Nota do revisor: texto livre');
      expect(rotuloMotivo('REVALIDACAO_NOME_PLACEHOLDER')).toMatch(/^Revalidação:/);
    });

    it('cobre todas as opções de descarte', () => {
      for (const opcao of MOTIVOS_DESCARTE_OPCOES) {
        expect(rotuloMotivo(opcao.codigo)).not.toBe(opcao.codigo);
      }
    });
  });
  describe('tituloEvidencia', () => {
    it('usa o título do documento quando existe', () => {
      expect(tituloEvidencia({ id: 3, documento_titulo: 'Processo 19/2026' })).toBe('Processo 19/2026');
    });

    it('nomeia o empenho com número e exercício', () => {
      const e = { id: 4, papel: 'empenho', metadados: { empenho: '01588-000', exercicio: 2026 } };

      expect(tituloEvidencia(e)).toBe('Empenho 01588-000 (2026)');
    });

    it('nomeia evidência de quadro societário e de folha pelo papel', () => {
      expect(tituloEvidencia({ id: 5, papel: 'quadro_societario' })).toBe('Quadro societário (Receita Federal)');
      expect(tituloEvidencia({ id: 6, papel: 'folha' })).toBe('Folha de pagamento da Prefeitura');
    });

    it('cai no id quando não há nada melhor', () => {
      expect(tituloEvidencia({ id: 9 })).toBe('Evidência #9');
    });
  });

  describe('formatarPar', () => {
    it('formata chaves de valor e excesso em reais', () => {
      expect(formatarPar('valor_contrato', 9184)).toMatch(/R\$\s?9\.184,00/);
      expect(formatarPar('excesso', 46848.83)).toMatch(/R\$\s?46\.848,83/);
    });

    it('mantém razão e contagem como número', () => {
      expect(formatarPar('razao', 6.1)).toBe('6,1');
      expect(formatarPar('empenhos', 2)).toBe('2');
    });

    it('trata vazio, lista e texto', () => {
      expect(formatarPar('x', null)).toBe('—');
      expect(formatarPar('x', ['a', 'b'])).toBe('a, b');
      expect(formatarPar('cnpj', '123')).toBe('123');
    });
  });
  describe('gate determinístico na tela', () => {
    const GATE_DET = { aplicavel: true, campos: ['valor do contrato', 'aditivos'] };

    function deterministico(pendencias = []) {
      return { metadados: {}, gate_deterministico: GATE_DET, revalidacao: { pendencias } };
    }

    it('situacaoGate reconhece alerta determinístico e não pede a IA', () => {
      const situacao = situacaoGate(deterministico());

      expect(situacao.deterministico).toBe(true);
      expect(situacao.campos).toEqual(GATE_DET.campos);
      expect(situacao.bloqueio).not.toMatch(/IA/);
    });

    it('libera só com todos os campos marcados e sem pendência', () => {
      const situacao = situacaoGate(deterministico());

      expect(liberadoParaPublicar(situacao, new Set(['aditivos']))).toBe(false);
      expect(liberadoParaPublicar(situacao, new Set(GATE_DET.campos))).toBe(true);
    });

    it('pendência da revalidação bloqueia mesmo com tudo marcado', () => {
      const situacao = situacaoGate(deterministico([{ codigo: 'SEM_FONTE', mensagem: 'sem link' }]));

      expect(liberadoParaPublicar(situacao, new Set(GATE_DET.campos))).toBe(false);
      expect(situacao.bloqueio).toMatch(/sem link/);
    });

    it('alerta da IA segue o gate factual', () => {
      const alerta = { metadados: { discovery_v3: { qualidade: { factual_status: 'aprovado' } } } };

      expect(liberadoParaPublicar(situacaoGate(alerta), new Set())).toBe(true);
    });

    it('alerta interno nunca libera publicação e não pede conferência', () => {
      const alerta = {
        metadados: {},
        gate_deterministico: { aplicavel: true, somenteAdmin: true, campos: [], bloqueio: 'Alerta interno: não pode ser publicado.' },
        revalidacao: { pendencias: [] },
      };

      const situacao = situacaoGate(alerta);

      expect(situacao.somenteAdmin).toBe(true);
      expect(situacao.campos).toEqual([]);
      expect(situacao.bloqueio).toMatch(/interno/);
      expect(liberadoParaPublicar(situacao, new Set())).toBe(false);
    });

    it('descreve a regra do sócio que é servidor', () => {
      const regra = descreverRegra({ tipo: 'conflito_interesse', subcategoria: 'socio_servidor', metadados: {} });

      expect(regra.nome).toMatch(/Sócio/);
      expect(regra.explicacao).toMatch(/homônimo/);
    });

    it('rotula a conferência no histórico', () => {
      expect(rotuloMotivo('CONFERIDO: aditivos')).toBe('Conferido pelo revisor: aditivos');
    });
  });
});
