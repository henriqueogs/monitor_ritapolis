'use strict';

const ColetorBase = require('./base');
const logger = require('../logger');

const PNCP_API = 'https://pncp.gov.br/api/consulta/v1';

// CNPJs dos órgãos do município de Ritápolis
const ORGAOS = [
  { cnpj: '18557553000105', nome: 'Prefeitura Municipal de Ritápolis' },
  { cnpj: '26148056000181', nome: 'Câmara Municipal de Ritápolis' },
];

const MODALIDADES = {
  1: 'Leilão Eletrônico',
  2: 'Diálogo Competitivo',
  3: 'Concurso',
  4: 'Concorrência Eletrônica',
  5: 'Concorrência Presencial',
  6: 'Pregão Eletrônico',
  7: 'Pregão Presencial',
  8: 'Dispensa de Licitação',
  9: 'Inexigibilidade',
  10: 'Manifestação de Interesse',
  11: 'Pré-qualificação',
  12: 'Credenciamento',
  13: 'Leilão Presencial',
};

function formatDateParam(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function toIsoDate(str) {
  if (!str) {
    return null;
  }
  const m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function inferTipoFromModalidade(codigoModalidade) {
  const codigo = Number(codigoModalidade);
  if ([6, 7, 4, 5].includes(codigo)) {
    return 'edital';
  }
  if ([8, 9].includes(codigo)) {
    return 'edital';
  }
  if ([3, 11, 12].includes(codigo)) {
    return 'edital';
  }
  return 'edital';
}

function buildNumero(compra) {
  const controle = String(compra.numeroControlePNCP || '').match(/^\d{14}-1-(\d+)\/(\d{4})$/);
  const sequencial = compra.sequencialCompra || controle?.[1];
  const ano = compra.anoCompra || controle?.[2];
  if (!sequencial || !ano) {
    throw new Error('PNCP: identificador oficial incompleto (compra)');
  }
  const seq = String(sequencial).padStart(6, '0');
  return `${seq}/${ano}`;
}

function valorOficial(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function buildSourceUrl(record, orgao, kind) {
  const cnpj = String(orgao.cnpj);
  const reported = record.orgaoEntidade?.cnpj;
  if (reported && String(reported) !== cnpj) {
    throw new Error('PNCP: orgao diverge da fonte consultada');
  }
  const controle = String(record.numeroControlePNCP || '').match(
    /^(\d{14})-([12])-(\d+)\/(\d{4})$/
  );
  if (controle && controle[1] !== cnpj) {
    throw new Error('PNCP: identificador pertence a outro orgao');
  }
  const positive = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
  if (kind === 'compra') {
    const ano = record.anoCompra || (controle?.[2] === '1' ? controle[4] : null);
    const seq = record.sequencialCompra || (controle?.[2] === '1' ? controle[3] : null);
    if (positive(ano) && positive(seq)) {
      return `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${Number(seq)}`;
    }
  }
  if (kind === 'contrato') {
    const ano = record.anoContrato || (controle?.[2] === '2' ? controle[4] : null);
    const seq = record.sequencialContrato || (controle?.[2] === '2' ? controle[3] : null);
    if (positive(ano) && positive(seq)) {
      return `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/contratos/${ano}/${Number(seq)}`;
    }
  }
  if (kind === 'ata') {
    const compra = String(
      record.numeroControlePNCPCompra || record.numeroControlePncpCompra || ''
    ).match(/^(\d{14})-1-(\d+)\/(\d{4})$/);
    if (compra && compra[1] !== cnpj) {
      throw new Error('PNCP: contratacao da ata pertence a outro orgao');
    }
    const ano = record.anoCompra || compra?.[3];
    const seq = record.sequencialCompra || compra?.[2];
    if (positive(ano) && positive(seq) && positive(record.sequencialAta)) {
      return `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/compras/${ano}/${Number(seq)}/atas/${Number(record.sequencialAta)}`;
    }
  }
  // No guessed link, publication year or invented identifier.
  throw new Error(`PNCP: identificador oficial incompleto (${kind})`);
}

class ColetorPncp extends ColetorBase {
  constructor() {
    super({ fonte: 'pncp' });
  }

  async fetchJson(path, params = {}) {
    const url = `${PNCP_API}${path}`;
    const searchParams = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
    ).toString();
    const fullUrl = searchParams ? `${url}?${searchParams}` : url;

    // 404 não deve ser retentado — é resposta definitiva do PNCP
    const step = `pncp-fetch:${fullUrl}`;
    const saved = this.progress?.load(step);
    if (saved) {
      return saved.data;
    }
    this.progress?.checkTime();
    const response = await this.buscarComRetry(fullUrl, {
      responseType: 'text',
      headers: { accept: 'application/json' },
      validateStatus: status => status < 500,
    });

    if (response.status === 404 || response.status === 204) {
      this.progress?.save(step, { data: null });
      return null;
    }
    if (response.status >= 400) {
      throw new Error(`PNCP HTTP ${response.status}`);
    }
    const text = typeof response.data === 'string' ? response.data : String(response.data || '');
    if (!text || text.includes('Request Rejected')) {
      throw new Error('PNCP: resposta bloqueada ou vazia');
    }

    try {
      const data = JSON.parse(text);
      this.progress?.save(step, { data });
      return data;
    } catch {
      throw new Error('PNCP: resposta JSON invalida');
    }
  }

  async coletarComprasOrgao(orgao, resultado) {
    const { cnpj, nome } = orgao;
    const anosParaBuscar = [];
    const anoAtual = new Date().getFullYear();
    for (let ano = 2023; ano <= anoAtual; ano++) {
      anosParaBuscar.push(ano);
    }

    for (const ano of anosParaBuscar) {
      let seq = 1;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          const compra = await this.fetchJson(`/orgaos/${cnpj}/compras/${ano}/${seq}`);
          if (!compra) {
            break;
          } // 404 ou sem dados

          const step = `pncp-compra:${cnpj}:${ano}:${seq}`;
          if (!this.progress?.load(step)?.done) {
            this.progress?.checkTime();
            this.salvarCompra(compra, orgao, resultado);
            this.progress?.save(step, { done: true });
          }
          seq++;
        } catch (err) {
          this.registrarErroItem(resultado, { cnpj, nome, ano, seq }, err);
          break;
        }
      }
    }
  }

  async coletarAtasOrgao(orgao, resultado) {
    const { cnpj } = orgao;
    const anoAtual = new Date().getFullYear();

    for (let ano = 2023; ano <= anoAtual; ano++) {
      const dataInicial = formatDateParam(new Date(`${ano}-01-01`));
      const dataFinal = formatDateParam(new Date(`${ano}-12-31`));

      let pagina = 1;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          const data = await this.fetchJson('/atas', {
            dataInicial,
            dataFinal,
            cnpj,
            pagina,
            tamanhoPagina: 50,
          });
          if (!data) {
            break;
          }

          const atas = data.data || [];
          if (!atas.length) {
            break;
          }

          for (const ata of atas) {
            const step = `pncp-ata:${this.calcularHash(JSON.stringify(ata))}`;
            if (!this.progress?.load(step)?.done) {
              this.progress?.checkTime();
              await this.salvarAta(ata, orgao, resultado);
              this.progress?.save(step, { done: true });
            }
          }

          if (atas.length < 50) {
            break;
          }
          pagina++;
        } catch (err) {
          if (err.response?.status === 404) {
            break;
          }
          this.registrarErroItem(resultado, { tipo: 'ata', cnpj, ano, pagina }, err);
          break;
        }
      }
    }
  }

  async coletarContratosOrgao(orgao, resultado) {
    const { cnpj } = orgao;
    const anoAtual = new Date().getFullYear();

    for (let ano = 2023; ano <= anoAtual; ano++) {
      const dataInicial = formatDateParam(new Date(`${ano}-01-01`));
      const dataFinal = formatDateParam(new Date(`${ano}-12-31`));

      let pagina = 1;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          const data = await this.fetchJson('/contratos', {
            dataInicial,
            dataFinal,
            cnpjOrgao: cnpj,
            pagina,
            tamanhoPagina: 50,
          });
          if (!data) {
            break;
          }

          const contratos = data.data || [];
          if (!contratos.length) {
            break;
          }

          for (const contrato of contratos) {
            const step = `pncp-contrato:${this.calcularHash(JSON.stringify(contrato))}`;
            if (!this.progress?.load(step)?.done) {
              this.progress?.checkTime();
              await this.salvarContrato(contrato, orgao, resultado);
              this.progress?.save(step, { done: true });
            }
          }

          if (contratos.length < 50) {
            break;
          }
          pagina++;
        } catch (err) {
          if (err.response?.status === 404) {
            break;
          }
          this.registrarErroItem(resultado, { tipo: 'contrato', cnpj, ano, pagina }, err);
          break;
        }
      }
    }
  }

  salvarCompra(compra, orgao, resultado) {
    const modalidadeNome =
      compra.modalidadeNome ||
      MODALIDADES[compra.modalidadeId] ||
      MODALIDADES[compra.codigoModalidadeContratacao] ||
      'Licitação';
    const numero = buildNumero(compra);
    const ano = Number(numero.split('/')[1]);
    const dataPublicacao = toIsoDate(compra.dataPublicacaoPncp);
    const dataAbertura = toIsoDate(compra.dataAberturaProposta);
    const titulo = [`${modalidadeNome} ${numero}`, compra.objetoCompra]
      .filter(Boolean)
      .join(' — ')
      .slice(0, 500);

    const texto = [
      `Órgão: ${orgao.nome}`,
      `CNPJ: ${orgao.cnpj}`,
      `Modalidade: ${modalidadeNome}`,
      `Número: ${numero}`,
      `Objeto: ${compra.objetoCompra || ''}`,
      `Valor estimado: ${compra.valorTotalEstimado ?? ''}`,
      `Número de controle PNCP: ${compra.numeroControlePNCP || ''}`,
      `Data de publicação: ${dataPublicacao || ''}`,
      `Data de abertura: ${dataAbertura || ''}`,
    ]
      .filter(Boolean)
      .join('\n');

    const urlOrigem = buildSourceUrl(compra, orgao, 'compra');

    this.salvarDocumento(
      {
        fonte: this.fonte,
        tipo: inferTipoFromModalidade(compra.codigoModalidadeContratacao),
        numero,
        ano,
        titulo,
        resumo: this.resumirTexto(compra.objetoCompra || titulo),
        data_publicacao: dataPublicacao,
        data_abertura: dataAbertura,
        valor_estimado: valorOficial(compra.valorTotalEstimado),
        url_origem: urlOrigem,
        url_pdf: null,
        texto_completo: texto,
        dados_extras: {
          pncp: compra,
          orgao,
          tipo_pncp: 'compra',
        },
        hash_conteudo: this.calcularHash(
          `pncp-compra-${compra.numeroControlePNCP || `${orgao.cnpj}/${compra.anoCompra}/${compra.sequencialCompra}`}`
        ),
        status_coleta: 'sem_pdf',
        licitacao_detalhes: {
          modalidade: modalidadeNome,
          status: compra.situacaoCompraNome || null,
        },
      },
      resultado
    );
  }

  salvarAta(ata, orgao, resultado) {
    const numero =
      ata.numeroAtaRegistroPreco ||
      ata.numeroAta ||
      ata.numeroControle ||
      ata.numeroControlePNCP ||
      null;
    const dataPublicacao = toIsoDate(
      ata.dataPublicacaoPncp || ata.dataPublicacao || ata.dataAssinatura
    );
    const titulo = [
      numero ? `Ata ${numero}` : 'Ata de Registro de Preços',
      ata.objetoCompra || ata.objeto,
    ]
      .filter(Boolean)
      .join(' — ')
      .slice(0, 500);

    const texto = [
      `Órgão: ${orgao.nome}`,
      `Número de controle PNCP: ${ata.numeroControlePNCP || ''}`,
      `Objeto: ${ata.objetoCompra || ata.objeto || ''}`,
      `Fornecedor: ${ata.nomeRazaoSocialFornecedor || ''}`,
      `Valor: ${ata.valorTotal ?? ''}`,
      `Data de assinatura: ${toIsoDate(ata.dataAssinatura) || ''}`,
    ]
      .filter(Boolean)
      .join('\n');

    this.salvarDocumento(
      {
        fonte: this.fonte,
        tipo: 'ata',
        numero,
        ano: Number(ata.anoAta) || null,
        titulo,
        resumo: this.resumirTexto(ata.objetoCompra || ata.objeto || titulo),
        data_publicacao: dataPublicacao,
        data_abertura: null,
        valor_estimado: valorOficial(ata.valorTotal),
        url_origem: buildSourceUrl(ata, orgao, 'ata'),
        url_pdf: null,
        texto_completo: texto,
        dados_extras: { pncp: ata, orgao, tipo_pncp: 'ata' },
        hash_conteudo: this.calcularHash(
          `pncp-ata-${ata.numeroControlePNCP || JSON.stringify(ata)}`
        ),
        status_coleta: 'sem_pdf',
        licitacao_detalhes: null,
      },
      resultado
    );
  }

  salvarContrato(contrato, orgao, resultado) {
    const sourceUrl = buildSourceUrl(contrato, orgao, 'contrato');
    const numero =
      contrato.numeroContratoEmpenho ||
      contrato.numeroContrato ||
      contrato.numeroControlePNCP ||
      null;
    const dataPublicacao = toIsoDate(
      contrato.dataPublicacaoPncp || contrato.dataPublicacao || contrato.dataAssinatura
    );
    const titulo = [
      numero ? `Contrato ${numero}` : 'Contrato',
      contrato.objetoContrato || contrato.objeto,
    ]
      .filter(Boolean)
      .join(' — ')
      .slice(0, 500);

    const texto = [
      `Órgão: ${orgao.nome}`,
      `Número de controle PNCP: ${contrato.numeroControlePNCP || ''}`,
      `Objeto: ${contrato.objetoContrato || contrato.objeto || ''}`,
      `Fornecedor: ${contrato.nomeRazaoSocialFornecedor || ''}`,
      `Valor: ${contrato.valorInicial ?? ''}`,
      `Data de assinatura: ${toIsoDate(contrato.dataAssinatura) || ''}`,
    ]
      .filter(Boolean)
      .join('\n');

    this.salvarDocumento(
      {
        fonte: this.fonte,
        tipo: 'contrato',
        numero,
        ano: Number(contrato.anoContrato) || Number(sourceUrl.split('/').at(-2)),
        titulo,
        resumo: this.resumirTexto(contrato.objetoContrato || contrato.objeto || titulo),
        data_publicacao: dataPublicacao,
        data_abertura: null,
        valor_estimado: valorOficial(contrato.valorInicial),
        url_origem: sourceUrl,
        url_pdf: null,
        texto_completo: texto,
        dados_extras: { pncp: contrato, orgao, tipo_pncp: 'contrato' },
        hash_conteudo: this.calcularHash(
          `pncp-contrato-${contrato.numeroControlePNCP || JSON.stringify(contrato)}`
        ),
        status_coleta: 'sem_pdf',
        licitacao_detalhes: null,
      },
      resultado
    );
  }

  async executar(resultado) {
    for (const orgao of ORGAOS) {
      logger.info('PNCP: coletando compras do orgao', { cnpj: orgao.cnpj, nome: orgao.nome });
      await this.coletarComprasOrgao(orgao, resultado);

      logger.info('PNCP: coletando atas do orgao', { cnpj: orgao.cnpj });
      await this.coletarAtasOrgao(orgao, resultado);

      logger.info('PNCP: coletando contratos do orgao', { cnpj: orgao.cnpj });
      await this.coletarContratosOrgao(orgao, resultado);
    }
  }
}

module.exports = ColetorPncp;
module.exports.buildSourceUrl = buildSourceUrl;
