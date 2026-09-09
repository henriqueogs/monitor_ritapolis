'use strict';

// Coletor: projetos de lei em tramitação + vereadores/mandatos da Câmara
// Municipal (SGC). Domínio novo (processo/pessoa em andamento), separado da
// legislação promulgada (camara-legislacao.js, que reaproveita `documentos`).
//
// Achado real 09/09/2026: buscarVereadoresPelaBusca.php e
// buscarMandatosDoVereador.php servem ISO-8859-1 cru (Content-Type: ...
// charset=ISO-8859-1) -- diferente de buscarProjetos.php/buscarLegislacoes.php,
// que escapam acentos em \uXXXX dentro do envelope JSON (por isso
// funcionam com qualquer encoding de transporte). Sem o
// `responseEncoding: 'latin1'` explícito nessas duas chamadas, nome de
// vereador vira mojibake -- mesma classe de bug já vista na Folha
// (folha-thread-http.js).

const ColetorBase = require('./base');
const logger = require('../logger');
const {
  upsertVereador,
  upsertMandato,
  upsertProjeto,
  upsertCamaraColetaLog,
} = require('../db/camara-repo');
const { extrairHtmlDaResposta, parseProjetos, parseVereadores, parseMandatos } = require('./camara-sgc');

const BASE_URL = 'https://ritapolis.mg.leg.br';
const PROJETOS_URL = `${BASE_URL}/ws_consulta/sgc/buscarProjetos.php`;
const VEREADORES_URL = `${BASE_URL}/ws_consulta/sgc/buscarVereadoresPelaBusca.php`;
const MANDATOS_URL = `${BASE_URL}/ws_consulta/sgc/buscarMandatosDoVereador.php`;

const FORM_HEADERS = { 'Content-Type': 'application/x-www-form-urlencoded' };
const MAX_PAGINAS = 2000; // mesma cautela de camara-legislacao.js: sem total exposto pela fonte

class ColetorCamaraProjetos extends ColetorBase {
  constructor() {
    super({ fonte: 'camara_projetos' });
  }

  async buscarProjetosPagina(pagina) {
    const payload = new URLSearchParams({
      INT_PAG: String(pagina),
      INT_TP_PRJT: '', INT_NUM_PRJT: '', INT_EXRC_PRJT: '', NM_PES: '',
      DESC_PRJT: '', TXT_PRJT: '', INT_ORIG_PRJT: '', INT_LOC_PRJT: '', ORDER_BY: '',
    }).toString();
    const response = await this.postComRetry(`${PROJETOS_URL}?DataHora=${Date.now()}`, payload, {
      responseType: 'text',
      headers: FORM_HEADERS,
    });
    return extrairHtmlDaResposta(response.data);
  }

  async buscarVereadores() {
    const payload = new URLSearchParams({ NM_PES: '', INT_PAG: '1', ORDER_BY: '' }).toString();
    const response = await this.postComRetry(`${VEREADORES_URL}?DataHora=${Date.now()}`, payload, {
      responseType: 'text',
      responseEncoding: 'latin1',
      headers: FORM_HEADERS,
    });
    return parseVereadores(response.data);
  }

  async buscarMandatos(intPes) {
    const payload = new URLSearchParams({ INT_PES: String(intPes) }).toString();
    const response = await this.postComRetry(`${MANDATOS_URL}?DataHora=${Date.now()}`, payload, {
      responseType: 'text',
      responseEncoding: 'latin1',
      headers: FORM_HEADERS,
    });
    return parseMandatos(response.data);
  }

  async coletarProjetos(resultado) {
    let registros = 0;
    let novos = 0;
    let atualizados = 0;

    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina += 1) {
      const html = await this.buscarProjetosPagina(pagina);
      const itens = parseProjetos(html);
      if (!itens.length) {
        break;
      }

      for (const item of itens) {
        try {
          const acao = upsertProjeto(item);
          registros += 1;
          if (acao === 'inserted') { novos += 1; } else if (acao === 'updated') { atualizados += 1; }
        } catch (err) {
          this.registrarErroItem(resultado, { tipo: 'projeto', intPrjt: item.intPrjt }, err);
        }
      }
    }

    resultado.itens_novos += novos;
    resultado.itens_atualizados += atualizados;
    upsertCamaraColetaLog({ tipo: 'projetos', registros, novos, atualizados, status: 'ok' });
    logger.info('camara-projetos: projetos coletados', { registros, novos, atualizados });
  }

  async coletarVereadores(resultado) {
    let registros = 0;
    let novos = 0;
    let atualizados = 0;

    const vereadores = await this.buscarVereadores();
    for (const v of vereadores) {
      try {
        const acao = upsertVereador(v);
        if (acao === 'inserted') { novos += 1; } else if (acao === 'updated') { atualizados += 1; }

        const mandatos = await this.buscarMandatos(v.intPes);
        for (const mandato of mandatos) {
          upsertMandato({ intPes: v.intPes, ...mandato });
        }
        registros += 1;
      } catch (err) {
        this.registrarErroItem(resultado, { tipo: 'vereador', intPes: v.intPes }, err);
      }
    }

    resultado.itens_novos += novos;
    resultado.itens_atualizados += atualizados;
    upsertCamaraColetaLog({ tipo: 'vereadores', registros, novos, atualizados, status: 'ok' });
    logger.info('camara-projetos: vereadores coletados', { registros, novos, atualizados });
  }

  async executar(resultado) {
    await this.coletarProjetos(resultado);
    await this.coletarVereadores(resultado);
  }
}

module.exports = ColetorCamaraProjetos;
