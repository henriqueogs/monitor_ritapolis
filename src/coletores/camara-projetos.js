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
const {
  extrairHtmlDaResposta,
  parseProjetos,
  parseVereadores,
  parseMandatos,
} = require('./camara-sgc');

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
      INT_TP_PRJT: '',
      INT_NUM_PRJT: '',
      INT_EXRC_PRJT: '',
      NM_PES: '',
      DESC_PRJT: '',
      TXT_PRJT: '',
      INT_ORIG_PRJT: '',
      INT_LOC_PRJT: '',
      ORDER_BY: '',
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
    if (this.progress?.load('projetos:complete')) {
      return;
    }
    const stats = this.progress?.load('projetos:stats') || { registros: 0, novos: 0, atualizados: 0 };

    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina += 1) {
      const itens = await this.checkpoint(`projetos:page:${pagina}`, async () =>
        parseProjetos(await this.buscarProjetosPagina(pagina)));
      if (!itens.length) {
        break;
      }

      for (const item of itens) {
        const step = `projetos:item:${this.calcularHash(JSON.stringify(item))}`;
        if (this.progress?.load(step)) {
          continue;
        }
        this.progress?.checkTime();
        try {
          const acao = upsertProjeto(item);
          stats.registros += 1;
          if (acao === 'inserted') {
            stats.novos += 1;
            resultado.itens_novos += 1;
          } else if (acao === 'updated') {
            stats.atualizados += 1;
            resultado.itens_atualizados += 1;
          } else if (acao === 'unchanged') {
            resultado.itens_sem_alteracao = (resultado.itens_sem_alteracao || 0) + 1;
          }
          this.progress?.save('projetos:stats', stats);
          this.completeItem(step, resultado);
        } catch (err) {
          this.registrarErroItem(resultado, { tipo: 'projeto', intPrjt: item.intPrjt }, err);
        }
      }
    }

    upsertCamaraColetaLog({ tipo: 'projetos', ...stats, status: 'ok' });
    this.progress?.save('projetos:complete', true);
    logger.info('camara-projetos: projetos coletados', stats);
  }

  async coletarVereadores(resultado) {
    if (this.progress?.load('vereadores:complete')) {
      return;
    }
    const stats = this.progress?.load('vereadores:stats') || { registros: 0, novos: 0, atualizados: 0 };

    const vereadores = await this.checkpoint('vereadores:list', () => this.buscarVereadores());
    for (const v of vereadores) {
      const step = `vereadores:item:${this.calcularHash(JSON.stringify(v))}`;
      if (this.progress?.load(step)) {
        continue;
      }
      this.progress?.checkTime();
      try {
        // Finish the network stage before canonical writes. A voluntary yield
        // while downloading mandates must not import/count the person twice.
        const mandatos = await this.checkpoint(`vereadores:mandatos:${v.intPes}`, () => this.buscarMandatos(v.intPes));
        const acao = upsertVereador(v);
        if (acao === 'inserted') {
          stats.novos += 1;
          resultado.itens_novos += 1;
        } else if (acao === 'updated') {
          stats.atualizados += 1;
          resultado.itens_atualizados += 1;
        } else if (acao === 'unchanged') {
          resultado.itens_sem_alteracao = (resultado.itens_sem_alteracao || 0) + 1;
        }

        for (const mandato of mandatos) {
          upsertMandato({ intPes: v.intPes, ...mandato });
        }
        stats.registros += 1;
        this.progress?.save('vereadores:stats', stats);
        this.completeItem(step, resultado);
      } catch (err) {
        this.registrarErroItem(resultado, { tipo: 'vereador', intPes: v.intPes }, err);
      }
    }

    upsertCamaraColetaLog({ tipo: 'vereadores', ...stats, status: 'ok' });
    this.progress?.save('vereadores:complete', true);
    logger.info('camara-projetos: vereadores coletados', stats);
  }

  async executar(resultado) {
    await this.coletarProjetos(resultado);
    await this.coletarVereadores(resultado);
  }
}

module.exports = ColetorCamaraProjetos;
